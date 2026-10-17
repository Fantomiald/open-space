import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { ServerMessage, SessionInfo } from '../shared/protocol.ts';
import type { LaunchOptions, PermissionAnswer, ProcessFactory, ProcessHandle, ProcessHandlers } from './claude-process.ts';
import type { Config } from './config.ts';
import { asJson } from './json.ts';
import { projectFolder } from './conversations.ts';
import { SessionManager } from './sessions.ts';

/** A scripted stand-in for the claude process: the tests feed it captured lines and watch what the session writes back. */
class FakeProcess implements ProcessHandle {
  alive = true;
  sent: string[] = [];
  sentImages: number[] = [];
  answers: { requestId: string; answer: PermissionAnswer }[] = [];
  interrupts = 0;
  stopCalls: number[] = [];
  launch: LaunchOptions;
  handlers: ProcessHandlers;

  constructor(launch: LaunchOptions, handlers: ProcessHandlers) {
    this.launch = launch;
    this.handlers = handlers;
  }

  send(text: string, images: readonly unknown[] = []) { this.sent.push(text); this.sentImages.push(images.length); return true; }
  answerPermission(requestId: string, answer: PermissionAnswer) { this.answers.push({ requestId, answer }); }
  refuseControl() { /* not needed by these tests */ }
  interrupt() { this.interrupts++; }
  stop(graceMs: number) {
    this.stopCalls.push(graceMs);
    this.exit(0, null, '');
    return Promise.resolve();
  }

  /** Feeds lines of a captured stream-json file, like the real process would print them. */
  feed(fixture: string, from = 0, to?: number) {
    const lines = fixtureLines(fixture).slice(from, to);
    for (const line of lines) this.handlers.onMessage(asJson(JSON.parse(line)));
  }

  exit(code: number | null, signal: NodeJS.Signals | null, stderr: string) {
    if (!this.alive) return;
    this.alive = false;
    this.handlers.onExit({ code, signal, stderr });
  }
}

const fixtureLines = (fixture: string) => readFileSync(new URL(`./fixtures/${fixture}.jsonl`, import.meta.url), 'utf8').split('\n').filter(Boolean);

let base: string;
let root: string;
let counter = 0;

before(() => {
  base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-sessions-')));
  root = path.join(base, 'root');
  mkdirSync(path.join(root, 'project-a'), { recursive: true });
  mkdirSync(path.join(root, 'project-b'));
});
after(() => rmSync(base, { recursive: true, force: true }));

function setup(overrides: Partial<Config> = {}, dataDir = path.join(base, `data-${++counter}`), now?: () => number, home?: string) {
  const processes: FakeProcess[] = [];
  const messages: ServerMessage[] = [];
  const spawnProcess: ProcessFactory = (launch, handlers) => {
    const fake = new FakeProcess(launch, handlers);
    processes.push(fake);
    return fake;
  };
  const config: Config = { port: 0, roots: [root], rootsLocked: false, dataDir, maxLive: 8, idleMs: 60_000, passthrough: [], ...overrides };
  const attention: [string, string][] = [];
  const manager = new SessionManager({ config, spawnProcess, broadcast: (message) => messages.push(message), log: () => {}, now, home, onAttention: (kind, session) => attention.push([kind, session.id]) });
  const states = (id: string) => messages.flatMap((m) => (m.t === 'ev' && m.sessionId === id && m.ev.k === 'state' ? [m.ev.state] : []));
  const find = (id: string): SessionInfo => {
    const session = manager.list().find((s) => s.id === id);
    assert.ok(session, `session ${id} not found`);
    return session;
  };
  return { manager, processes, messages, states, find, dataDir, attention };
}

const projectA = () => path.join(root, 'project-a');

