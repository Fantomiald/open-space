import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { parseMessengerInput } from '../shared/messengers.ts';
import type { LoggedEvent, PermissionPrompt, SessionInfo } from '../shared/protocol.ts';
import type { SecretEntry } from '../shared/secrets.ts';
import type { Trigger } from '../shared/triggers.ts';
import { st } from './i18n/index.ts';
import { buildAgentArgs } from './messenger-agent.ts';
import { matchByName, Messengers, type MessengersDeps, waitMessage } from './messengers.ts';
import * as telegram from './telegram.ts';

let base: string;
before(() => { base = mkdtempSync(path.join(os.tmpdir(), 'office-messengers-')); });
after(() => rmSync(base, { recursive: true, force: true }));

const TOKEN = `123456:${'a'.repeat(35)}`;
const until = async (check: () => boolean) => {
  for (let tries = 0; tries < 200 && !check(); tries++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(check(), 'never happened');
};

/** A Telegram that queues the updates given and records every call; the methods put in `failing` are refused. */
function fakeTelegram() {
  const calls: { method: string; body: Record<string, unknown>; id?: number }[] = [];
  const updates: telegram.TelegramUpdate[] = [];
  const failing = new Set<string>();
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
      if (failing.has(method)) throw new telegram.TelegramError(400, 'Bad Request: refused');
      return { message_id: messageId, chat: { id: 42 } };
    }) as typeof telegram.call,
    sendFile: async (_token, _chat, file) => { calls.push({ method: 'sendFile', body: { file } }); return { message_id: ++messageId, chat: { id: 42 } }; },
    download: async () => Buffer.from('bytes'),
  };
  const push = (update: Omit<telegram.TelegramUpdate, 'update_id'>) => updates.push({ update_id: id++, ...update });
  const message = (text: string, extra: Partial<telegram.TelegramMessage> = {}) => push({ message: { message_id: ++messageId, chat: { id: 42 }, text, ...extra } });
  return { api, calls, failing, push, message, sent: (method: string) => calls.filter((each) => each.method === method) };
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
      agent: async (_bot, text) => ({ text: `agent: ${text}`, conversation: 'c1' }), giveSecrets: () => [], onChange: () => {}, log: () => {},
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
      fake.message('/run ticket jira PROJ-12');
      fake.message('il en est où JD ?');
      await until(() => done.some((each) => each.startsWith('fire')) && fake.sent('sendMessage').some((each) => String(each.body.text).startsWith('agent:')));
      assert.ok(done.includes('fire t1 PROJ-12'));
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

  it('does not follow a session it started while Remote Control is on, unless told to', async () => {
    const fake = fakeTelegram();
    const session = { id: 's1', name: 'JD', cwd: '/work/pilou', state: 'work', stateSince: 0, permissions: [], turns: 0 } as unknown as SessionInfo;
    const messengers = new Messengers({
      file: path.join(base, 'messengers-follow.json'), api: fake.api,
      sessions: () => [session], events: () => [], lastWords: () => 'Done here.', triggers: () => [],
      answer: () => {}, reply: () => {}, send: () => {}, interrupt: () => {}, remote: () => {}, fire: async () => { throw new Error('unused'); },
      startSession: async () => session, folders: () => ['/work/pilou'], saveUpload: (name) => name, attachment: () => null,
      agent: async () => ({ text: '', conversation: null }), giveSecrets: () => [], onChange: () => {}, log: () => {},
    });
    const finish = async () => {
      const before = fake.sent('sendMessage').length;
      session.state = 'work';
      await messengers.tick();
      session.state = 'wait';
      await messengers.tick();
      return fake.sent('sendMessage').length > before;
    };
    const command = async (text: string) => {
      const before = fake.sent('sendMessage').length;
      fake.message(text);
      await until(() => fake.sent('sendMessage').length > before);
    };
    try {
      messengers.save(undefined, { name: 'Phone', token: TOKEN, allSessions: false, model: '' });
      fake.message(`/start ${messengers.list()[0]!.linkCode}`);
      await until(() => messengers.list()[0]!.linked);
      assert.ok(fake.sent('setMyCommands').some((each) => JSON.stringify(each.body).includes('"unfollow"')));

      await command('/new pilou do it');
      assert.equal(await finish(), true, 'started by the bot, no Remote Control: followed as before');

      session.remote = { url: 'https://claude.ai/code/x', state: 'connected' };
      assert.equal(await finish(), false, 'Remote Control on: the Claude app has it');
      session.remote = { url: '', state: 'failed' };
      assert.equal(await finish(), true, 'Remote Control failed: followed again');
      session.remote = undefined;
      session.remoteSession = 'cse_1';
      assert.equal(await finish(), false, 'Remote Control kept across a restart');

      await command('/follow jd');
      assert.equal(await finish(), true, '/follow overrides Remote Control');
      await command('/unfollow jd');
      assert.equal(await finish(), false, '/unfollow overrides the rest');
      session.remoteSession = undefined;
      assert.equal(await finish(), false, '/unfollow overrides having started it');
      await command('/follow jd');
      assert.equal(await finish(), true);
    } finally {
      messengers.stop();
    }
  });

  it('tells the end of a run it wrote to or answered from the chat, though its trigger keeps its ends quiet', async () => {
    const fake = fakeTelegram();
    const done: string[] = [];
    const run = (id: string, name: string) => ({ id, name, cwd: '/work/pilou', state: 'work', stateSince: 0, permissions: [], trigger: { id: 't1', name: 'Manager' } }) as unknown as SessionInfo;
    const asking = run('s1', 'JD');
    const failing = run('s2', 'Ana');
    const trigger = { id: 't1', name: 'Manager', messengers: [] as string[], notifyDone: false } as unknown as Trigger;
    const messengers = new Messengers({
      file: path.join(base, 'messengers-replied.json'), api: fake.api,
      sessions: () => [asking, failing], events: () => [], lastWords: (id) => `last words of ${id}`, triggers: () => [trigger],
      answer: () => {}, reply: (id, requestId, answers) => done.push(`reply ${id} ${requestId} ${JSON.stringify(answers)}`),
      send: (id, text) => done.push(`send ${id} ${text}`), interrupt: () => {}, remote: () => {}, fire: async () => { throw new Error('unused'); },
      startSession: async () => asking, folders: () => ['/work/pilou'], saveUpload: (name) => name, attachment: () => null,
      agent: async () => ({ text: '', conversation: null }), giveSecrets: () => [], onChange: () => {}, log: () => {},
    });
    const told = (id: string) => fake.sent('sendMessage').filter((each) => String(each.body.text).includes(`last words of ${id}`)).length;
    const turn = async (session: SessionInfo) => {
      session.state = 'work';
      await messengers.tick();
      session.state = 'wait';
      await messengers.tick();
    };
    try {
      messengers.save(undefined, { name: 'Phone', token: TOKEN, allSessions: false, model: '' });
      trigger.messengers.push(messengers.list()[0]!.id);
      fake.message(`/start ${messengers.list()[0]!.linkCode}`);
      await until(() => messengers.list()[0]!.linked);
      await messengers.tick();
      await turn(asking);
      await turn(failing);
      assert.deepEqual([told('s1'), told('s2')], [0, 0], 'Tell when done off: no end told');

      // a question answered with its button: the run's next answer is told
      asking.state = 'perm';
      asking.permissions = [{ requestId: 'q1', who: 'JD', tool: 'AskUserQuestion', detail: '', canAlways: false, questions: [{ question: 'Which ticket?', header: '', multiSelect: false, options: [{ label: 'PROJ-1', description: '' }, { label: 'PROJ-2', description: '' }] }] }];
      await messengers.tick();
      const question = fake.sent('sendMessage').find((each) => String(each.body.text).includes('Which ticket?'))!;
      const button = (question.body.reply_markup as { inline_keyboard: telegram.Button[][] }).inline_keyboard[0]![0]!;
      fake.push({ callback_query: { id: 'cb1', data: button.callback_data, message: { message_id: question.id!, chat: { id: 42 } } } });
      await until(() => done.includes('reply s1 q1 {"Which ticket?":"PROJ-1"}'));
      asking.permissions = [];
      await turn(asking);
      assert.equal(told('s1'), 1, 'answered from the chat: its end is told');

      // a reply to the notice of its error: the run's next answer is told
      failing.state = 'error';
      await messengers.tick();
      const failed = fake.sent('sendMessage').find((each) => each.body.text === st.messengers.failed('Ana'))!;
      fake.message('try again', { reply_to_message: { message_id: failed.id! } });
      await until(() => done.includes('send s2 try again'));
      await turn(failing);
      assert.equal(told('s2'), 1, 'written to from the chat: its end is told');
    } finally {
      messengers.stop();
    }
  });

  it('matches what is typed on a phone to a name', () => {
    const triggers = [{ name: 'Ticket Jira assigné' }, { name: 'Récap du matin' }];
    assert.deepEqual(matchByName(triggers, (each) => each.name, 'ticket jira assigne PROJ-12'), { item: triggers[0], rest: 'PROJ-12' });
    assert.deepEqual(matchByName(triggers, (each) => each.name, 'recap'), { item: triggers[1], rest: '' });
    assert.equal(matchByName(triggers, (each) => each.name, 'nothing'), null);
    assert.deepEqual(telegram.parseCommand('/run@office_bot ticket PROJ-1'), ['run', 'ticket PROJ-1']);
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

describe('keys given by replying to the bot', () => {
  const WHY = 'to deploy the preview';
  const VALUE = 'made-up-value-7f3a';
  const ask = (secrets: string[]): PermissionPrompt => ({ requestId: 'k1', who: 'chef', tool: 'os-secret', detail: WHY, canAlways: false, secrets });

  /** A linked bot following a session that waits for the keys `names`, with all that leaves the bot recorded. `kept`: what the key store keeps. */
  async function keyWait(file: string, names: string[], kept = (entries: readonly SecretEntry[]) => entries.map((entry) => entry.name)) {
    const fake = fakeTelegram();
    const given: { sessionId: string; requestId: string; entries: SecretEntry[] }[] = [];
    const elsewhere: string[] = [];
    const session = { id: 's1', name: 'JD', cwd: '/work/pilou', state: 'perm', stateSince: 0, permissions: [ask(names)] } as unknown as SessionInfo;
    const deps: MessengersDeps = {
      file: path.join(base, file), api: fake.api,
      sessions: () => [session], events: () => [], lastWords: () => '', triggers: () => [],
      answer: () => {}, reply: () => {}, interrupt: () => {}, remote: () => {}, fire: async () => { throw new Error('unused'); },
      send: (_id, text) => elsewhere.push(`send ${text}`),
      startSession: async () => session, folders: () => ['/work/pilou'], attachment: () => null,
      saveUpload: (name) => { elsewhere.push(`upload ${name}`); return name; },
      agent: async (_bot, text) => { elsewhere.push(`agent ${text}`); return { text: 'agent', conversation: null }; },
      giveSecrets: (sessionId, requestId, entries) => {
        given.push({ sessionId, requestId, entries: [...entries] });
        const names = kept(entries);
        // the box closes once a key is kept, as in Open Space
        if (names.length) session.permissions = [];
        return names;
      },
      onChange: () => {}, log: (message, error) => elsewhere.push(`log ${message} ${String(error)}`),
    };
    const messengers = new Messengers(deps);
    messengers.save(undefined, { name: 'Phone', token: TOKEN, allSessions: true, model: '' });
    const link = async () => {
      fake.message(`/start ${messengers.list()[0]!.linkCode}`);
      await until(() => messengers.list()[0]!.linked);
      await messengers.tick();
      const found = fake.sent('sendMessage').find((each) => String(each.body.text).includes(WHY));
      assert.ok(found?.id, 'the wait is sent');
      return found;
    };
    // on a failure here, the bot would keep polling and the test file never end
    const request = await link().catch((error: unknown) => { messengers.stop(); throw error; });
    /** replies to the request (message 900 unless `extra` says), then waits for the bot to answer */
    const reply = async (text: string, extra: Partial<telegram.TelegramMessage> = {}) => {
      const answers = () => fake.sent('sendMessage').length + fake.sent('editMessageText').length;
      const before = answers();
      fake.message(text, { message_id: 900, reply_to_message: { message_id: request.id! }, ...extra });
      await until(() => answers() > before);
    };
    /** whether `value` reached a call to Telegram (the bot's messages included) */
    const leaked = (value: string) => fake.calls.some((each) => JSON.stringify(each.body).includes(value));
    return { fake, given, elsewhere, session, messengers, deps, request, reply, leaked };
  }

  it('names the keys asked and what they are for, without buttons', () => {
    const session = { name: 'JD' } as SessionInfo;
    const one = waitMessage(session, ask(['GEMINI_API_KEY']), 1);
    assert.ok(one.text.includes('GEMINI_API_KEY') && one.text.includes(WHY), one.text);
    assert.deepEqual(one.buttons, []);
    const two = waitMessage(session, ask(['GEMINI_API_KEY', 'STRIPE_KEY']), 2);
    assert.ok(two.text.indexOf('GEMINI_API_KEY') < two.text.indexOf('STRIPE_KEY') && two.text.includes(WHY), two.text);
    assert.notEqual(two.text.replace('GEMINI_API_KEY, STRIPE_KEY', ''), one.text.replace('GEMINI_API_KEY', ''), 'several keys: one value per line');
  });

  it('gives a value replied to the request to the session\'s keys, deletes it from the chat, and tells no one else', async () => {
    const { fake, given, elsewhere, messengers, request, reply, leaked } = await keyWait('keys-one.json', ['GEMINI_API_KEY']);
    try {
      assert.equal(request.body.reply_markup, undefined);
      await reply(`  ${VALUE}  `);
      assert.deepEqual(given, [{ sessionId: 's1', requestId: 'k1', entries: [{ name: 'GEMINI_API_KEY', value: VALUE }] }]);
      assert.deepEqual(fake.sent('deleteMessage').map((each) => each.body), [{ chat_id: 42, message_id: 900 }]);
      assert.deepEqual(elsewhere, [], 'neither the session, nor the agent, nor the log');
      assert.equal(leaked(VALUE), false);
      const settled = fake.sent('editMessageText');
      assert.equal(settled.length, 1);
      assert.equal(settled[0]!.body.message_id, request.id);
      assert.ok(String(settled[0]!.body.text).endsWith(st.messengers.keysGiven(['GEMINI_API_KEY'], [])));
      await messengers.tick();
      assert.equal(fake.sent('editMessageText').length, 1, 'settled once');
    } finally {
      messengers.stop();
    }
  });

  it('takes several keys one per line, in the order asked', async () => {
    const { given, elsewhere, messengers, reply, leaked } = await keyWait('keys-two.json', ['GEMINI_API_KEY', 'STRIPE_KEY']);
    try {
      await reply('made-up-gemini\n\n  made-up-stripe \n');
      assert.deepEqual(given[0]?.entries, [{ name: 'GEMINI_API_KEY', value: 'made-up-gemini' }, { name: 'STRIPE_KEY', value: 'made-up-stripe' }]);
      assert.deepEqual(elsewhere, []);
      assert.equal(leaked('made-up-gemini') || leaked('made-up-stripe'), false);
    } finally {
      messengers.stop();
    }
  });

  it('keeps nothing when the lines are not as many as the keys, and still deletes the message', async () => {
    const { fake, given, elsewhere, messengers, request, reply, leaked } = await keyWait('keys-count.json', ['GEMINI_API_KEY', 'STRIPE_KEY']);
    try {
      await reply(VALUE);
      assert.deepEqual(given, []);
      assert.deepEqual(fake.sent('deleteMessage').map((each) => each.body.message_id), [900]);
      const told = fake.sent('sendMessage').at(-1)!;
      assert.equal(told.body.text, st.messengers.keyCount(2));
      // an answer to the user's message would quote the value
      assert.deepEqual(told.body.reply_parameters, { message_id: request.id, allow_sending_without_reply: true });
      assert.deepEqual(elsewhere, []);
      assert.equal(leaked(VALUE), false);
    } finally {
      messengers.stop();
    }
  });

  it('deletes a reply that comes once the key is no longer awaited, and passes it to no one', async () => {
    const { fake, given, elsewhere, session, messengers, reply, leaked } = await keyWait('keys-gone.json', ['GEMINI_API_KEY']);
    try {
      // given in Open Space, before the bot looked again
      session.permissions = [];
      await reply(VALUE);
      // and once the bot has settled its message
      await messengers.tick();
      await reply('made-up-later', { message_id: 901 });
      assert.deepEqual(given, []);
      assert.deepEqual(fake.sent('deleteMessage').map((each) => each.body.message_id), [900, 901]);
      assert.deepEqual(fake.sent('sendMessage').slice(-2).map((each) => each.body.text), [st.messengers.keyGone, st.messengers.keyGone]);
      assert.deepEqual(elsewhere, [], 'not routed to the session');
      assert.equal(leaked(VALUE) || leaked('made-up-later'), false);
    } finally {
      messengers.stop();
    }
  });

  it('deletes a reply to a request sent before Open Space restarted, and passes it to no one', async () => {
    const { fake, given, elsewhere, session, messengers, deps, reply, leaked } = await keyWait('keys-restart.json', ['GEMINI_API_KEY']);
    messengers.stop();
    // the old poll ends its last getUpdates, or it would take the reply
    await new Promise((resolve) => setTimeout(resolve, 20));
    // the session that waited is gone with the restart
    session.permissions = [];
    const restarted = new Messengers(deps);
    restarted.start();
    try {
      await reply(VALUE);
      assert.deepEqual(given, []);
      await until(() => fake.sent('deleteMessage').length > 0);
      assert.deepEqual(fake.sent('deleteMessage').map((each) => each.body.message_id), [900]);
      assert.equal(fake.sent('sendMessage').at(-1)!.body.text, st.messengers.keyGone);
      assert.deepEqual(elsewhere, [], 'not passed to the agent');
      assert.equal(leaked(VALUE), false);
    } finally {
      restarted.stop();
    }
  });

  it('asks the user to delete the reply when Telegram does not let the bot', async () => {
    const { fake, given, messengers, reply, leaked } = await keyWait('keys-undeleted.json', ['GEMINI_API_KEY']);
    try {
      fake.failing.add('deleteMessage');
      await reply(VALUE);
      await until(() => fake.sent('sendMessage').some((each) => each.body.text === st.messengers.keyNotDeleted));
      assert.equal(given.length, 1, 'the key is kept all the same');
      assert.equal(leaked(VALUE), false);
    } finally {
      messengers.stop();
    }
  });

  it('keeps a command replied to the request a command', async () => {
    const { fake, given, messengers, reply } = await keyWait('keys-command.json', ['GEMINI_API_KEY']);
    try {
      await reply('/sessions');
      assert.deepEqual(given, []);
      assert.equal(fake.sent('deleteMessage').length, 0);
      assert.ok(String(fake.sent('sendMessage').at(-1)!.body.text).startsWith('JD · '));
    } finally {
      messengers.stop();
    }
  });

  it('says a key was refused without repeating it, and that a file is no key', async () => {
    const { fake, given, elsewhere, messengers, reply, leaked } = await keyWait('keys-refused.json', ['GEMINI_API_KEY'], () => []);
    try {
      await reply(VALUE);
      assert.equal(given.length, 1);
      assert.equal(fake.sent('sendMessage').at(-1)!.body.text, st.messengers.keyRefused);
      await reply('', { message_id: 901, photo: [{ file_id: 'f1' }] });
      assert.equal(fake.sent('sendMessage').at(-1)!.body.text, st.messengers.keyAsText);
      assert.equal(given.length, 1);
      assert.deepEqual(fake.sent('deleteMessage').map((each) => each.body.message_id), [900, 901]);
      assert.deepEqual(elsewhere, [], 'the file is not kept either');
      assert.equal(leaked(VALUE), false);
    } finally {
      messengers.stop();
    }
  });
});
