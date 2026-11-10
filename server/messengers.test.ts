import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { parseMessengerInput } from '../shared/messengers.ts';
import type { LoggedEvent, SessionInfo } from '../shared/protocol.ts';
import type { Trigger } from '../shared/triggers.ts';
import { buildAgentArgs } from './messenger-agent.ts';
import { matchByName, Messengers } from './messengers.ts';
import * as telegram from './telegram.ts';

let base: string;
before(() => { base = mkdtempSync(path.join(os.tmpdir(), 'office-messengers-')); });
after(() => rmSync(base, { recursive: true, force: true }));

const TOKEN = `123456:${'a'.repeat(35)}`;
const until = async (check: () => boolean) => {
  for (let tries = 0; tries < 200 && !check(); tries++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(check(), 'never happened');
};

/** A Telegram that queues the updates given and records every call. */
function fakeTelegram() {
  const calls: { method: string; body: Record<string, unknown>; id?: number }[] = [];
  const updates: telegram.TelegramUpdate[] = [];
  let id = 1;
  let messageId = 100;
  const api: typeof telegram = {
    ...telegram,
    call: (async (_token: string, method: string, body: Record<string, unknown> = {}) => {
      if (method === 'getUpdates') {
        await new Promise((resolve) => setTimeout(resolve, 2));
        return updates.splice(0);
      }
      if (method === 'getMe') { calls.push({ method, body }); return { username: 'office_bot' }; }
      calls.push({ method, body, id: ++messageId });
      return { message_id: messageId, chat: { id: 42 } };
    }) as typeof telegram.call,
    sendFile: async (_token, _chat, file) => { calls.push({ method: 'sendFile', body: { file } }); return { message_id: ++messageId, chat: { id: 42 } }; },
    download: async () => Buffer.from('bytes'),
  };
  const push = (update: Omit<telegram.TelegramUpdate, 'update_id'>) => updates.push({ update_id: id++, ...update });
  const message = (text: string, extra: Partial<telegram.TelegramMessage> = {}) => push({ message: { message_id: ++messageId, chat: { id: 42 }, text, ...extra } });
  return { api, calls, push, message, sent: (method: string) => calls.filter((each) => each.method === method) };
}

describe('the chat bots', () => {
  it('links a chat by its code, relays the waits with buttons, and syncs the answers both ways', async () => {
    const fake = fakeTelegram();
    const done: string[] = [];
    const session = {
      id: 's1', name: 'JD', cwd: '/work/pilou', state: 'perm', stateSince: 0, permissions: [{ requestId: 'r1', who: 'JD', tool: 'Bash', detail: 'git push', canAlways: true }],
    } as unknown as SessionInfo;
    const trigger = { id: 't1', name: 'Ticket Jira', messengers: [], notifyDone: true } as unknown as Trigger;
    const events: LoggedEvent[] = [];
    const messengers = new Messengers({
      file: path.join(base, 'messengers.json'), api: fake.api,
      sessions: () => [session], events: (_id, after) => events.filter((each) => each.seq > after), lastWords: () => 'Tests added.', triggers: () => [trigger],
      answer: (id, requestId, decision) => done.push(`answer ${id} ${requestId} ${decision}`),
      reply: (id, requestId, answers) => done.push(`reply ${id} ${requestId} ${JSON.stringify(answers)}`),
      send: (id, text, files) => done.push(`send ${id} ${text} ${files.join(',')}`),
      interrupt: (id) => done.push(`stop ${id}`), remote: (id) => done.push(`remote ${id}`),
      fire: async (id, payload) => { done.push(`fire ${id} ${payload}`); return { id: 'run1', triggerId: id, at: 0, source: 'manual', outcome: 'started', sessionId: 's2' }; },
      startSession: async () => session, folders: () => ['/work/pilou'], saveUpload: (name) => `0123456789abcdef/${name}`, attachment: () => null,
      agent: async (_bot, text) => ({ text: `agent: ${text}`, conversation: 'c1' }), onChange: () => {}, log: () => {},
    });
    try {
      assert.equal(messengers.save(undefined, { name: 'Phone', token: TOKEN, allSessions: true, model: '' }), true);
      if (process.platform !== 'win32') assert.equal(statSync(path.join(base, 'messengers.json')).mode & 0o777, 0o600);
      const [bot] = messengers.list();
      assert.ok(bot?.linkCode && !bot.linked);
      assert.ok(!JSON.stringify(messengers.list()).includes(TOKEN), 'the page never gets the token');
      fake.message('/start 000000');
      fake.message(`/start ${bot.linkCode}`);
      await until(() => messengers.list()[0]!.linked);
      assert.equal(messengers.list()[0]!.username, 'office_bot');

      await messengers.tick();
      const wait = fake.sent('sendMessage').find((each) => String(each.body.text).includes('git push'))!;
      const buttons = (wait.body.reply_markup as { inline_keyboard: telegram.Button[][] }).inline_keyboard[0]!;
      assert.deepEqual(buttons.map((button) => button.callback_data.split(':')[2]), ['allow', 'deny', 'always']);
      await messengers.tick();
      assert.equal(fake.sent('sendMessage').filter((each) => each.body === wait.body).length, 1, 'sent once');

      const waitId = wait.id!;
      fake.push({ callback_query: { id: 'cb1', data: buttons[0]!.callback_data, message: { message_id: waitId, chat: { id: 42 } } } });
      await until(() => done.includes('answer s1 r1 allow'));
      await until(() => fake.sent('editMessageText').length === 1);

      // answered in Open Space: the buttons go
      session.permissions = [{ requestId: 'r2', who: 'JD', tool: 'Write', detail: 'notes.md', canAlways: false }];
      await messengers.tick();
      session.permissions = [];
      await messengers.tick();
      assert.equal(fake.sent('editMessageText').length, 2);

      // a reply to one of its messages goes to its session
      fake.message('ajoute les tests', { reply_to_message: { message_id: waitId } });
      fake.message('/run ticket jira EX-12');
      fake.message('il en est où JD ?');
      await until(() => done.some((each) => each.startsWith('fire')) && fake.sent('sendMessage').some((each) => String(each.body.text).startsWith('agent:')));
      assert.ok(done.includes('fire t1 EX-12'));
      assert.ok(done.includes('send s1 ajoute les tests '), done.join('\n'));

      // it finished
      session.state = 'work';
      await messengers.tick();
      session.state = 'wait';
      await messengers.tick();
      assert.ok(fake.sent('sendMessage').some((each) => String(each.body.text).includes('Tests added.')));
    } finally {
      messengers.stop();
    }
  });

  it('matches what is typed on a phone to a name', () => {
    const triggers = [{ name: 'Ticket Jira assigné' }, { name: 'Récap du matin' }];
    assert.deepEqual(matchByName(triggers, (each) => each.name, 'ticket jira assigne EX-12'), { item: triggers[0], rest: 'EX-12' });
    assert.deepEqual(matchByName(triggers, (each) => each.name, 'recap'), { item: triggers[1], rest: '' });
    assert.equal(matchByName(triggers, (each) => each.name, 'nothing'), null);
    assert.deepEqual(telegram.parseCommand('/run@office_bot ticket EX-1'), ['run', 'ticket EX-1']);
    assert.equal(telegram.parseCommand('hello'), null);
  });

  it('checks a bot from the page, and gives its agent only Open Space\'s tools', () => {
    assert.ok('error' in parseMessengerInput({ name: 'Phone', token: 'nope', allSessions: false, model: '' }, true));
    assert.ok('error' in parseMessengerInput({ name: 'Phone', allSessions: false, model: '' }, true), 'a token to add one');
    assert.ok('input' in parseMessengerInput({ name: 'Phone', allSessions: false, model: '' }, false));
    const args = buildAgentArgs({ mcpUrl: 'http://127.0.0.1:1/mcp/messenger/b/k', model: '', conversation: 'c', resume: false, hidden: ['/data/secret'], text: 'hi' });
    assert.equal(args[args.indexOf('--allowedTools') + 1], 'mcp__open-space');
    assert.equal(args[args.indexOf('--model') + 1], 'haiku');
    assert.ok(args.includes('--strict-mcp-config'));
    assert.ok(args[args.indexOf('--disallowedTools') + 1]!.includes('Read(//data/secret)'));
  });
});