describe('creating sessions', () => {
  it('creates a waiting session with a first name, inside an allowed folder', async () => {
    const { manager } = setup();
    await manager.init();
    const session = await manager.create({ cwd: projectA(), model: 'haiku' });
    assert.equal(session.state, 'wait');
    assert.equal(session.cwd, projectA());
    assert.equal(session.model, 'haiku');
    assert.ok(session.name.length > 0);
    assert.match(session.id, /^[0-9a-f-]{36}$/);
    await manager.shutdown();
  });

  it('gives distinct names to concurrent sessions and honours an explicit name', async () => {
    const { manager } = setup();
    await manager.init();
    const names = new Set<string>();
    for (let i = 0; i < 6; i++) names.add((await manager.create({ cwd: projectA() })).name);
    assert.equal(names.size, 6);
    assert.equal((await manager.create({ cwd: root, name: '  Max  ' })).name, 'Max');
    await manager.shutdown();
  });

  it('refuses folders outside the roots, relative paths and missing folders', async () => {
    const { manager } = setup();
    await manager.init();
    await assert.rejects(manager.create({ cwd: os.homedir() }), /racines autorisées/);
    await assert.rejects(manager.create({ cwd: 'project-a' }), /racines autorisées/);
    await assert.rejects(manager.create({ cwd: path.join(root, 'ghost') }), /racines autorisées/);
    assert.equal(manager.list().length, 0);
    await manager.shutdown();
  });

  it('sends the first message when given one and launches with the session options', async () => {
    const { manager, processes } = setup();
    await manager.init();
    const session = await manager.create({ cwd: projectA(), text: '/kit:new', model: 'haiku' });
    assert.equal(processes.length, 1);
    assert.deepEqual(processes[0].launch, { cwd: projectA(), sessionId: session.id, resume: false, model: 'haiku', permissionMode: 'auto', name: session.name });
    assert.deepEqual(processes[0].sent, ['/kit:new']);
    assert.equal(session.state, 'starting');
    await manager.shutdown();
  });
});

describe('usage', () => {
  it('keeps the last five-hour usage across a restart, as Claude Code only reports it while a session works', async () => {
    const dataDir = path.join(base, `data-quota-${++counter}`);
    // an hour before the reset recorded in the fixture, so the stored usage is still current
    const beforeReset = () => 1792149600_000 - 3_600_000;
    const first = setup({}, dataDir, beforeReset);
    await first.manager.init();
    await first.manager.create({ cwd: projectA(), text: 'ping' });
    first.processes[0].feed('simple-turn');
    const reported = first.manager.getQuota();
    assert.ok(reported);
    await first.manager.shutdown();
    const second = setup({}, dataDir, beforeReset);
    await second.manager.init();
    assert.deepEqual(second.manager.getQuota(), reported);
    await second.manager.shutdown();
  });
});

describe('names', () => {
  it('a new session learns its name from the system prompt; after a rename, the next plain message tells the new one', async () => {
    const { manager, processes, find } = setup();
    await manager.init();
    const { id, name } = await manager.create({ cwd: projectA(), text: 'bonjour' });
    assert.deepEqual(processes[0].sent, ['bonjour']);
    assert.equal(find(id).introducedAs, name);
    // a name outside the pool sessions are named from, so the rename always changes something
    // each message waits for the previous turn to end
    const turn = () => processes[0].feed('simple-turn');
    turn();
    manager.rename(id, 'Zéphyrin');
    manager.send(id, '/kit:status');
    assert.equal(processes[0].sent.at(-1), '/kit:status');
    turn();
    manager.send(id, 'tu es qui ?');
    assert.match(processes[0].sent.at(-1)!, /« Zéphyrin »[\s\S]*tu es qui \?$/);
    assert.equal(find(id).introducedAs, 'Zéphyrin');
    turn();
    manager.send(id, 'merci');
    assert.equal(processes[0].sent.at(-1), 'merci');
    await manager.shutdown();
  });
});

