import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import type { ModInfo } from '../shared/mods.ts';
import type { Preferences, SessionInfo } from '../shared/protocol.ts';
import { parseTriggerInput, type Trigger } from '../shared/triggers.ts';
import { ExternalKey, handleMcp, MCP_SETTINGS, openSpaceMcpConfig, sessionMcpKey, TOOLS, toolsFor, type Caller, type OpenSpaceApi } from './mcp.ts';
import { DEFAULT_PREFERENCES, parsePreferences } from './settings.ts';

const base = mkdtempSync(path.join(os.tmpdir(), 'mcp-'));
after(() => rmSync(base, { recursive: true, force: true }));

function fakeApi() {
  const triggers: Trigger[] = [];
  let preferences: Preferences = { ...DEFAULT_PREFERENCES };
  const crew: { name: string; jobs: string[] }[] = [];
  const sessions: { cwd: string; prompt: string; remote: boolean }[] = [];
  const done: string[] = [];
  const mods: ModInfo[] = [];
  const live = [{
    id: 's5', name: 'Hugo', cwd: '/work/app', state: 'perm', stateSince: 0, trigger: { id: 'abcdef1234', name: 'Jira' },
    permissions: [
      { requestId: 'r1', who: 'Hugo', tool: 'Bash', detail: 'npm install', canAlways: false },
      { requestId: 'r2', who: 'Hugo', tool: 'AskUserQuestion', detail: '', canAlways: false, questions: [{ question: 'Which?', header: 'Pick', options: [{ label: 'A', description: '' }], multiSelect: false }] },
      { requestId: 'r3', who: 'Hugo', tool: 'Bash', detail: 'Stripe', canAlways: false, secrets: ['STRIPE_KEY'] },
    ],
  }] as unknown as SessionInfo[];
  const api: OpenSpaceApi = {
    triggers: () => triggers,
    lastRuns: () => [],
    saveTrigger: async (id, raw) => {
      const parsed = parseTriggerInput(raw, id ? triggers.find((each) => each.id === id) : undefined);
      if ('error' in parsed) return parsed;
      const trigger = { ...parsed.input, id: id ?? 'abcdef1234', token: 'secret-token-'.repeat(4), createdAt: 1 };
      triggers.splice(0, triggers.length, ...triggers.filter((each) => each.id !== trigger.id), trigger);
      return { trigger };
    },
    runTrigger: async (id) => ({ id: 'run00001', triggerId: id, at: 1, source: 'agent', outcome: 'started', sessionId: 's2' }),
    startSession: async (options) => { sessions.push(options); return { id: 's9', name: 'Ada', cwd: options.cwd, permissionMode: 'auto' } as SessionInfo; },
    addMember: async (name, jobs) => { crew.push({ name, jobs }); },
    crew: () => crew as { name: string; jobs: never[] }[],
    roles: async () => [{ name: 'home-automation', description: 'Runs the house.', model: '' }],
    settings: () => preferences,
    changeSettings: async (changes) => { preferences = { ...preferences, ...parsePreferences(changes) }; },
    callerFolder: (caller) => ('session' in caller && caller.session === 's1' ? '/work/app' : null),
    sessions: () => live,
    lastWords: () => 'Plan ready.',
    send: (id, text) => { done.push(`send ${id} ${text}`); },
    answer: (id, requestId, decision) => { done.push(`answer ${id} ${requestId} ${decision}`); },
    reply: (id, requestId, answers) => { done.push(`reply ${id} ${requestId} ${JSON.stringify(answers)}`); },
    interrupt: (id) => { done.push(`stop ${id}`); },
    remote: (id, enabled) => { done.push(`remote ${id} ${enabled}`); },
    rename: (id, name) => { done.push(`rename ${id} ${name}`); },
    finish: (id) => { done.push(`finish ${id}`); },
    sendFile: async (bot, file) => { done.push(`file ${bot} ${file}`); },
    bots: () => [{ id: 'bot00001', name: 'iMD', username: 'imd_juyin_bot' }],
    mods: () => mods,
    createMod: async (request) => {
      const mod: ModInfo = { id: 'couts', name: 'couts', description: '', icon: 'puzzle', width: 380, height: 320, draft: true, refresh: 0, env: [], envSet: [], folder: '/mods/couts', url: '/mods/k/couts/', version: 0, unread: false };
      mods.push(mod);
      done.push(`mod ${request}`);
      return { mod, sessionId: 's9' };
    },
    editMod: async (id, request) => (mods.some((mod) => mod.id === id) ? (done.push(`change ${id} ${request}`), { sessionId: 's9' }) : null),
    deleteMod: async (id) => {
      const at = mods.findIndex((mod) => mod.id === id);
      if (at < 0) return false;
      mods.splice(at, 1);
      return true;
    },
  };
  return { api, triggers, sessions, crew, done, preferences: () => preferences };
}

