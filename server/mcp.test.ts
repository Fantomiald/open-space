import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import type { ModInfo } from '../shared/mods.ts';
import { PM_TOOL_NAMES, PM_TOOL_USAGE } from '../shared/pm.ts';
import type { Preferences, SessionInfo } from '../shared/protocol.ts';
import { parseTriggerInput, type Trigger } from '../shared/triggers.ts';
import { ExternalKey, handleMcp, MCP_SETTINGS, openSpaceMcpConfig, sessionMcpKey, TOOLS, toolsFor, type Caller, type OpenSpaceApi } from './mcp.ts';
import { setServerLanguage, st } from './i18n/index.ts';
import type { Json } from './json.ts';
import { PmBook } from './pm.ts';
import { PM_TOOLS } from './pm-tools.ts';
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
    deleteTrigger: async (id) => {
      const at = triggers.findIndex((each) => each.id === id);
      if (at < 0) return false;
      triggers.splice(at, 1);
      return true;
    },
    runTrigger: async (id) => ({ id: 'run00001', triggerId: id, at: 1, source: 'agent', outcome: 'started', sessionId: 's2' }),
    startSession: async (options) => { sessions.push(options); return { id: 's9', name: 'Ada', cwd: options.cwd, permissionMode: 'auto' } as SessionInfo; },
    addMember: async (name, jobs) => { crew.push({ name, jobs }); },
    crew: () => crew as { name: string; jobs: never[] }[],
    roles: async () => [{ name: 'home-automation', description: 'Runs the house.', model: '' }],
    settings: () => preferences,
    changeSettings: async (changes) => { preferences = { ...preferences, ...parsePreferences(changes) }; },
    saveDashboards: async (dashboards) => { preferences = { ...preferences, dashboards }; },
    callerFolder: (caller) => ('session' in caller && caller.session === 's1' ? '/work/app' : null),
    sessions: () => live,
    lastWords: () => 'Plan ready.',
    send: (id, text) => { done.push(`send ${id} ${text}`); },
    answer: (id, requestId, decision) => { done.push(`answer ${id} ${requestId} ${decision}`); },
    reply: (id, requestId, answers) => { done.push(`reply ${id} ${requestId} ${JSON.stringify(answers)}`); },
    interrupt: (id) => { done.push(`stop ${id}`); },
    rest: async (id) => { done.push(`rest ${id}`); },
    remote: (id, enabled) => { done.push(`remote ${id} ${enabled}`); },
    rename: (id, name) => { done.push(`rename ${id} ${name}`); },
    setPending: (id, items) => { done.push(`pending ${id} ${JSON.stringify(items)}`); return []; },
    finish: (id) => { done.push(`finish ${id}`); },
    switchBrowser: (id, browser) => { done.push(`browser ${id} ${browser}`); return browser === 'shared' ? 'same' : 'switching'; },
    sendFile: async (bot, file) => { done.push(`file ${bot} ${file}`); },
    bots: () => [{ id: 'bot00001', name: 'iMD', username: 'imd_juyin_bot' }],
    mods: () => mods,
    modGuide: () => '# the rules',
    createMod: async (request, bySession) => {
      const mod: ModInfo = { id: 'couts', name: 'couts', description: '', icon: 'puzzle', width: 380, height: 320, draft: true, refresh: 0, env: [], envSet: [], folder: '/mods/couts', url: '/mods/k/couts/', version: 0, unread: false, trigger: null, refreshTrigger: null };
      if (!mods.some((each) => each.id === mod.id)) mods.push(mod);
      done.push(`mod ${request}${bySession ? '' : ' by the caller'}`);
      return { mod, sessionId: bySession ? 's9' : null };
    },
    editMod: async (id, request) => {
      if (!mods.some((mod) => mod.id === id)) return null;
      done.push(`change ${id} ${request}`);
      return { sessionId: 's9' };
    },
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
    assert.equal(external.length, TOOLS.length - 5, 'all but send_file, for a chat, and what a session does to itself');
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
    const stopped = await tool(api, 'stop_session', { sessionId: 's5' }, EXTERNAL);
    assert.match(stopped.text, /keeps its place.*rest_session/);
    assert.equal((await tool(api, 'stop_session', { sessionId: 'nope' }, EXTERNAL)).isError, true);
    await tool(api, 'rest_session', { sessionId: 's5' }, EXTERNAL);
    assert.equal((await tool(api, 'rest_session', { sessionId: 'nope' }, EXTERNAL)).isError, true);
    assert.deepEqual(done, ['answer s5 r1 allow', 'reply s5 r2 {"Which?":"A"}', 'send s5 Go', 'stop s5', 'rest s5']);
  });

  it('gives rest_session to those who follow the sessions, never to a session', () => {
    assert.ok(toolsFor(EXTERNAL).some((each) => each.name === 'rest_session'));
    assert.ok(toolsFor(BOT).some((each) => each.name === 'rest_session'));
    assert.ok(!toolsFor(S1).some((each) => each.name === 'rest_session'));
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

  it('lets a session switch its own browser, never a trigger\'s', async () => {
    const { api, done } = fakeApi();
    assert.ok(toolsFor(S1).some((each) => each.name === 'switch_browser'));
    assert.ok(!toolsFor(EXTERNAL).some((each) => each.name === 'switch_browser'));
    assert.ok(!toolsFor(BOT).some((each) => each.name === 'switch_browser'));
    assert.match((await tool(api, 'switch_browser', { browser: 'chrome', reason: 'tz-arcade' }, S1)).text, /tour/);
    assert.equal((await tool(api, 'switch_browser', { browser: 'shared', reason: 'x' }, S1)).isError, false);
    assert.equal((await tool(api, 'switch_browser', { browser: 'firefox', reason: 'x' }, S1)).isError, true);
    await tool(api, 'switch_browser', {}, S1);
    assert.deepEqual(done, ['browser s1 chrome', 'browser s1 shared', 'browser s1 chrome'], 'without arguments: the user\'s Chrome');
    assert.equal((await tool(api, 'create_trigger', { name: 'Arcade', prompt: '/tz-arcade', kind: 'cron', browser: 'chrome' }, S1)).isError, true, 'a session never puts a run on the user\'s Chrome');
    assert.equal((await tool(api, 'create_trigger', { name: 'Arcade', prompt: '/tz-arcade', kind: 'cron', cwd: '/work/app', browser: 'chrome' }, EXTERNAL)).isError, false);
  });

  it('lets a session set what a trigger\'s runs start without, since it only takes away', async () => {
    const { api, triggers } = fakeApi();
    const restrict = { plugins: ['*'], mcpServers: ['github'], claudeMd: ['/tmp/work/CLAUDE.md'], autoMemoryOff: true };
    assert.equal((await tool(api, 'create_trigger', { name: 'Lean', prompt: 'Go', kind: 'cron', restrict }, S1)).isError, false);
    assert.deepEqual(triggers[0].restrict, restrict);
    assert.equal((await tool(api, 'update_trigger', { id: triggers[0].id, restrict: { mcpServers: [] } }, S1)).isError, false);
    assert.deepEqual(triggers[0].restrict, { ...restrict, mcpServers: [] }, 'only the keys given change');
    assert.match(JSON.parse((await tool(api, 'list_triggers', {}, S1)).text)[0].restrict.plugins[0], /^\*$/);
    const own = await tool(api, 'update_trigger', { id: triggers[0].id, restrict: { mcpServers: ['open-space'] } }, S1);
    assert.equal(own.isError, true, 'never a server Open Space gives its sessions');
    assert.match(own.text, /Open Space/);
    assert.equal((await tool(api, 'update_trigger', { id: triggers[0].id, restrict: { plugin: ['x@y'] } }, S1)).isError, true, 'a key it does not know is refused, not ignored');
  });

  it('keeps the user\'s own CLAUDE.md files in a session\'s triggers, and lets the external program leave them out', async () => {
    const { api, triggers } = fakeApi();
    const userRules = path.join(os.homedir(), '.claude', 'CLAUDE.md');
    for (const claudeMd of [[userRules], [path.join(os.homedir(), '.claude', 'rules', 'git.md')], ['**/CLAUDE.md'], ['/tmp/work/*/CLAUDE.md']]) {
      const refused = await tool(api, 'create_trigger', { name: 'Lean', prompt: 'Go', kind: 'cron', restrict: { claudeMd } }, S1);
      assert.equal(refused.isError, true, JSON.stringify(claudeMd));
      assert.match(refused.text, /~\/\.claude/);
    }
    assert.equal(triggers.length, 0);
    assert.equal((await tool(api, 'create_trigger', { name: 'Lean', prompt: 'Go', kind: 'cron', restrict: { claudeMd: ['/tmp/work/CLAUDE.md'] } }, S1)).isError, false, 'a project file by its path');
    assert.equal((await tool(api, 'update_trigger', { id: triggers[0].id, restrict: { claudeMd: [userRules] } }, S1)).isError, true);
    assert.equal((await tool(api, 'create_trigger', { name: 'Team', prompt: 'Go', kind: 'cron', cwd: '/work/app', restrict: { claudeMd: [userRules, '**/legacy/CLAUDE.md'] } }, EXTERNAL)).isError, false);
  });

  it('lets a session rename itself, and a trigger\'s run say it is done', async () => {
    const { api, done } = fakeApi();
    const RUN: Caller = { session: 's5' };
    assert.ok(toolsFor(S1).some((each) => each.name === 'finish_run'));
    assert.ok(!toolsFor(EXTERNAL).some((each) => ['rename_session', 'finish_run'].includes(each.name)));
    await tool(api, 'rename_session', { name: ' PROJ-1549 ' }, RUN);
    assert.equal((await tool(api, 'rename_session', { name: ' ' }, RUN)).isError, true);
    assert.equal((await tool(api, 'finish_run', {}, S1)).isError, true, 'not a run');
    assert.equal((await tool(api, 'finish_run', {}, RUN)).isError, false);
    assert.deepEqual(done, ['rename s5 PROJ-1549', 'finish s5']);
  });

  it('lets a session say what it leaves pending, and nobody else', async () => {
    const { api, done } = fakeApi();
    assert.ok(!toolsFor(EXTERNAL).some((each) => each.name === 'set_pending'));
    await tool(api, 'set_pending', { items: ['Pas poussé', ' '] }, S1);
    await tool(api, 'set_pending', { items: [] }, S1);
    assert.equal((await tool(api, 'set_pending', { items: ['x'] }, EXTERNAL)).isError, true);
    assert.deepEqual(done, ['pending s1 ["Pas poussé"," "]', 'pending s1 []']);
    const told = await tool({ ...api, setPending: () => ['PR à ouvrir'] }, 'set_pending', { items: ['PR à ouvrir'] }, S1);
    assert.match(JSON.stringify(told), /the user removed them/);
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
    assert.equal((await tool(api, 'delete_trigger', { id: triggers[0].id })).isError, false);
    assert.equal(triggers.length, 0);
    assert.equal((await tool(api, 'delete_trigger', { id: 'abcdef1234' })).isError, true);
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
    const self = (await tool(api, 'create_mod', { request: 'my list' })).text;
    assert.match(self, /"folder": "\/mods\/couts"/);
    assert.match(self, /# the rules/, 'a session gets the rules and writes it itself');
    assert.doesNotMatch(self, /sessionId/);
    assert.match((await tool(api, 'create_mod', { request: 'my tasks', build: 'session' })).text, /"sessionId": "s9"/);
    assert.match((await tool(api, 'list_mods')).text, /"id": "couts"/);
    assert.equal((await tool(api, 'update_mod', { id: 'couts', request: 'in euros' })).isError, false);
    assert.match((await tool(api, 'update_mod', { id: 'ventes', request: 'in euros' })).text, /couts/, 'an unknown mod names the known ones');
    assert.deepEqual(done, ['mod my Claude costs', 'mod my list by the caller', 'mod my tasks', 'change couts in euros']);
    assert.equal((await tool(api, 'delete_mod', { id: 'couts' })).isError, false);
    assert.equal((await tool(api, 'delete_mod', { id: 'couts' })).isError, true);
  });

  it('lays out dashboards of mods for an agent', async () => {
    const { api, preferences } = fakeApi();
    await tool(api, 'create_mod', { request: 'my Claude costs', build: 'session' });
    assert.match((await tool(api, 'save_dashboard', { tiles: [{ mod: 'couts' }] })).text, /nom|name/i, 'a new one needs a name');
    assert.match((await tool(api, 'save_dashboard', { name: 'Apps', tiles: [{ mod: 'ventes' }] })).text, /ventes.*couts/s, 'an unknown mod names the known ones');
    const saved = JSON.parse((await tool(api, 'save_dashboard', { name: ' Mes  apps ', tiles: [{ mod: 'couts', x: 20, w: 6 }] })).text);
    assert.equal(saved.name, 'Mes apps');
    assert.deepEqual(saved.tiles, [{ mod: 'couts', x: 6, y: 0, w: 6, h: 9 }]);
    assert.equal((await tool(api, 'save_dashboard', { id: saved.id, tiles: [{ mod: 'couts' }] })).isError, false);
    assert.deepEqual(preferences().dashboards?.map((each) => [each.name, each.tiles[0]?.x]), [['Mes apps', 0]]);
    assert.match((await tool(api, 'list_dashboards')).text, /"name": "couts"/);
    assert.equal((await tool(api, 'delete_dashboard', { id: saved.id })).isError, false);
    assert.deepEqual(preferences().dashboards, []);
    assert.equal((await tool(api, 'delete_dashboard', { id: saved.id })).isError, true);
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


/**
 * fakeApi with project managers s1 and s7 (while `on`); workers start in /work only, each PM file in a fresh folder. `starts`:
 * the folders startWorker was asked for, refused or not.
 */
function pmFake() {
  const fake = fakeApi();
  const dir = mkdtempSync(path.join(base, 'pm-'));
  const book = new PmBook(dir);
  const session = (id: string, cwd: string, more: object = {}) => ({ id, name: id.toUpperCase(), cwd, state: 'wait', stateSince: 0, permissions: [], ...more });
  const live = [
    ...fake.api.sessions(),
    session('s1', '/work/app', { pm: true, state: 'work' }),
    session('s2', '/work/app'),
    session('s6', '/work/other'),
    session('s7', '/work/app', { pm: true }),
    session('s8', '/work/app', { pmOf: 's7' }),
  ] as unknown as SessionInfo[];
  const find = (id: string) => live.find((each) => each.id === id);
  const starts: string[] = [];
  let on = true;
  const api: OpenSpaceApi = {
    ...fake.api,
    sessions: () => live,
    pm: {
      isPm: (id) => on && find(id)?.pm === true,
      book,
      now: () => 1000,
      startWorker: async (pm, options) => {
        const cwd = options.cwd ?? '/work/app';
        starts.push(cwd);
        if (!cwd.startsWith('/work/')) throw new Error('not an allowed folder');
        // named like any session started without a name: someone of the crew
        const worker = session(`w${live.length}`, cwd, { name: `Crew ${live.length}`, pmOf: pm, state: 'work' }) as unknown as SessionInfo;
        live.push(worker);
        return worker;
      },
      stopWorker: (id) => { fake.done.push(`stopWorker ${id}`); },
      claimWorker: (id, pm) => {
        const found = find(id);
        if (!found || (found.pmOf && found.pmOf !== pm)) return false;
        found.pmOf = pm;
        return true;
      },
      releaseWorker: (id, pm) => {
        const found = find(id);
        if (found?.pmOf === pm) found.pmOf = undefined;
      },
    },
  };
  return { ...fake, api, book, dir, find, starts, turnOff: () => { on = false; } };
}

const PM: Caller = { session: 's1' };
const OTHER_PM: Caller = { session: 's7' };
const json = async (api: OpenSpaceApi, name: string, args: Record<string, unknown> = {}) => {
  const reply = await tool(api, name, args, PM);
  assert.equal(reply.isError, false, reply.text);
  return JSON.parse(reply.text);
};
const blocks = async (api: OpenSpaceApi, name: string, args: Record<string, unknown> = {}) => (await call(api, 'tools/call', { name, arguments: args }, PM)).result!;

describe('the pm_* tools of the open-space MCP server', () => {
  it('are listed for a PM session only, never for another caller', async () => {
    const isPmTool = (each: { name: string }) => each.name.startsWith('pm_');
    assert.ok(!toolsFor(S1, false).some(isPmTool));
    assert.deepEqual(toolsFor(S1, true).filter(isPmTool).map((each) => each.name).sort(), [...PM_TOOL_NAMES].sort());
    assert.ok(!toolsFor(EXTERNAL, true).some(isPmTool));
    assert.ok(!toolsFor(BOT, true).some(isPmTool));
    const { api, turnOff } = pmFake();
    const listed = async () => ((await call(api, 'tools/list', {}, PM)).result!.tools as { name: string }[]).some(isPmTool);
    assert.equal(await listed(), true);
    turnOff();
    assert.equal(await listed(), false, 'the setting turned off');
  });

  it('refuses them to a session that is not a PM and to other callers, writing nothing', async () => {
    const { api, dir, turnOff } = pmFake();
    for (const caller of [{ session: 's6' }, EXTERNAL, BOT]) assert.equal((await tool(api, 'pm_item_add', { title: 'Ship' }, caller)).isError, true, JSON.stringify(caller));
    turnOff();
    assert.equal((await tool(api, 'pm_item_add', { title: 'Ship' }, PM)).isError, true, 'the setting turned off');
    assert.equal((await tool(api, 'pm_status', {}, PM)).isError, true);
    assert.deepEqual(readdirSync(dir), []);
  });

  it('numbers tasks and questions in order', async () => {
    const { api } = pmFake();
    assert.equal((await json(api, 'pm_item_add', { title: 'Ship the app' })).item, 'W1');
    assert.equal((await json(api, 'pm_ask', { title: 'Which phone?', detail: 'iPhone, Android or both', answers: ['iPhone', 'Both'], recommended: 'Both' })).ask, 'Q1');
    assert.equal((await json(api, 'pm_ask', { item: 'W1', title: 'When?', detail: 'Before or after the release' })).ask, 'Q2');
  });

  // Review Focus 4
  it('writes to, reads and stops its own workers only', async () => {
    const { api, book, done } = pmFake();
    const { session: worker } = await json(api, 'pm_worker_start', { brief: 'Fix the login.' });
    for (const target of ['s5', 'nope', 's1', 's8']) {
      assert.equal((await tool(api, 'pm_worker_send', { session: target, text: 'Go on' }, PM)).isError, true, target);
      assert.equal((await tool(api, 'pm_worker_stop', { session: target }, PM)).isError, true, target);
      assert.equal((await tool(api, 'pm_worker_read', { session: target }, PM)).isError, true, target);
    }
    assert.deepEqual(done, [], 'nothing sent, nothing stopped');
    assert.equal((await tool(api, 'pm_worker_send', { session: worker, text: 'Go on' }, PM)).isError, false);
    assert.deepEqual(done, [`send ${worker} Go on`]);
    await tool(api, 'pm_worker_stop', { session: worker }, PM);
    assert.deepEqual(done.slice(1), [`stopWorker ${worker}`]);
    assert.equal((await book.read('s1')).workers[0].watch.stopAsked, 1000, 'its stop is known before its turn ends');
    await tool(api, 'pm_worker_resolve', { session: worker }, PM);
    assert.equal((await tool(api, 'pm_worker_send', { session: worker, text: 'Again' }, PM)).isError, true, 'a resolved worker is no longer driven');
    assert.equal(done.length, 2);
  });

  it('no longer drives a worker that became a PM or another PM\'s', async () => {
    const { api, done, find } = pmFake();
    const { session: worker } = await json(api, 'pm_worker_start', { brief: 'Fix it.' });
    const live = find(worker)!;
    live.pm = true;
    assert.equal((await tool(api, 'pm_worker_send', { session: worker, text: 'Go on' }, PM)).isError, true, 'turned PM');
    live.pm = undefined;
    live.pmOf = 's7';
    assert.equal((await tool(api, 'pm_worker_send', { session: worker, text: 'Go on' }, PM)).isError, true, 'another PM\'s');
    assert.deepEqual(done, []);
  });

  it('refuses to make itself its own worker, even from a damaged file', async () => {
    const { api, book, done } = pmFake();
    await book.change('s1', (file) => { file.workers.push({ session: 's1', linkedAt: 1, watch: {} }); });
    assert.equal((await tool(api, 'pm_worker_send', { session: 's1', text: 'Go on' }, PM)).isError, true);
    assert.deepEqual(done, []);
  });

  it('adopts a session of its own project only: not itself, another PM, another PM\'s worker nor an automaton\'s run', async () => {
    const { api, book, find } = pmFake();
    for (const target of ['s1', 's7', 's8', 's5', 's6', 'nope']) assert.equal((await tool(api, 'pm_worker_link', { session: target }, PM)).isError, true, target);
    assert.deepEqual((await book.read('s1')).workers, []);
    assert.equal(find('s8')!.pmOf, 's7', 'another PM\'s worker stays theirs');
    await json(api, 'pm_worker_link', { session: 's2' });
    assert.deepEqual((await book.read('s1')).workers.map((each) => each.session), ['s2']);
    assert.equal(find('s2')!.pmOf, 's1');
    await tool(api, 'pm_worker_unlink', { session: 's2' }, PM);
    assert.equal(find('s2')!.pmOf, undefined, 'let go, it is no one\'s');
  });

  it('lets only one of two PMs adopt the same session at once', async () => {
    const { api, book, find } = pmFake();
    const [first, second] = await Promise.all([tool(api, 'pm_worker_link', { session: 's2' }, PM), tool(api, 'pm_worker_link', { session: 's2' }, OTHER_PM)]);
    assert.deepEqual([first.isError, second.isError], [false, true]);
    assert.equal(find('s2')!.pmOf, 's1');
    assert.deepEqual((await book.read('s7')).workers, []);
  });

  it('lets go of a session it cannot adopt after claiming it', async () => {
    const { api, book, find } = pmFake();
    assert.equal((await tool(api, 'pm_worker_link', { session: 's2', item: 'W9' }, PM)).isError, true, 'an unknown task');
    assert.equal(find('s2')!.pmOf, undefined);
    assert.deepEqual((await book.read('s1')).workers, []);
  });

  it('lets go of and stops a worker it started but cannot link', async () => {
    const { api, book, find, done } = pmFake();
    const start = api.pm!.startWorker;
    api.pm!.startWorker = async (pm, options) => {
      const worker = await start(pm, options);
      worker.id = 'not a valid id';
      return worker;
    };
    assert.equal((await tool(api, 'pm_worker_start', { brief: 'Fix it.' }, PM)).isError, true);
    assert.equal(find('not a valid id')!.pmOf, undefined);
    assert.ok(done.includes('stopWorker not a valid id'));
    assert.deepEqual((await book.read('s1')).workers, []);
  });

  it('starts a worker in an allowed folder only, and checks its task before starting it', async () => {
    const { api, book, starts } = pmFake();
    await json(api, 'pm_item_add', { title: 'Login' });
    assert.equal((await tool(api, 'pm_worker_start', { brief: 'Fix it.', cwd: '/etc' }, PM)).isError, true);
    assert.equal((await tool(api, 'pm_worker_start', { brief: 'Fix it.', item: 'W9' }, PM)).isError, true, 'an unknown task');
    assert.deepEqual(starts, ['/etc'], 'no session started for an unknown task');
    assert.deepEqual((await book.read('s1')).workers, []);
    const started = await json(api, 'pm_worker_start', { brief: 'Fix it.', item: 'W1' });
    assert.equal(started.item, 'W1');
    assert.deepEqual((await book.read('s1')).workers.map((each) => [each.session, each.item]), [[started.session, 1]]);
  });

  it('tells what a worker waits for, never the request id that would answer it', async () => {
    const { api, find } = pmFake();
    const { session: worker } = await json(api, 'pm_worker_start', { brief: 'Fix it.' });
    find(worker)!.permissions = [{ requestId: 'req-4242', who: 'W', tool: 'Bash', detail: 'npm install', canAlways: true }];
    const read = await tool(api, 'pm_worker_read', { session: worker }, PM);
    assert.equal(JSON.parse(read.text).waitsFor[0].kind, 'permission');
    assert.ok(!read.text.includes('req-4242'));
  });

  it('shows each task\'s status from its workers\' live state, and tells the questions set aside once', async () => {
    const { api, book } = pmFake();
    await json(api, 'pm_item_add', { title: 'Login' });
    await json(api, 'pm_item_add', { title: 'Later' });
    await json(api, 'pm_worker_start', { brief: 'Fix it.', item: 'W1' });
    await json(api, 'pm_ask', { title: 'Which phone?', detail: 'iPhone, Android or both' });
    // the PM's turns go on: W2, untouched since, has no one on it
    await book.change('s1', (file) => { file.asks[0].state = 'dismissed'; file.turn = 5; });
    const status = async () => (await blocks(api, 'pm_status')).content as { text: string }[];
    const first = await status();
    assert.deepEqual(JSON.parse(first[0].text).items.map((each: { tag: string; status: string }) => [each.tag, each.status]), [['W1', 'inProgress'], ['W2', 'idle']]);
    assert.equal(first.length, 2, 'the questions set aside come after the result');
    assert.equal((await status()).length, 1, 'and only once');
  });

  it('still tells the questions set aside when what the tool does fails', async () => {
    const { api, book } = pmFake();
    const { session: worker } = await json(api, 'pm_worker_start', { brief: 'Fix it.' });
    await json(api, 'pm_ask', { title: 'Which phone?', detail: 'iPhone, Android or both' });
    await book.change('s1', (file) => { file.asks[0].state = 'dismissed'; });
    const failing: OpenSpaceApi = { ...api, send: () => { throw new Error('gone'); } };
    const sent = await blocks(failing, 'pm_worker_send', { session: worker, text: 'Go on' });
    assert.equal(sent.isError, true);
    assert.equal((sent.content as unknown[]).length, 2);
  });

  it('never answers a worker\'s permission or question', async () => {
    const { api, done } = pmFake();
    const { session: worker } = await json(api, 'pm_worker_start', { brief: 'Fix it.' });
    const { session: spare } = await json(api, 'pm_worker_start', { brief: 'Wait.' });
    await json(api, 'pm_ask', { title: 'Asked before', detail: 'Context' });
    const args: Record<(typeof PM_TOOL_NAMES)[number], Record<string, unknown>> = {
      pm_status: {}, pm_set_mission: { mission: 'Ship' }, pm_set_instructions: { instructions: 'Small PRs' }, pm_remember: { text: 'iPhone only' }, pm_forget: { number: 1 },
      pm_item_add: { title: 'Login', worker }, pm_item_update: { item: 'W1', now: 'Testing', step: 'Write the test' }, pm_item_list: {},
      pm_ask: { title: 'Which?', detail: 'Context' }, pm_ask_done: { tag: 'Q1' }, pm_ask_withdraw: { tag: 'Q2' }, pm_link_add: { item: 'W1', url: 'https://example.com/pull/1' },
      pm_worker_start: { brief: 'Go.' }, pm_worker_link: { session: 's2' }, pm_worker_unlink: { session: 's2' }, pm_worker_resolve: { session: spare },
      pm_worker_send: { session: worker, text: 'yes' }, pm_worker_read: { session: worker }, pm_worker_stop: { session: worker },
    };
    // each one carried out, so that none stops short of what it does
    for (const name of PM_TOOL_NAMES) assert.equal((await tool(api, name, args[name], PM)).isError, false, name);
    assert.deepEqual(done.filter((each) => /^(answer|reply) /.test(each)), []);
  });

  it('refuses an argument it does not name, of another type, or a required text left blank, and says the right ones', async () => {
    const { api, dir, done } = pmFake();
    const wrong: [(typeof PM_TOOL_NAMES)[number], Record<string, unknown>][] = [
      ['pm_set_mission', { text: 'Ship' }], ['pm_set_mission', { mission: '  ' }], ['pm_forget', { number: '1' }],
      ['pm_item_add', { title: 'Login', note: 'soon' }], ['pm_worker_send', { text: 'Go on' }],
    ];
    for (const [name, args] of wrong) {
      const reply = await tool(api, name, args, PM);
      assert.equal(reply.isError, true, `${name} ${JSON.stringify(args)}`);
      assert.ok(reply.text.includes(PM_TOOL_USAGE[name]), `${name}: the arguments it expects`);
    }
    assert.deepEqual(readdirSync(dir), [], 'nothing written');
    assert.deepEqual(done, []);
  });

  it('keeps the mission and the instructions given under their own names', async () => {
    const { api } = pmFake();
    assert.equal((await tool(api, 'pm_set_mission', { mission: 'Ship v2' }, PM)).isError, false);
    assert.equal((await tool(api, 'pm_set_instructions', { instructions: 'Small PRs' }, PM)).isError, false);
    const { mission, instructions } = await json(api, 'pm_status');
    assert.deepEqual([mission, instructions], ['Ship v2', 'Small PRs']);
  });

  it('tells a PM each tool with its exact arguments, in both languages', () => {
    try {
      for (const language of ['fr', 'en'] as const) {
        setServerLanguage(language);
        const lines = st.prompt.pm('').split('\n');
        for (const { name, inputSchema } of PM_TOOLS) {
          const line = lines.find((each) => each.includes(`${name}(`));
          assert.ok(line, `${language}: ${name}`);
          const { properties = {}, required = [] } = inputSchema as { properties?: Json; required?: string[] };
          for (const key of Object.keys(properties)) assert.match(line, new RegExp(`\\b${key}\\b`), `${language}: ${name} ${key}`);
          for (const key of required) assert.match(line, new RegExp(`\\b${key}\\b(?!\\?)`), `${language}: ${name} ${key} is required`);
        }
      }
    } finally {
      setServerLanguage('fr');
    }
  });

  it('names a worker by its session id, the tag of its task or its name, never one of several', async () => {
    const { api, book, done } = pmFake();
    await json(api, 'pm_item_add', { title: 'Login' });
    await json(api, 'pm_item_add', { title: 'Docs' });
    const { session: login } = await json(api, 'pm_worker_start', { brief: 'Fix it.', item: 'W1' });
    const { session: docs, name: docsName } = await json(api, 'pm_worker_start', { brief: 'Write them.', item: 'W2' });
    const named: [Record<string, unknown>, string][] = [[{ session: login }, login], [{ session: 'W1' }, login], [{ item: 'W2' }, docs], [{ session: docsName }, docs]];
    for (const [args, to] of named) {
      done.length = 0;
      assert.equal((await tool(api, 'pm_worker_send', { ...args, text: 'Go on' }, PM)).isError, false, JSON.stringify(args));
      assert.deepEqual(done, [`send ${to} Go on`]);
    }
    done.length = 0;
    await json(api, 'pm_worker_start', { brief: 'Test it.', item: 'W1' });
    for (const session of ['W1', 'W3', 'Nobody']) assert.equal((await tool(api, 'pm_worker_send', { session, text: 'Go on' }, PM)).isError, true, session);
    assert.deepEqual(done, [], 'two workers on W1: neither');
    assert.equal((await tool(api, 'pm_worker_resolve', { item: 'W2' }, PM)).isError, false);
    assert.ok((await book.read('s1')).workers.find((worker) => worker.session === docs)?.resolvedAt);
  });
});