describe('resuming a conversation started elsewhere', () => {
  it('goes on with it under its own id, shows its last exchanges, and lists only the conversations not open yet', async () => {
    const home = path.join(base, `home-${++counter}`);
    const id = '0552561c-ed98-44d9-97f9-e8b3abc2bf14';
    const folder = projectFolder(projectA(), home);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, `${id}.jsonl`), [
      JSON.stringify({ type: 'user', message: { content: 'Où on en est ?' } }),
      JSON.stringify({ type: 'ai-title', aiTitle: 'Suivi du projet' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'On en est au paywall.' }] } }),
    ].join('\n'));
    const { manager, processes, messages } = setup({}, undefined, undefined, home);
    await manager.init();
    assert.deepEqual((await manager.conversations(projectA())).map((conversation) => conversation.title), ['Suivi du projet']);
    const session = await manager.create({ cwd: projectA(), resumeId: id, text: 'On continue' });
    assert.equal(session.id, id);
    assert.equal(processes[0].launch.resume, true);
    const texts = messages.flatMap((m) => (m.t === 'ev' && m.sessionId === id && (m.ev.k === 'note' || m.ev.k === 'start' || m.ev.k === 'say') ? [m.ev.k === 'note' ? 'note' : m.ev.text] : []));
    assert.deepEqual(texts, ['note', 'Où on en est ?', 'On en est au paywall.', 'note', 'On continue']);
    assert.deepEqual(await manager.conversations(projectA()), []);
    await assert.rejects(manager.create({ cwd: projectA(), resumeId: id }), /déjà ouverte/);
    await manager.shutdown();
  });
});

describe('tags', () => {
  it('puts a tag on a session, keeps it across a restart, and removes it when empty', async () => {
    const dataDir = path.join(base, `data-tag-${++counter}`);
    const first = setup({}, dataDir);
    await first.manager.init();
    const { id } = await first.manager.create({ cwd: projectA(), text: 'hi' });
    first.manager.tag(id, 'urgent');
    await first.manager.shutdown();
    const second = setup({}, dataDir);
    await second.manager.init();
    assert.equal(second.find(id).tag, 'urgent');
    second.manager.tag(id, '');
    assert.equal(second.find(id).tag, undefined);
    await second.manager.shutdown();
  });
});

describe('folders that run code of their own', () => {
  it('asks first, then runs without the folder\'s settings, or trusts it for good', async () => {
    const folder = path.join(root, 'project-b');
    mkdirSync(path.join(folder, '.claude'), { recursive: true });
    writeFileSync(path.join(folder, '.claude', 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } }));
    const dataDir = path.join(base, `data-trust-${++counter}`);
    const { manager, processes } = setup({}, dataDir, undefined, path.join(base, 'no-home'));
    await manager.init();
    await assert.rejects(manager.create({ cwd: folder, text: 'hi' }), (error: Error) => error.name === 'Error' && /confirme/.test(error.message));
    const restricted = await manager.create({ cwd: folder, text: 'hi', trust: 'restricted' });
    assert.equal(restricted.untrusted, true);
    assert.equal(processes.at(-1)!.launch.untrusted, true);
    await manager.create({ cwd: folder, text: 'hi', trust: 'folder' });
    const again = await manager.create({ cwd: folder, text: 'hi' });
    assert.equal(again.untrusted, undefined, 'trusted from now on');
    assert.equal(processes.at(-1)!.launch.untrusted, undefined);
    await manager.shutdown();
    rmSync(path.join(folder, '.claude'), { recursive: true });
  });
});

describe('the break room', () => {
  it('puts a session to rest, releasing its process, and calls it back with a message', async () => {
    const dataDir = path.join(base, `data-rest-${++counter}`);
    const first = setup({}, dataDir);
    await first.manager.init();
    const { id } = await first.manager.create({ cwd: projectA(), text: 'hi' });
    first.processes[0].feed('simple-turn');
    await first.manager.rest(id);
    assert.equal(first.processes[0].alive, false);
    assert.equal(first.find(id).resting, true);
    await first.manager.shutdown();
    const second = setup({}, dataDir);
    await second.manager.init();
    assert.equal(second.find(id).resting, true, 'still resting after a restart');
    second.manager.send(id, 'back to work');
    assert.equal(second.find(id).resting, undefined);
    assert.deepEqual(second.processes[0].sent, ['back to work']);
    await second.manager.shutdown();
  });
});