const S1: Caller = { session: 's1' };
const EXTERNAL: Caller = { external: true };
const BOT: Caller = { messenger: 'bot00001' };

const call = async (api: OpenSpaceApi, method: string, params: Record<string, unknown> = {}, caller: Caller = S1) => {
  const reply = await handleMcp(api, caller, JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), '1.0.0');
  return reply.json as { result?: Record<string, unknown>; error?: { code: number } };
};
const tool = async (api: OpenSpaceApi, name: string, args: Record<string, unknown> = {}, caller: Caller = S1) => {
  const { result } = await call(api, 'tools/call', { name, arguments: args }, caller);
  const content = (result!.content as { text: string }[])[0].text;
  return { text: content, isError: result?.isError === true };
};

describe('the open-space MCP server', () => {
  it('lets the external program alone follow the sessions and answer them, never a request for keys', async () => {
    const { api, done } = fakeApi();
    const external = (await call(api, 'tools/list', {}, EXTERNAL)).result!.tools as { name: string }[];
    assert.equal(external.length, TOOLS.length - 3, 'all but send_file, for a chat, and what a session does to itself');
    assert.ok(external.every((each) => !('for' in each)));
    assert.ok(!toolsFor(S1).some((each) => ['list_sessions', 'send_message', 'answer_permission', 'stop_session'].includes(each.name)));
    assert.equal((await tool(api, 'answer_permission', { sessionId: 's5', requestId: 'r1', decision: 'allow' })).isError, true, 'a session cannot approve');
    const widened = { name: 'Push', prompt: 'Go', kind: 'cron', allowedTools: ['Bash(git push *)'] };
    assert.equal((await tool(api, 'create_trigger', widened)).isError, true, 'nor give a trigger rights');
    assert.equal((await tool(api, 'create_trigger', { ...widened, cwd: '/work/app' }, EXTERNAL)).isError, false);
    const listed = JSON.parse((await tool(api, 'list_sessions', {}, EXTERNAL)).text);
    assert.deepEqual(listed[0].waitsFor.map((each: { kind: string }) => each.kind), ['permission', 'question', 'keys']);
    assert.equal(listed[0].lastWords, 'Plan ready.');
    assert.equal(listed[0].trigger, 'Jira');
    assert.equal((await tool(api, 'answer_permission', { sessionId: 's5', requestId: 'r1', decision: 'always' }, EXTERNAL)).isError, true, 'no always without canAlways');
    await tool(api, 'answer_permission', { sessionId: 's5', requestId: 'r1', decision: 'allow' }, EXTERNAL);
    await tool(api, 'answer_permission', { sessionId: 's5', requestId: 'r2', answers: { 'Which?': 'A' } }, EXTERNAL);
    assert.equal((await tool(api, 'answer_permission', { sessionId: 's5', requestId: 'r3', decision: 'allow' }, EXTERNAL)).isError, true);
    await tool(api, 'send_message', { sessionId: 's5', text: 'Go' }, EXTERNAL);
    await tool(api, 'stop_session', { sessionId: 's5' }, EXTERNAL);
    assert.equal((await tool(api, 'stop_session', { sessionId: 'nope' }, EXTERNAL)).isError, true);
    assert.deepEqual(done, ['answer s5 r1 allow', 'reply s5 r2 {"Which?":"A"}', 'send s5 Go', 'stop s5']);
  });

  it('lets a messenger\'s agent follow, write to and stop the sessions, send files, but never answer them; a session send files too', async () => {
    const { api, done } = fakeApi();
    const names = toolsFor(BOT).map((each) => each.name);
    assert.ok(['list_sessions', 'send_message', 'stop_session', 'set_remote', 'send_file', 'create_session'].every((name) => names.includes(name)));
    assert.ok(!names.includes('answer_permission'));
    assert.equal((await tool(api, 'answer_permission', { sessionId: 's5', requestId: 'r1', decision: 'allow' }, BOT)).isError, true);
    assert.equal((await tool(api, 'create_trigger', { name: 'Push', prompt: 'Go', kind: 'cron', cwd: '/work/app', allowedTools: ['Edit'] }, BOT)).isError, true, 'nor give a trigger rights');
    await tool(api, 'set_remote', { sessionId: 's5', enabled: true }, BOT);
    await tool(api, 'send_file', { path: '/work/app/shot.png' }, BOT);
    await tool(api, 'send_file', { path: '/work/app/report.pdf' }, S1);
    await tool(api, 'send_file', { path: '/work/app/a.png', bot: '@imd_juyin_bot' }, S1);
    assert.match((await tool(api, 'send_file', { path: '/work/app/a.png', bot: 'Perso' }, S1)).text, /iMD/, 'an unknown bot names the known ones');
    assert.deepEqual(done, ['remote s5 true', 'file bot00001 /work/app/shot.png', 'file bot00001 /work/app/report.pdf', 'file bot00001 /work/app/a.png'], 'a session sends to the only bot, or the one named');
  });

  it('lets a session rename itself, and a trigger\'s run say it is done', async () => {
    const { api, done } = fakeApi();
    const RUN: Caller = { session: 's5' };
    assert.ok(toolsFor(S1).some((each) => each.name === 'finish_run'));
    assert.ok(!toolsFor(EXTERNAL).some((each) => ['rename_session', 'finish_run'].includes(each.name)));
    await tool(api, 'rename_session', { name: ' EX-1549 ' }, RUN);
    assert.equal((await tool(api, 'rename_session', { name: ' ' }, RUN)).isError, true);
    assert.equal((await tool(api, 'finish_run', {}, S1)).isError, true, 'not a run');
    assert.equal((await tool(api, 'finish_run', {}, RUN)).isError, false);
    assert.deepEqual(done, ['rename s5 EX-1549', 'finish s5']);
  });

  it('speaks MCP: initialize, tools/list, notifications without an answer, unknown methods', async () => {
    const { api } = fakeApi();
    const init = await call(api, 'initialize', { protocolVersion: '2025-06-18' });
    assert.equal(init.result?.protocolVersion, '2025-06-18');
    assert.deepEqual((init.result!.serverInfo as { name: string }).name, 'open-space');
    assert.equal((await call(api, 'initialize', { protocolVersion: '1999-01-01' })).result?.protocolVersion, '2025-06-18');
    const list = await call(api, 'tools/list');
    assert.deepEqual((list.result!.tools as { name: string }[]).map((each) => each.name), toolsFor(S1).map((each) => each.name));
    assert.deepEqual(await handleMcp(api, S1, JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), '1'), { status: 202, json: null });
    assert.equal((await call(api, 'resources/list')).error?.code, -32601);
    assert.equal((await handleMcp(api, S1, '{nope', '1')).status, 400);
  });

  it('creates a trigger in the calling session\'s folder, and never shows its webhook token', async () => {
    const { api, triggers } = fakeApi();
    const created = await tool(api, 'create_trigger', { name: 'Domotique', prompt: 'Check the house.', kind: 'webhook' });
    assert.equal(created.isError, false);
    assert.equal(triggers[0].cwd, '/work/app');
    assert.ok(!created.text.includes('secret-token'));
    assert.ok(!(await tool(api, 'list_triggers')).text.includes('secret-token'));
    const refused = await tool(api, 'create_trigger', { name: 'x', prompt: 'y', kind: 'cron', cron: '0 8 * * *', permissionMode: 'bypassPermissions' });
    assert.equal(refused.isError, true);
    const updated = await tool(api, 'update_trigger', { id: triggers[0].id, enabled: false });
    assert.equal(updated.isError, false);
    assert.equal(triggers[0].enabled, false);
    assert.equal(triggers[0].prompt, 'Check the house.', 'what is not given stays');
    assert.equal((await tool(api, 'update_trigger', { id: triggers[0].id, messengers: ['imd'] })).isError, false);
    assert.deepEqual(triggers[0].messengers, ['bot00001'], 'a bot is named as the user knows it');
    assert.match((await tool(api, 'list_triggers')).text, /"messengers": \[\s*"iMD"\s*\]/);
    assert.equal((await tool(api, 'update_trigger', { id: triggers[0].id, messengers: ['@IMD_juyin_bot'] })).isError, false);
    assert.match((await tool(api, 'update_trigger', { id: triggers[0].id, messengers: ['Perso'] })).text, /iMD/, 'an unknown bot names the known ones');
  });

  it('starts sessions, adds to the crew, lists roles', async () => {
    const { api, sessions, crew } = fakeApi();
    assert.equal((await tool(api, 'create_session', { prompt: 'Hello', remote: true }, EXTERNAL)).isError, false);
    assert.deepEqual(sessions[0], { cwd: '', prompt: 'Hello', remote: true });
    assert.equal((await tool(api, 'create_agent', { name: 'Domo', jobs: ['tech'] })).isError, false);
    assert.deepEqual(crew, [{ name: 'Domo', jobs: ['tech'] }]);
    assert.equal((await tool(api, 'create_agent', { name: ' ' })).isError, true);
    assert.match((await tool(api, 'list_roles')).text, /home-automation/);
    assert.equal((await tool(api, 'run_trigger', { id: 'abcdef1234' })).isError, false);
  });

  it('makes, changes and deletes mods', async () => {
    const { api, done } = fakeApi();
    assert.equal((await tool(api, 'create_mod', { request: ' ' })).isError, true);
    assert.match((await tool(api, 'create_mod', { request: 'my Claude costs' }, EXTERNAL)).text, /"sessionId": "s9"/);
    assert.match((await tool(api, 'list_mods')).text, /"id": "couts"/);
    assert.equal((await tool(api, 'update_mod', { id: 'couts', request: 'in euros' })).isError, false);
    assert.match((await tool(api, 'update_mod', { id: 'ventes', request: 'in euros' })).text, /couts/, 'an unknown mod names the known ones');
    assert.deepEqual(done, ['mod my Claude costs', 'change couts in euros']);
    assert.equal((await tool(api, 'delete_mod', { id: 'couts' })).isError, false);
    assert.equal((await tool(api, 'delete_mod', { id: 'couts' })).isError, true);
  });

  it('reads and changes the harmless settings only', async () => {
    const { api, preferences } = fakeApi();
    const shown = JSON.parse((await tool(api, 'get_settings')).text);
    // the language is left out until chosen
    assert.deepEqual(Object.keys(shown), MCP_SETTINGS.filter((key) => key !== 'language'));
    for (const key of ['roots', 'agentNote', 'permissionMode', 'automataFolder', 'claude', 'accountsBrowser', 'journalFolder']) assert.ok(!(MCP_SETTINGS as readonly string[]).includes(key), key);
    const refused = await tool(api, 'update_settings', { settings: { roots: ['/'], theme: 'space' } });
    assert.equal(refused.isError, true);
    assert.deepEqual(preferences().roots, []);
    assert.equal(preferences().theme, DEFAULT_PREFERENCES.theme, 'nothing changes when one key is refused');
    assert.equal((await tool(api, 'update_settings', { settings: { theme: 'space', festivals: false } })).isError, false);
    assert.equal(preferences().theme, 'space');
    assert.equal(preferences().festivals, false);
  });

  it('gives each session a key of its own, and keeps the external key private and revocable', () => {
    assert.notEqual(sessionMcpKey('secret', 's1'), sessionMcpKey('secret', 's2'));
    assert.deepEqual(JSON.parse(openSpaceMcpConfig('http://127.0.0.1:1/mcp/s1/k')), { mcpServers: { 'open-space': { type: 'http', url: 'http://127.0.0.1:1/mcp/s1/k' } } });
    const file = path.join(base, 'office', 'mcp-key');
    const key = new ExternalKey(file);
    assert.equal(key.current, null);
    const first = key.renew();
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(readFileSync(file, 'utf8').trim(), first);
    assert.equal(new ExternalKey(file).current, first);
    assert.notEqual(key.renew(), first);
    key.disable();
    assert.equal(new ExternalKey(file).current, null);
  });
});

