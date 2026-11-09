import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { automatonPersonId, isAutomataFolder, roleLabel, runOfPerson, type AutomataState } from '../shared/automata.ts';
import type { LoggedEvent, ServerMessage } from '../shared/protocol.ts';
import { parseRole } from './agent-roles.ts';
import { agentsAtWork, automataState, parseRun, recordsOf, RunThread, taskNotification, withLiveness } from './automata.ts';
import { AutomataWatch } from './automata-watch.ts';
import { projectFolder } from './conversations.ts';
import { parseClientMessage } from './messages.ts';
import { DEFAULT_PREFERENCES, parsePreferences } from './settings.ts';

const fixture = (name: string) => recordsOf(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
/** The Agent call of the fixture, and the sub-agent it launched (fixtures/automaton-run*.jsonl, claude -p 2.1.304). */
const AGENT_CALL = 'toolu_01PRib7S5wNZnufYJN7xyvu3';
const SESSION = '11111111-2222-4333-8444-555555555555';

const run = (fields: Record<string, unknown> = {}) => ({
  id: 'r1', role: 'coder', task: 't1', sessionId: SESSION, cwd: '/tmp/x', startedAt: '2026-11-08T10:00:00Z', endedAt: null, status: 'running', pid: 42, ...fields,
});

describe('the automatons: what their files say', () => {
  it('reads a run, tolerant of what is missing, and refuses what is not one', () => {
    const parsed = parseRun(run(), 'r1');
    assert.equal(parsed?.status, 'running');
    assert.equal(parsed?.startedAt, Date.parse('2026-11-08T10:00:00Z'));
    assert.equal(parsed?.endedAt, null);
    assert.equal(parsed?.pid, 42);
    assert.deepEqual(parseRun({ status: 'done' }, 'bare'), { id: 'bare', sessionId: '', cwd: '', status: 'done', pid: null, startedAt: 0, endedAt: null, role: '', task: '' });
    assert.equal(parseRun({ status: 'weird' }, 'r2'), null);
    assert.equal(parseRun([], 'r2'), null);
    assert.equal(parseRun(run(), '../escape'), null);
    // an id that would leave the folder is not taken, and fields of another program's own are left out
    assert.equal(parseRun(run({ id: '../x' }), 'r1')?.id, 'r1');
    assert.equal('ceiling' in parseRun(run({ ceiling: 5 }), 'r1')!, false);
    assert.equal(parseRun(run({ sessionId: 'not-a-uuid' }), 'r1')?.sessionId, '');
  });

  it('calls a run interrupted when it says running but its process is gone', () => {
    const parsed = parseRun(run(), 'r1')!;
    assert.equal(withLiveness(parsed, () => true).status, 'running');
    assert.equal(withLiveness(parsed, () => false).status, 'interrupted');
    assert.equal(withLiveness({ ...parsed, status: 'done' }, () => false).status, 'done');
  });

  it('tells the runs at work oldest first, the ended ones newest first', () => {
    const a = parseRun(run({ id: 'a', startedAt: 1000 }), 'a')!;
    const b = parseRun(run({ id: 'b', startedAt: 500 }), 'b')!;
    const c = parseRun(run({ id: 'c', status: 'done', endedAt: 3000 }), 'c')!;
    const d = parseRun(run({ id: 'd', status: 'failed', endedAt: 4000 }), 'd')!;
    const state = automataState([a, c, b, d], []);
    assert.deepEqual(state.running.map((r) => r.id), ['b', 'a']);
    assert.deepEqual(state.recent.map((r) => r.id), ['d', 'c']);
  });

  it('reads a role from its frontmatter', () => {
    const role = parseRole('---\nname: code-reviewer\ndescription: "Reads a diff and says what is wrong."\nmodel: sonnet\ntools: [Read, Grep]\nauthority:\n  - read\n  - comment\n---\n\nYou review code.\n', 'code-reviewer.md');
    assert.deepEqual(role, { name: 'code-reviewer', description: 'Reads a diff and says what is wrong.', model: 'sonnet' });
    assert.equal(parseRole('no frontmatter', 'x.md'), null);
    assert.equal(parseRole('---\ndescription: >\n  Two lines\n  folded.\n---\n', 'planner.md')?.name, 'planner');
    assert.equal(parseRole('---\ndescription: >\n  Two lines\n  folded.\n---\n', 'planner.md')?.description, 'Two lines folded.');
  });

  it('names an automaton apart from the sessions, and its role for people', () => {
    assert.equal(runOfPerson(automatonPersonId('r-1')), 'r-1');
    assert.equal(runOfPerson('some-session'), null);
    assert.equal(roleLabel('code-reviewer'), 'Code reviewer');
    assert.equal(isAutomataFolder(''), true);
    assert.equal(isAutomataFolder('~/agents'), true);
    assert.equal(isAutomataFolder('ops'), false);
  });

  it('keeps the setting off by default and reads one set before', () => {
    assert.equal(DEFAULT_PREFERENCES.automataFolder, '');
    // a settings file from before has none: the defaults fill it
    assert.equal(parsePreferences({ notifications: true }).automataFolder, undefined);
    assert.equal(parsePreferences({ automataFolder: '~/agents' }, '/home/me').automataFolder, '/home/me/agents');
    assert.equal(parsePreferences({ automataFolder: 'relative' }).automataFolder, undefined);
    assert.deepEqual(parseClientMessage({ t: 'automatonLog', runId: 'r-1' }), { t: 'automatonLog', runId: 'r-1' });
    assert.equal(parseClientMessage({ t: 'automatonLog', runId: '../x' }), null);
  });
});

describe('a run\'s thread, from its transcript', () => {
  it('reads a real headless transcript, its background sub-agent under the call that launched it', () => {
    const thread = new RunThread('/tmp/automata-fixture');
    for (const record of fixture('automaton-run.jsonl')) thread.add(record);
    for (const record of fixture('automaton-run-subagent.jsonl')) thread.add(record, AGENT_CALL);
    const kinds = thread.events.map(({ ev }) => ev.k);
    assert.equal(thread.events[0].ev.k, 'start');
    assert.match((thread.events[0].ev as { text: string }).text, /^Read notes\.txt/);
    assert.equal(thread.events[0].at, Date.parse('2026-11-08T15:49:04.670Z'));
    assert.ok(kinds.includes('hire'));
    const hire = thread.events.find(({ ev }) => ev.k === 'hire')!.ev as { id: string; type: string; name: string };
    assert.equal(hire.id, AGENT_CALL);
    assert.equal(hire.type, 'general-purpose');
    // named after its type: for an orchestrator, the role it plays
    assert.equal(hire.name, 'General purpose');
    // the task-notification ends it with its report
    const report = thread.events.find(({ ev }) => ev.k === 'report')!.ev as { who: string; text: string };
    assert.deepEqual(report, { k: 'report', who: AGENT_CALL, text: '2' });
    assert.ok(thread.events.some(({ ev }) => ev.k === 'leave' && ev.ok));
    // what the sub-agent did and said is its own
    assert.ok(thread.events.some(({ ev }) => ev.k === 'act' && ev.who === AGENT_CALL && ev.tool === 'Read'));
    assert.ok(thread.events.some(({ ev }) => ev.k === 'say' && ev.who === AGENT_CALL && ev.text === '2'));
    assert.ok(thread.events.some(({ ev }) => ev.k === 'say' && ev.who === 'chef' && /2 words/.test(ev.text)));
    // its prompt is not taken for the orchestrator's
    assert.equal(kinds.filter((kind) => kind === 'start').length, 1);
    assert.deepEqual(thread.take().length, thread.events.length);
    assert.deepEqual(thread.take(), []);
  });

  it('gives a tab to a sub-agent found only by its own transcript, once', () => {
    const thread = new RunThread('/tmp/automata-fixture');
    thread.subagent(AGENT_CALL, 'code-reviewer', 'Review the diff');
    for (const record of fixture('automaton-run-subagent.jsonl')) thread.add(record, AGENT_CALL);
    thread.subagent(AGENT_CALL, 'code-reviewer', 'Review the diff');
    const hires = thread.events.filter(({ ev }) => ev.k === 'hire');
    assert.equal(hires.length, 1);
    assert.deepEqual(hires[0].ev, { k: 'hire', id: AGENT_CALL, type: 'code-reviewer', name: 'Code reviewer', task: 'Review the diff', prompt: '' });
    assert.ok(thread.events.some(({ ev }) => ev.k === 'say' && ev.who === AGENT_CALL));
  });

  it('knows which sub-agents are at work: from their launch until they are back', () => {
    const thread = new RunThread('/tmp/automata-fixture');
    const records = fixture('automaton-run.jsonl');
    const launched = records.findIndex((record) => JSON.stringify(record).includes(AGENT_CALL));
    for (const record of records.slice(0, launched + 1)) thread.add(record);
    assert.deepEqual(thread.working().map((agent) => [agent.id, agent.role]), [[AGENT_CALL, 'general-purpose']]);
    for (const record of records.slice(launched + 1)) thread.add(record);
    assert.deepEqual(thread.working(), []);
    // told by run, only for the runs at work that have some
    const at = (id: string) => ({ ...parseRun({ id, sessionId: 's', status: 'running' }, id)! });
    const agents = new Map([['r1', [{ id: 'c1', role: 'test-writer', task: 'Write the tests' }]], ['r2', []], ['gone', [{ id: 'c2', role: 'x', task: '' }]]]);
    assert.deepEqual(agentsAtWork([at('r1'), at('r2')], agents), { r1: [{ id: 'c1', role: 'test-writer', task: 'Write the tests' }] });
  });

  it('keeps only the last events', () => {
    const thread = new RunThread('/tmp', 3);
    for (let i = 0; i < 5; i++) thread.add({ type: 'user', message: { content: `prompt ${i}` } });
    assert.equal(thread.events.length, 3);
    assert.equal(thread.truncated, true);
    assert.equal((thread.events[0].ev as { text: string }).text, 'prompt 2');
  });

  it('reads a task-notification', () => {
    assert.equal(taskNotification('hello'), null);
    assert.deepEqual(taskNotification('<task-notification>\n<tool-use-id>toolu_1</tool-use-id>\n<status>failed</status>\n<summary>Agent "x" failed</summary>\n</task-notification>'), {
      type: 'system', subtype: 'task_notification', tool_use_id: 'toolu_1', status: 'failed', summary: 'Agent "x" failed', usage: { total_tokens: 0, tool_uses: 0, duration_ms: 0 },
    });
  });
});

describe('watching the automatons\' folder', () => {
  let base: string, home: string, folder: string, cwd: string, transcript: string;
  const messages: ServerMessage[] = [];
  const lines = fixture('automaton-run.jsonl').map((record) => JSON.stringify(record));

  before(() => {
    base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-automata-')));
    home = path.join(base, 'home');
    folder = path.join(base, 'ops');
    cwd = path.join(base, 'project');
    mkdirSync(path.join(folder, 'state', 'runs'), { recursive: true });
    mkdirSync(path.join(folder, 'runs'), { recursive: true });
    mkdirSync(path.join(folder, '.claude', 'agents'), { recursive: true });
    mkdirSync(cwd);
    // runs/ at the root, or state/runs/: both are read
    writeFileSync(path.join(folder, 'runs', 'r1.json'), JSON.stringify(run({ cwd, pid: 1234 })));
    writeFileSync(path.join(folder, 'state', 'runs', 'old.json'), JSON.stringify(run({ id: 'old', cwd, status: 'running', pid: 999_999 })));
    writeFileSync(path.join(folder, 'state', 'runs', 'broken.json'), '{ not json');
    writeFileSync(path.join(folder, '.claude', 'agents', 'coder.md'), '---\nname: coder\ndescription: Writes the code.\n---\n');
    const conversations = projectFolder(cwd, home);
    mkdirSync(path.join(conversations, SESSION, 'subagents'), { recursive: true });
    transcript = path.join(conversations, `${SESSION}.jsonl`);
    writeFileSync(transcript, `${lines.slice(0, 2).join('\n')}\n`);
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  const listing = () => readdirSync(folder, { recursive: true }).map(String).sort().map((name) => `${name}:${statSync(path.join(folder, name)).mtimeMs}`);

  it('tells the runs, follows the transcript as it grows, and never writes there', async () => {
    const before = listing();
    const watch = new AutomataWatch({ folder: () => folder, broadcast: (message) => messages.push(message), log: () => {}, home, alive: (pid) => pid === 1234 });
    await watch.poll();
    const state = (messages.find((message) => message.t === 'automata') as { state: AutomataState }).state;
    assert.equal(state.folder, 'ok');
    assert.deepEqual(state.running.map((r) => r.id), ['r1']);
    assert.deepEqual(state.recent.map((r) => [r.id, r.status]), [['old', 'interrupted']]);
    assert.equal(state.roles[0].description, 'Writes the code.');
    const first = messages.filter((message) => message.t === 'automatonEvents').flatMap((message) => (message as { events: LoggedEvent[] }).events);
    assert.equal(first[0].ev.k, 'start');

    // the transcript grows, a line arriving in two halves
    const rest = lines.slice(2).join('\n');
    appendFileSync(transcript, rest.slice(0, 50));
    await watch.poll();
    appendFileSync(transcript, `${rest.slice(50)}\n`);
    await watch.poll();
    const all = messages.filter((message) => message.t === 'automatonEvents').flatMap((message) => (message as { events: LoggedEvent[] }).events);
    assert.ok(all.some(({ ev }) => ev.k === 'hire'));
    assert.deepEqual(Object.keys(watch.state.agents), [], 'its sub-agent is back by the end of the transcript');
    assert.deepEqual(all.map((event) => event.seq), all.map((_, index) => index + 1));

    // the run ends: its thread stays for the page
    writeFileSync(path.join(folder, 'runs', 'r1.json'), JSON.stringify(run({ cwd, pid: 1234, status: 'done', endedAt: '2026-11-08T11:00:00Z' })));
    const ending = listing();
    await watch.poll();
    assert.equal(watch.state.running.length, 0);
    const kept = await watch.thread('r1');
    assert.equal(kept.events.length, all.length);
    assert.deepEqual((await watch.thread('nope')).events, []);
    assert.deepEqual(listing(), ending);
    assert.notDeepEqual(before, ending);
  });

  it('is off without a folder, and says when the folder is missing', async () => {
    const off = new AutomataWatch({ folder: () => '', broadcast: () => {}, log: () => {}, home });
    await off.poll();
    assert.equal(off.state.folder, 'off');
    const missing = new AutomataWatch({ folder: () => path.join(base, 'nowhere'), broadcast: () => {}, log: () => {}, home });
    await missing.poll();
    assert.equal(missing.state.folder, 'missing');
  });
});