describe('a normal turn', () => {
  it('goes starting, work, wait; records events with increasing seq; stores commands, model and quota', async () => {
    const { manager, processes, states, find, messages } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA(), text: 'ping' });
    processes[0].feed('simple-turn');
    assert.deepEqual(states(id), ['starting', 'work', 'wait']);
    const session = find(id);
    assert.equal(session.turns, 1);
    assert.equal(session.lastMessage, 'pong');
    assert.equal(session.activeModel, 'claude-haiku-5-5');
    assert.equal(session.resumable, true);
    const seqs = messages.flatMap((m) => (m.t === 'ev' && m.sessionId === id ? [m.seq] : []));
    assert.deepEqual(seqs, seqs.map((_, index) => index + 1));
    assert.deepEqual(manager.getCommands().map((c) => c.name), ['kit:new', 'kit:status', 'superpowers:brainstorming', 'compact']);
    assert.equal(manager.getQuota()?.fiveHour, 0.02);
    await manager.shutdown();
  });

  it('queues the messages sent during a turn, shows them, and sends them together when it ends', async () => {
    const { manager, processes, find } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA(), text: 'one' });
    manager.send(id, 'two');
    manager.send(id, 'three');
    assert.deepEqual(processes[0].sent, ['one']);
    assert.deepEqual(find(id).queued?.map(({ text }) => text), ['two', 'three']);
    processes[0].feed('simple-turn');
    assert.deepEqual(processes[0].sent, ['one', 'two\n\nthree']);
    assert.equal(find(id).queued, undefined);
    assert.equal(find(id).state, 'work');
    await manager.shutdown();
  });

  it('sends pictures with a message, keeps them in the attachments, and names them in the thread', async () => {
    const { manager, processes, messages, dataDir } = setup();
    await manager.init();
    const image = { mediaType: 'image/png' as const, data: Buffer.from('a picture').toString('base64') };
    const { id } = await manager.create({ cwd: projectA(), text: 'regarde', images: [image] });
    assert.deepEqual([processes[0].sent, processes[0].sentImages], [['regarde'], [1]]);
    const start = messages.flatMap((m) => (m.t === 'ev' && m.sessionId === id && m.ev.k === 'start' ? [m.ev] : []))[0];
    assert.equal(start.images?.length, 1);
    assert.equal(readFileSync(path.join(dataDir, 'attachments', start.images![0]), 'utf8'), 'a picture');
    // during the turn: a picture alone waits in the queue (counted, not shown), then leaves with the next message
    manager.send(id, '', [image, image]);
    manager.send(id, 'et ça');
    assert.equal(manager.list().find((session) => session.id === id)!.queued?.[0].images, 2);
    processes[0].feed('simple-turn');
    assert.deepEqual([processes[0].sent.at(-1), processes[0].sentImages.at(-1)], ['et ça', 2]);
    await manager.shutdown();
  });

  it('sends a queued slash command on its own, and lets the user take a message back', async () => {
    const { manager, processes, find } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA(), text: 'one' });
    manager.send(id, 'oops');
    manager.send(id, '/compact');
    manager.send(id, 'after');
    manager.unqueue(id, find(id).queued![0].id);
    processes[0].feed('simple-turn');
    assert.deepEqual(processes[0].sent, ['one', '/compact']);
    assert.deepEqual(find(id).queued?.map(({ text }) => text), ['after']);
    await manager.shutdown();
  });

  it('tells when a turn ends, but not one the user stopped nor one followed at once by the queue', async () => {
    const { manager, processes, attention } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA(), text: 'one' });
    processes[0].feed('simple-turn');
    assert.deepEqual(attention, [['finished', id]]);
    manager.send(id, 'two');
    manager.send(id, 'three');
    processes[0].feed('simple-turn', 1);
    assert.equal(attention.length, 1, 'the queued message left at once');
    manager.interrupt(id);
    processes[0].feed('simple-turn', 1);
    assert.equal(attention.length, 1, 'stopped by the user');
    await manager.shutdown();
  });

  it('sends the queue now by interrupting the turn', async () => {
    const { manager, processes, find } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA(), text: 'one' });
    processes[0].feed('simple-turn', 0, 7);
    manager.send(id, 'stop, do this instead');
    manager.sendNow(id);
    assert.equal(processes[0].interrupts, 1);
    processes[0].feed('simple-turn', 7);
    assert.deepEqual(processes[0].sent, ['one', 'stop, do this instead']);
    assert.equal(find(id).queued, undefined);
    await manager.shutdown();
  });

  it('remembers the last slash command and lists the sub-agents at work', async () => {
    const { manager, processes, find } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA(), text: '/kit:design une maquette' });
    manager.send(id, 'plus sombre');
    assert.equal(find(id).command, 'kit:design');
    const fake = processes[0];
    fake.handlers.onMessage({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { subagent_type: 'Explore', description: 'Look', prompt: 'Go' } }] } });
    assert.deepEqual(find(id).subagents.map(({ id: subagentId, type }) => [subagentId, type]), [['t1', 'Explore']]);
    fake.handlers.onMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'done' }] }, tool_use_result: { status: 'completed' } });
    assert.deepEqual(find(id).subagents, []);
    await manager.shutdown();
  });
});

describe('permissions', () => {
  const controlRequestIndex = () => fixtureLines('permission-allowed').findIndex((line) => line.includes('"type":"control_request"'));

  async function toPermission() {
    const context = setup();
    await context.manager.init();
    const { id } = await context.manager.create({ cwd: projectA(), text: 'touch a file' });
    const fake = context.processes[0];
    fake.feed('permission-allowed', 0, controlRequestIndex() + 1);
    const ask = context.messages.flatMap((m) => (m.t === 'ev' && m.ev.k === 'ask' ? [m.ev] : []))[0];
    assert.ok(ask);
    return { ...context, id, fake, requestId: ask.requestId, tool: ask.tool };
  }

  it('enters perm on a control_request and counts it', async () => {
    const { find, id, tool, manager, attention } = await toPermission();
    assert.equal(find(id).state, 'perm');
    assert.deepEqual(attention, [['permission', id]], 'the user is told');
    assert.deepEqual(find(id).permissions.map((p) => p.tool), ['Bash']);
    assert.match(find(id).permissions[0].detail, /touch created-by-bureau\.txt/);
    assert.equal(tool, 'Bash');
    await manager.shutdown();
  });

  it('answers yes: allow with the original input, back to work, then wait', async () => {
    const { find, id, requestId, fake, manager, states } = await toPermission();
    manager.answer(id, requestId, 'allow');
    assert.deepEqual(fake.answers, [{ requestId, answer: { allow: true, input: { command: 'touch created-by-bureau.txt', description: 'Create empty file created-by-bureau.txt' }, updates: [] } }]);
    assert.equal(find(id).state, 'work');
    assert.deepEqual(find(id).permissions, []);
    fake.feed('permission-allowed', controlRequestIndex() + 1);
    assert.equal(find(id).state, 'wait');
    assert.deepEqual(states(id), ['starting', 'work', 'perm', 'work', 'wait']);
    await manager.shutdown();
  });

  it('answers no', async () => {
    const { find, id, requestId, fake, manager } = await toPermission();
    manager.answer(id, requestId, 'deny');
    assert.deepEqual(fake.answers[0].answer, { allow: false });
    assert.equal(find(id).state, 'work');
    await manager.shutdown();
  });

  it('answers always: allow plus a rule scoped to the session', async () => {
    const { id, requestId, fake, manager } = await toPermission();
    manager.answer(id, requestId, 'always');
    const answer = fake.answers[0].answer;
    assert.ok(answer.allow);
    assert.deepEqual(answer.updates, [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'touch created-by-bureau.txt' }], behavior: 'allow', destination: 'session' }]);
    await manager.shutdown();
  });

  it('rejects an answer to an unknown or already answered request', async () => {
    const { id, requestId, manager } = await toPermission();
    assert.throws(() => manager.answer(id, 'nope', 'allow'), /n’existe plus/);
    manager.answer(id, requestId, 'allow');
    assert.throws(() => manager.answer(id, requestId, 'allow'), /n’existe plus/);
    await manager.shutdown();
  });

  it('cancels pending permissions at the end of the turn, so none can be answered afterwards', async () => {
    const { find, id, fake, requestId, manager, messages } = await toPermission();
    fake.handlers.onMessage({ type: 'result', subtype: 'success', is_error: false, result: 'stopped', duration_ms: 5 });
    assert.equal(find(id).state, 'wait');
    assert.deepEqual(find(id).permissions, []);
    assert.ok(messages.some((m) => m.t === 'ev' && m.ev.k === 'ask_done' && m.ev.requestId === requestId && m.ev.cancelled));
    assert.throws(() => manager.answer(id, requestId, 'allow'), /n’existe plus/);
    await manager.shutdown();
  });

  it('a request withdrawn by Claude Code goes away, the session goes back to work', async () => {
    const { find, id, fake, requestId, manager } = await toPermission();
    fake.handlers.onMessage({ type: 'control_cancel_request', request_id: requestId });
    assert.deepEqual(find(id).permissions, []);
    assert.equal(find(id).state, 'work');
    await manager.shutdown();
  });

  it('cancels pending permissions when the process dies', async () => {
    const { find, id, fake, manager, states } = await toPermission();
    fake.exit(1, null, 'boom');
    assert.equal(find(id).state, 'error');
    assert.deepEqual(find(id).permissions, []);
    assert.equal(states(id).at(-1), 'error');
    await manager.shutdown();
  });
});

describe('AskUserQuestion', () => {
  const questions = [
    { question: 'Which colour?', header: 'Colour', options: [{ label: 'Red', description: 'warm' }, { label: 'Blue', description: 'cold' }], multiSelect: false },
    { question: 'Which sizes?', header: 'Sizes', options: [{ label: 'S', description: '' }, { label: 'M', description: '' }], multiSelect: true },
  ];

  async function toQuestion() {
    const context = setup();
    await context.manager.init();
    const { id } = await context.manager.create({ cwd: projectA(), text: 'ask me' });
    const fake = context.processes[0];
    fake.feed('simple-turn', 0, 3);
    fake.handlers.onMessage({ type: 'control_request', request_id: 'q1', request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input: { questions }, tool_use_id: 'toolu_1' } });
    return { ...context, id, fake };
  }

  it('waits for the user with the questions and their options', async () => {
    const { find, id, manager } = await toQuestion();
    assert.equal(find(id).state, 'perm');
    assert.deepEqual(find(id).permissions[0].questions, questions);
    await manager.shutdown();
  });

  it('refuses a yes/no, and answers with the original input plus the answers of known questions', async () => {
    const { find, id, fake, manager } = await toQuestion();
    assert.throws(() => manager.answer(id, 'q1', 'allow'), /pas un oui ou un non/);
    manager.reply(id, 'q1', { 'Which colour?': 'Blue', 'Which sizes?': ' S, M ', 'Unknown?': 'x' });
    assert.deepEqual(fake.answers, [{ requestId: 'q1', answer: { allow: true, input: { questions, answers: { 'Which colour?': 'Blue', 'Which sizes?': 'S, M' } }, updates: [] } }]);
    assert.equal(find(id).state, 'work');
    assert.deepEqual(find(id).permissions, []);
    await manager.shutdown();
  });

  it('refuses empty answers and a reply to a yes/no request', async () => {
    const { id, manager } = await toQuestion();
    assert.throws(() => manager.reply(id, 'q1', { 'Which colour?': '  ' }), /Choisis une réponse/);
    await manager.shutdown();
  });
});

describe('process life cycle', () => {
  it('turns a crash into an error with the stderr tail, and restarts with --resume once the conversation exists', async () => {
    const { manager, processes, find } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA(), text: 'hi' });
    processes[0].feed('simple-turn', 0, 3);
    processes[0].exit(2, null, 'line one\nAPI error: overloaded\n');
    assert.equal(find(id).state, 'error');
    assert.match(find(id).error ?? '', /overloaded/);
    manager.send(id, 'again');
    assert.equal(processes.length, 2);
    assert.equal(processes[1].launch.resume, true);
    assert.equal(find(id).state, 'starting');
    assert.equal(find(id).error, undefined);
    await manager.shutdown();
  });

  it('keeps using --session-id when the first process died before init (nothing to resume)', async () => {
    const { manager, processes } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA(), text: 'hi' });
    processes[0].exit(1, null, 'cannot start');
    manager.send(id, 'retry');
    assert.equal(processes[1].launch.resume, false);
    await manager.shutdown();
  });

  it('close() stops the process at once and marks the session closed; the next message resumes it', async () => {
    const { manager, processes, find } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA(), text: 'hi' });
    processes[0].feed('simple-turn');
    await manager.close(id);
    assert.deepEqual(processes[0].stopCalls, [0]);
    assert.equal(find(id).state, 'closed');
    manager.send(id, 'back');
    assert.equal(processes[1].launch.resume, true);
    await manager.shutdown();
  });

  it('closing a session without a process just marks it closed', async () => {
    const { manager, find } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA() });
    await manager.close(id);
    assert.equal(find(id).state, 'closed');
    await manager.shutdown();
  });

  it('releases the process after the idle delay but stays waiting; the next message respawns it', async () => {
    const { manager, processes, find } = setup({ idleMs: 30 });
    await manager.init();
    const { id } = await manager.create({ cwd: projectA(), text: 'hi' });
    processes[0].feed('simple-turn');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(processes[0].alive, false);
    assert.equal(find(id).state, 'wait');
    manager.send(id, 'more');
    assert.equal(processes.length, 2);
    assert.equal(processes[1].launch.resume, true);
    await manager.shutdown();
  });

  it('never releases a session that is working', async () => {
    const { manager, processes } = setup({ idleMs: 30 });
    await manager.init();
    await manager.create({ cwd: projectA(), text: 'hi' });
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(processes[0].alive, true);
    await manager.shutdown();
  });

  it('refuses to run more live processes than the limit', async () => {
    const { manager } = setup({ maxLive: 2 });
    await manager.init();
    await manager.create({ cwd: projectA(), text: 'one' });
    await manager.create({ cwd: projectA(), text: 'two' });
    await assert.rejects(manager.create({ cwd: projectA(), text: 'three' }), /Trop de sessions actives/);
    assert.equal(manager.list().length, 2);
    await manager.shutdown();
  });

  it('interrupt() reaches the process only while a turn is running', async () => {
    const { manager, processes } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA() });
    manager.interrupt(id);
    assert.equal(processes.length, 0);
    manager.send(id, 'work');
    manager.interrupt(id); // still starting: nothing to interrupt yet
    assert.equal(processes[0].interrupts, 0);
    processes[0].feed('simple-turn', 0, 3);
    manager.interrupt(id);
    assert.equal(processes[0].interrupts, 1);
    await manager.shutdown();
  });

  it('refuses to create a session or start a process once shutdown has begun', async () => {
    const { manager, processes } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA() });
    const stopping = manager.shutdown();
    await assert.rejects(manager.create({ cwd: projectA(), text: 'late' }), /s’arrête/);
    assert.throws(() => manager.send(id, 'late'), /s’arrête/);
    await stopping;
    assert.equal(processes.length, 0);
  });

  it('shutdown stops every process; working sessions come back closed, waiting ones still waiting', async () => {
    const context = setup();
    await context.manager.init();
    const working = await context.manager.create({ cwd: projectA(), text: 'long task' });
    const waiting = await context.manager.create({ cwd: path.join(root, 'project-b'), text: 'quick' });
    context.processes[1].feed('simple-turn');
    await context.manager.shutdown();
    assert.ok(context.processes.every((p) => !p.alive));
    const restarted = setup({}, context.dataDir);
    await restarted.manager.init();
    assert.equal(restarted.find(working.id).state, 'closed');
    assert.equal(restarted.find(waiting.id).state, 'wait');
    await restarted.manager.shutdown();
  });
});

describe('persistence and resynchronisation', () => {
  it('restores names and logs after a restart', async () => {
    const first = setup();
    await first.manager.init();
    const { id, name } = await first.manager.create({ cwd: projectA(), text: 'hi' });
    first.processes[0].feed('simple-turn');
    await first.manager.shutdown();
    const second = setup({}, first.dataDir);
    await second.manager.init();
    assert.equal(second.find(id).name, name);
    assert.equal(second.find(id).turns, 1);
    assert.ok(second.manager.logSince(id, 0).events.length >= 5);
    await second.manager.shutdown();
  });

  it('marks a session found in a running state as closed (its process died with the server)', async () => {
    const first = setup();
    await first.manager.init();
    const { id } = await first.manager.create({ cwd: projectA(), text: 'hi' });
    first.processes[0].feed('simple-turn', 0, 3);
    await new Promise((resolve) => setTimeout(resolve, 700)); // the debounced save writes the "work" state; no shutdown() = a crash
    const second = setup({}, first.dataDir);
    await second.manager.init();
    assert.equal(second.find(id).state, 'closed');
    assert.equal(second.find(id).resumable, true);
    assert.equal(second.manager.logSince(id, 0).events.at(-1)?.ev.k, 'state');
    await second.manager.shutdown();
    await first.manager.shutdown();
  });

  it('serves the log after a sequence number and keeps numbering across restarts', async () => {
    const first = setup();
    await first.manager.init();
    const { id } = await first.manager.create({ cwd: projectA(), text: 'hi' });
    first.processes[0].feed('simple-turn');
    const all = first.manager.logSince(id, 0);
    assert.deepEqual(all.events.map((e) => e.seq), all.events.map((_, i) => i + 1));
    const tail = first.manager.logSince(id, 3);
    assert.deepEqual(tail.events.map((e) => e.seq), all.events.slice(3).map((e) => e.seq));
    assert.equal(tail.truncated, false);
    await first.manager.shutdown();

    const second = setup({}, first.dataDir);
    await second.manager.init();
    second.manager.send(id, 'again');
    const last = second.manager.logSince(id, 0).events.at(-1);
    assert.ok(last && last.seq > all.events.length);
    await second.manager.shutdown();
  });

  it('reads sessions saved by older versions (restricted, permissions, lastSeq fields) without keeping those fields', async () => {
    const context = setup();
    mkdirSync(context.dataDir, { recursive: true });
    const old = { id: 'old-1', name: 'Iris', cwd: projectA(), state: 'wait', model: '', restricted: true, permissions: [{ requestId: 'x' }], lastSeq: 99, turns: 2, resumable: true };
    writeFileSync(path.join(context.dataDir, 'sessions.json'), JSON.stringify({ version: 1, sessions: [old], commands: [] }));
    await context.manager.init();
    const loaded = context.find('old-1');
    assert.equal(loaded.name, 'Iris');
    assert.equal(loaded.permissionMode, 'manual');
    assert.deepEqual(loaded.permissions, []);
    assert.equal(loaded.lastSeq, 0);
    assert.equal('restricted' in loaded, false);
    await context.manager.shutdown();
  });

  it('moves an unreadable sessions.json aside instead of overwriting it', async () => {
    const context = setup();
    mkdirSync(context.dataDir, { recursive: true });
    writeFileSync(path.join(context.dataDir, 'sessions.json'), '{not json');
    await context.manager.init();
    assert.equal(context.manager.list().length, 0);
    assert.ok(readdirSync(context.dataDir).some((name) => name.startsWith('sessions.json.corrupt-')));
    await context.manager.shutdown();
  });

  it('forget() closes a live session first, then removes it and its log', async () => {
    const { manager, processes, messages } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: projectA(), text: 'hi' });
    processes[0].feed('simple-turn');
    await manager.forget(id);
    assert.equal(processes[0].alive, false);
    assert.equal(manager.list().length, 0);
    assert.ok(messages.some((m) => m.t === 'forgotten' && m.sessionId === id));
    assert.throws(() => manager.send(id, 'x'), /n’existe pas/);
    await manager.shutdown();
  });
});
