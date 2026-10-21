import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LoggedEvent, OfficeEvent, Question, SessionInfo, SessionState, SlashCommand } from '../../shared/protocol.ts';
import { availability, stillFree } from './availability.ts';
import { contextLevel, stateLabel, toneOf } from './labels.ts';
import { asideQuestion, commandSuggestions, findCommands, hintValues, nativeView, tuning, commandAt, typedName } from './commands.ts';
import { diffRows } from './diff.ts';
import { addTo, fitColumns, FOCUS_TILING, isFull, maxColumns, nextFocus, placement, removeFrom, replaceIn, retile } from './stack.ts';
import { buildFeed, publishedPages, threadOf, toolSummary, currentTurn, turnPhase, turnWord, runningShells } from './feed.ts';
import { matchFolders } from './folders.ts';
import { appendLive, CLIENT_LOG_LIMIT, mergeLog } from './log.ts';
import { attentionKind, attentionQueue, newlyWaiting, otherSessions, tabTitle } from './queue.ts';
import { sessionStatus } from '../room/cast.ts';
import { afterEvent, withPartial } from './partials.ts';
import { questionAnswers } from './questions.ts';
import { quotaWindowName, resetLabel, usageLevel } from '../lib/format.ts';
import { mdToHtml } from '../lib/markdown.ts';

const logged = (seq: number, ev: OfficeEvent = { k: 'think', who: 'chef' }): LoggedEvent => ({ seq, at: seq * 1000, ev });

const session = (id: string, state: SessionState, extra: Partial<SessionInfo> = {}): SessionInfo => ({
  id, name: id, cwd: `/work/${id}`, model: '', activeModel: '', permissionMode: 'auto', state, stateSince: 1000, createdAt: 0, turns: 1, permissions: [],
  subagents: [], command: '', lastMessage: '', resumable: true, lastSeq: 5, ...extra,
});

describe('event log', () => {
  it('merges only events newer than the log, in order', () => {
    const merged = mergeLog([logged(1), logged(2)], [logged(2), logged(4), logged(3)]);
    assert.deepEqual(merged.map((e) => e.seq), [1, 2, 3, 4]);
  });

  it('appends the next live event, ignores duplicates, reports gaps', () => {
    const current = [logged(1), logged(2)];
    assert.equal(appendLive(current, logged(3)).kind, 'appended');
    assert.equal(appendLive(current, logged(2)).kind, 'duplicate');
    assert.deepEqual(appendLive(current, logged(5)), { kind: 'gap', after: 2 });
    assert.deepEqual(appendLive([], logged(1)).kind, 'appended');
  });

  it('keeps a bounded number of events', () => {
    const many = Array.from({ length: CLIENT_LOG_LIMIT + 10 }, (_, i) => logged(i + 1));
    const merged = mergeLog([], many);
    assert.equal(merged.length, CLIENT_LOG_LIMIT);
    assert.equal(merged.at(-1)?.seq, CLIENT_LOG_LIMIT + 10);
  });
});

describe('attention queue', () => {
  const question: Question = { question: 'Which?', header: 'Pick', options: [{ label: 'A', description: '' }, { label: 'B', description: '' }], multiSelect: false };

  it('knows why a session needs the user', () => {
    assert.equal(attentionKind(session('a', 'perm', { permissions: [{ requestId: 'r', who: 'chef', tool: 'Bash', detail: 'ls', canAlways: false }] })), 'permission');
    assert.equal(attentionKind(session('a', 'perm', { permissions: [{ requestId: 'q', who: 'chef', tool: 'AskUserQuestion', detail: 'Which?', canAlways: false, questions: [question] }] })), 'question');
    assert.equal(attentionKind(session('a', 'wait')), 'finished');
    // a message that ends with "?" is not a question any more: only AskUserQuestion is
    assert.equal(attentionKind(session('a', 'wait', { lastMessage: 'Tu veux que je continue ?' })), 'finished');
    assert.equal(attentionKind(session('a', 'error')), 'error');
    assert.equal(attentionKind(session('a', 'wait', { turns: 0 })), null);
    for (const state of ['work', 'starting', 'closed', 'done'] as const) assert.equal(attentionKind(session('a', state)), null);
    // what Open Space's own compaction wrote after a turn the user read is nothing new; one they had not read still is
    assert.equal(attentionKind(session('a', 'wait', { lastSeq: 9, quietFrom: 5 }), { a: 5 }), null);
    assert.equal(attentionKind(session('a', 'wait', { lastSeq: 9, quietFrom: 5 }), { a: 3 }), 'finished');
  });

  it('a finished turn or an error leaves the queue once seen, until something new happens', () => {
    const finished = session('a', 'wait', { lastSeq: 7 });
    assert.equal(attentionKind(finished, { a: 7 }), null);
    assert.equal(attentionKind(finished, { a: 6 }), 'finished');
    assert.equal(attentionKind(session('e', 'error', { lastSeq: 3 }), { e: 3 }), null);
    assert.equal(attentionKind(session('p', 'perm'), { p: 99 }), 'permission');
    const groups = otherSessions([finished, session('e', 'error', { lastSeq: 3 })], { a: 7, e: 3 });
    assert.deepEqual(groups.idle.map((s) => s.id), ['a']);
    assert.deepEqual(groups.stopped.map((s) => s.id), ['e']);
    assert.equal(attentionQueue([finished], { a: 7 }).length, 0);
  });

  it('puts permissions first, then finished turns, then errors; longest wait first', () => {
    const queue = attentionQueue([
      session('error', 'error', { stateSince: 1 }), session('finished-new', 'wait', { stateSince: 900 }), session('perm-new', 'perm', { stateSince: 800 }),
      session('finished-old', 'wait', { stateSince: 100 }), session('perm-old', 'perm', { stateSince: 50 }), session('working', 'work'),
    ]);
    assert.deepEqual(queue.map((item) => item.session.id), ['perm-old', 'perm-new', 'finished-old', 'finished-new', 'error']);
  });

  it('groups the others: working, ready, stopped', () => {
    const groups = otherSessions([session('w', 'work'), session('s', 'starting'), session('ready', 'wait', { turns: 0 }), session('c', 'closed'), session('d', 'done'), session('q', 'perm')]);
    assert.deepEqual(groups.working.map((s) => s.id).sort(), ['s', 'w']);
    assert.deepEqual(groups.idle.map((s) => s.id), ['ready']);
    assert.deepEqual(groups.stopped.map((s) => s.id).sort(), ['c', 'd']);
  });

  it('counts a session between turns as working while its background sub-agents work', () => {
    const helper = { id: 't1', name: 'Bob', type: 'Explore' };
    const groups = otherSessions([session('bg', 'wait', { turns: 0, subagents: [helper] }), session('ready', 'wait', { turns: 0 })]);
    assert.deepEqual(groups.working.map((s) => s.id), ['bg']);
    assert.deepEqual(groups.idle.map((s) => s.id), ['ready']);
    assert.equal(sessionStatus(session('bg', 'wait', { turns: 0, subagents: [helper] }), {}), 'working');
  });

  it('counts a session between turns as working while a command it sent to the background runs, and says so', () => {
    const rendering = session('bg', 'wait', { turns: 2, lastSeq: 5, background: [{ id: 'b1', description: 'Render the videos' }] });
    assert.deepEqual(otherSessions([rendering], { bg: 5 }).working.map((s) => s.id), ['bg']);
    assert.equal(sessionStatus(rendering, { bg: 5 }), 'working');
    assert.equal(toneOf(rendering, null), 'work');
    assert.equal(stateLabel(rendering, null), stateLabel(session('w', 'work'), null));
    assert.equal(attentionKind(rendering, {}), 'finished', 'what it said before going on still waits to be read');
  });

  it('detects sessions that just started waiting, not those already waiting, nor errors', () => {
    const before = { a: session('a', 'work'), b: session('b', 'wait'), c: session('c', 'work') };
    const after = [session('a', 'wait'), session('b', 'wait'), session('c', 'error'), session('d', 'perm')];
    assert.deepEqual(newlyWaiting(before, after).map((item) => item.session.id), ['d', 'a']);
  });

  it('puts the count in the tab title', () => {
    assert.equal(tabTitle(0), 'Open Space');
    assert.equal(tabTitle(3), '(3) Open Space');
  });
});

describe('runningShells', () => {
  it('lists the "!" commands started and not ended yet', () => {
    const events = [logged(1, { k: 'shell', id: 'a', command: 'ls' }), logged(2, { k: 'shell', id: 'b', command: 'npm run dev' }), logged(3, { k: 'shell_done', id: 'a', code: 0, output: '', ms: 5 })];
    assert.deepEqual(runningShells(events), ['b']);
  });
});

describe('buildFeed', () => {
  const events: OfficeEvent[] = [
    { k: 'start', text: '/kit:new' },
    { k: 'say', who: 'chef', text: 'On y va.' },
    { k: 'plan', items: [{ text: 'a', status: 'in_progress' }] },
    { k: 'hire', id: 't1', type: 'x', name: 'Bob', task: 'look', prompt: '' },
    { k: 'act', who: 't1', id: 'c1', tool: 'Read', detail: '/a' },
    { k: 'act_done', who: 't1', id: 'c1', ok: true },
    { k: 'report', who: 't1', text: 'found' },
    { k: 'leave', who: 't1', ok: true, tokens: 1, tools: 1, ms: 1 },
    { k: 'ask', who: 'chef', requestId: 'r1', tool: 'Bash', detail: 'touch x', canAlways: true },
    { k: 'ask_done', requestId: 'r1', allow: false },
    { k: 'error', message: 'boom' },
    { k: 'state', state: 'closed', reason: 'Closed by the user.' },
    { k: 'state', state: 'work' },
    { k: 'end', ok: true, text: 'done', ms: 1500 },
  ];
  const feed = buildFeed(events.map((ev, index) => logged(index + 1, ev)));

  it('builds the thread in order, updating tools, sub-agents and permissions in place', () => {
    assert.deepEqual(feed.items.map((item) => item.kind), ['user', 'assistant', 'subagent', 'tool', 'permission', 'notice', 'notice', 'turn']);
    const tool = feed.items.find((item) => item.kind === 'tool');
    assert.ok(tool && tool.kind === 'tool' && tool.ok === true && tool.author === 'Bob');
    const sub = feed.items.find((item) => item.kind === 'subagent');
    assert.ok(sub && sub.kind === 'subagent' && sub.status === 'done' && sub.report === 'found');
    const permission = feed.items.find((item) => item.kind === 'permission');
    assert.ok(permission && permission.kind === 'permission' && permission.status === 'denied');
  });

  it('shows the conversation without the sub-agents\' work, each sub-agent in its own thread, and gathers tool calls in a row', () => {
    const main = threadOf(feed.items, null);
    assert.deepEqual(main.map((entry) => entry.kind), ['user', 'assistant', 'subagent', 'permission', 'notice', 'notice', 'turn']);
    const bob = threadOf(feed.items, 't1');
    assert.deepEqual(bob.map((entry) => entry.kind), ['tools']);
    assert.equal(bob[0].kind === 'tools' && bob[0].tools.length, 1);
    assert.equal(toolSummary([{ tool: 'Read' }, { tool: 'Bash' }, { tool: 'Read' }]), 'Read ×2, Bash');
  });

  it('keeps the latest plan apart from the thread', () => {
    assert.deepEqual(feed.plan, [{ text: 'a', status: 'in_progress' }]);
  });

  it('puts a message from another session at the top of the turn it started, though it comes with its end', () => {
    const turns: OfficeEvent[] = [
      { k: 'start', text: 'Salut' }, { k: 'say', who: 'chef', text: 'Salut !' }, { k: 'end', ok: true, text: '', ms: 1 },
      { k: 'init', model: 'm' }, { k: 'act', who: 'chef', id: 'c1', tool: 'SendMessage', detail: '→ Margot : ça va' }, { k: 'say', who: 'chef', text: 'Je lui ai répondu.' },
      { k: 'peer', from: 'Margot', text: 'Comment tu vas ?' }, { k: 'end', ok: true, text: '', ms: 1 },
    ];
    const items = buildFeed(turns.map((ev, index) => logged(index + 1, ev))).items;
    assert.deepEqual(items.map((item) => item.kind), ['user', 'assistant', 'turn', 'peer', 'tool', 'assistant', 'turn']);
    assert.deepEqual(threadOf(items, null).map((entry) => entry.kind), ['user', 'assistant', 'turn', 'peer', 'tools', 'assistant', 'turn']);
  });

  it('knows the turn under way, when it started and what the session does in it; its word stays the same once it is over', () => {
    const events: OfficeEvent[] = [
      { k: 'start', text: 'one' }, { k: 'say', who: 'chef', text: 'done' }, { k: 'end', ok: true, text: '', ms: 1 },
      { k: 'state', state: 'starting' }, { k: 'start', text: 'two' }, { k: 'act', who: 'chef', id: 'c1', tool: 'Bash', detail: 'npm test' },
    ];
    const items = buildFeed(events.map((ev, index) => logged(index + 1, ev))).items;
    assert.deepEqual(currentTurn(items), { startId: 5, at: 5000 });
    assert.deepEqual(turnPhase(items), { tool: 'Bash' });
    const more: OfficeEvent[] = [...events, { k: 'act_done', who: 'chef', id: 'c1', ok: true }, { k: 'end', ok: true, text: '', ms: 1 }];
    const done = buildFeed(more.map((ev, index) => logged(index + 1, ev))).items;
    assert.equal(currentTurn(done), null);
    assert.equal(turnPhase(done), 'thinking');
    const turns = done.filter((item) => item.kind === 'turn');
    assert.deepEqual(turns.map((item) => item.startId), [1, 5], 'the turn remembers its first event');
    const words = [{ doing: 'a', done: 'A' }, { doing: 'b', done: 'B' }];
    assert.equal(turnWord(5, words).done, turnWord(5, words).done);
    assert.equal(turnWord(5, words).doing, 'b');
  });

  it('lists the pages published on claude.ai once each, the latest first, with the title of their last publish', () => {
    const events: OfficeEvent[] = [
      { k: 'artifact', who: 'chef', title: 'Plan', url: 'https://claude.ai/artifact/a', stored: null },
      { k: 'artifact', who: 't1', title: 'Report', url: 'https://claude.ai/artifact/b', stored: null },
      { k: 'artifact', who: 'chef', title: 'Plan v2', url: 'https://claude.ai/artifact/a', stored: null },
    ];
    const items = buildFeed(events.map((ev, index) => logged(index + 1, ev))).items;
    assert.deepEqual(publishedPages(items), [{ url: 'https://claude.ai/artifact/a', title: 'Plan v2' }, { url: 'https://claude.ai/artifact/b', title: 'Report' }]);
  });

  it('shows a command run with "!" with its output once it ended, outside the turns', () => {
    const items = buildFeed([
      logged(1, { k: 'shell', id: 's1', command: 'git status' }), logged(2, { k: 'start', text: 'hi' }),
      logged(3, { k: 'shell_done', id: 's1', code: 0, output: 'clean', ms: 40 }),
    ]).items;
    assert.deepEqual(items[0], { id: 1, kind: 'shell', at: 1000, shellId: 's1', command: 'git status', output: 'clean', code: 0, done: true, ms: 40, byUser: false });
    assert.deepEqual(currentTurn(items), { startId: 2, at: 2000 }, 'the turn starts with the message, not the command');
    const stopped = buildFeed([logged(1, { k: 'shell', id: 's2', command: 'npm run dev' }), logged(2, { k: 'shell_done', id: 's2', code: null, output: '', ms: 900, byUser: true })]).items;
    assert.equal(stopped[0].kind === 'shell' && stopped[0].byUser, true);
  });

  it('grades how full a context is: by its share of the window, or by its size in a very large one', () => {
    assert.equal(contextLevel(undefined), null);
    assert.equal(contextLevel({ used: 50_000, max: 200_000 }), 'calm');
    assert.equal(contextLevel({ used: 110_000, max: 200_000 }), 'rising');
    assert.equal(contextLevel({ used: 160_000, max: 200_000 }), 'high');
    assert.equal(contextLevel({ used: 150_000, max: 1_000_000 }), 'calm');
    assert.equal(contextLevel({ used: 250_000, max: 1_000_000 }), 'rising', 'a long context gets less sharp and costs more, even in a big window');
    assert.equal(contextLevel({ used: 800_000, max: 1_000_000 }), 'high', 'red only once the meter is three quarters full');
  });

  it('tells a compaction and a new conversation in the thread', () => {
    const items = buildFeed([logged(1, { k: 'compact', auto: false, before: 29998, after: 5250 }), logged(2, { k: 'cleared' })]).items;
    const [compacted, cleared] = items.map((item) => (item.kind === 'notice' ? item.text : ''));
    assert.match(compacted, /^Conversation compactée : 30\sk → 5,3\sk jetons$/);
    assert.equal(cleared, 'Nouvelle conversation : Claude repart de zéro (/clear).');
  });

  it('keeps the sub-agents’ hand-backs of older logs out of the conversation', () => {
    const items = buildFeed([logged(1, { k: 'peer', from: 'general-purpose', text: '[Subagent hand-back] The text below is the final report…' })]).items;
    assert.deepEqual(items, []);
  });

  it('names a sub-agent’s message after the sub-agent, and folds its report under its card', () => {
    const items = buildFeed([
      logged(1, { k: 'hire', id: 'task1', type: 'general-purpose', name: 'Mila', task: 'Tableau', prompt: 'go' }),
      logged(2, { k: 'peer', from: 'general-purpose', text: 'Done: server side.', subagent: 'task1' }),
      logged(3, { k: 'report', who: 'task1', text: 'All done.' }),
    ]).items;
    const message = items.find((item) => item.kind === 'peer');
    assert.deepEqual(message?.kind === 'peer' && message.subagent, { agentId: 'task1', name: 'Mila' });
    const card = items.find((item) => item.kind === 'subagent');
    assert.equal(card?.kind === 'subagent' && card.report, 'All done.');
  });

  it('survives an empty log and events about unknown sub-agents', () => {
    assert.deepEqual(buildFeed([]), { items: [], plan: [] });
    assert.doesNotThrow(() => buildFeed([logged(1, { k: 'report', who: 'ghost', text: 'x' }), logged(2, { k: 'act_done', who: 'chef', id: 'nope', ok: true })]));
  });
});

describe('who of the crew is free for a new session', () => {
  const crew = [{ name: 'Max', look: null, self: true }, { name: 'Lina', look: null }, { name: 'Tom', look: null }, { name: 'Zoé', look: null }];
  const people = availability(crew, [session('Lina', 'work'), session('Tom', 'wait', { resting: true })]);

  it('lists the crew without the user, each at their desk, resting or free', () => {
    assert.deepEqual(people.map(({ member, place }) => [member.name, place]), [['Lina', 'desk'], ['Tom', 'rest'], ['Zoé', 'free']]);
  });

  it('forgets someone asked for once they have a session', () => {
    assert.equal(stillFree('Zoé', people), 'Zoé');
    assert.equal(stillFree('Lina', people), null);
    assert.equal(stillFree('Max', people), null, 'the user never takes a session');
    assert.equal(stillFree(null, people), null);
  });
});

describe('a file\'s diff', () => {
  it('numbers the lines kept, added and removed, hunk by hunk', () => {
    assert.deepEqual(diffRows('@@ -3,2 +3,3 @@ function main\n keep\n-old\n+new\n+more\n\\ No newline at end of file\n@@ -10 +11 @@\n-x\n'), [
      { kind: 'hunk', before: 3, after: 3, text: 'function main' },
      { kind: 'context', before: 3, after: 3, text: 'keep' },
      { kind: 'remove', before: 4, after: null, text: 'old' },
      { kind: 'add', before: null, after: 4, text: 'new' },
      { kind: 'add', before: null, after: 5, text: 'more' },
      { kind: 'hunk', before: 10, after: 11, text: '' },
      { kind: 'remove', before: 10, after: null, text: 'x' },
    ]);
  });
});

describe('folders offered for a new session', () => {
  const directories = ['/Users/max/Projects', '/Users/max/Projects/api', '/Users/max/Projects/my-api', '/Users/max/apiary', '/Users/max/Notes'];

  it('offers every folder when nothing is typed, and those holding the text otherwise, the ones named by it first', () => {
    assert.deepEqual(matchFolders(directories, '  '), directories);
    assert.deepEqual(matchFolders(directories, 'API'), ['/Users/max/Projects/api', '/Users/max/apiary', '/Users/max/Projects/my-api']);
    assert.deepEqual(matchFolders(directories, 'nothing'), []);
  });

  it('reads a path typed with "~" or in full the same way', () => {
    assert.deepEqual(matchFolders(directories, '~/Projects/a'), ['/Users/max/Projects/api']);
    assert.deepEqual(matchFolders(directories, '/Users/max/Projects/a'), ['/Users/max/Projects/api']);
  });
});

describe('slash commands', () => {
  const commands: SlashCommand[] = [
    { name: 'web-test' }, { name: 'compact', description: 'Free up context' }, { name: 'kit:new', description: 'Start a new project' },
    { name: '__remote-workflow' }, { name: 'mcp__scrapegraph__quick_start_examples' }, { name: 'clear' }, { name: 'kit:status' }, { name: 'color' },
  ];

  it('puts the plugins\' commands first and hides internal and unusable ones', () => {
    assert.deepEqual(findCommands(commands, '').map((c) => c.name), ['kit:new', 'kit:status', 'web-test', 'compact', 'clear']);
  });

  it('matches every word in the name or the description', () => {
    assert.deepEqual(findCommands(commands, 'new project').map((c) => c.name), ['kit:new']);
    assert.deepEqual(findCommands(commands, 'context').map((c) => c.name), ['compact']);
  });

  it('suggests commands only while a command name is being typed', () => {
    assert.deepEqual(commandSuggestions(commands, '/').map((c) => c.name), ['kit:new', 'kit:status', 'btw', 'web-test', 'compact', 'clear']);
    assert.deepEqual(commandSuggestions(commands, '/kit').map((c) => c.name), ['kit:new', 'kit:status']);
    assert.deepEqual(commandSuggestions(commands, '/cle').map((c) => c.name), ['clear'], '/clear works: Open Space follows the new conversation');
    assert.deepEqual(commandSuggestions(commands, '/kit:new mon idée'), []);
    assert.deepEqual(commandSuggestions(commands, 'kit'), []);
    assert.deepEqual(commandSuggestions(commands, ' /kit'), []);
  });

  it('puts the command named as typed first, before a plugin that only mentions it', () => {
    const named = [{ name: 'seo:dataforseo', description: 'Live data via an MCP server' }, { name: 'mcp', description: 'Manage MCP servers' }, { name: 'kit:mcp-setup' }];
    assert.deepEqual(findCommands(named, 'mcp').map((c) => c.name), ['mcp', 'kit:mcp-setup', 'seo:dataforseo']);
  });

  it('hides what does nothing here: /fast, /rename, removed and renamed ones', () => {
    assert.deepEqual(findCommands([{ name: 'fast' }, { name: 'rename' }, { name: 'agents' }, { name: 'extra-usage' }, { name: 'usage' }], '').map((c) => c.name), ['usage']);
  });

  it('offers the values of a command once its name is typed, with what each does', () => {
    assert.deepEqual(commandSuggestions(commands, '/effort ').map((c) => c.name), ['effort low', 'effort medium', 'effort high', 'effort xhigh', 'effort max', 'effort auto']);
    assert.deepEqual(commandSuggestions(commands, '/model op').map((c) => c.name), ['model opus', 'model opusplan', 'model opus[1m]']);
    assert.equal(commandSuggestions(commands, '/advisor ').find((c) => c.name === 'advisor off')?.description, 'Sans conseiller');
    assert.deepEqual(commandSuggestions(commands, '/effort high '), [], 'a value already chosen');
    assert.deepEqual(commandSuggestions(commands, '/compact '), [], 'a command without values');
  });

  it('offers the values a skill lists in its argument hint, under its name or its alias', () => {
    const skills: SlashCommand[] = [{ name: 'impeccable:impeccable', aliases: ['impeccable'], argumentHint: '[shape · audit|critique · polish|live] [target]' }];
    assert.deepEqual(commandSuggestions(skills, '/impeccable ').map((c) => c.name), ['impeccable shape', 'impeccable audit', 'impeccable critique', 'impeccable polish', 'impeccable live']);
    assert.deepEqual(commandSuggestions(skills, '/impeccable:impeccable po').map((c) => c.name), ['impeccable:impeccable polish']);
    assert.equal(typedName(skills[0]), 'impeccable');
    assert.deepEqual(hintValues('<model>'), [], 'a hint naming one thing');
    assert.deepEqual(hintValues('[target]'), []);
  });

  it('finds the command typed under the caret, at the start or in the middle of a message', () => {
    assert.deepEqual(commandAt('/kit', 4), { start: 0, typed: '/kit' });
    assert.deepEqual(commandAt('fais-le avec /impec puis dis-moi', 19), { start: 13, typed: '/impec' });
    assert.deepEqual(commandAt('lance /impeccable po', 20), { start: 6, typed: '/impeccable po' });
    assert.equal(commandAt('lance /impeccable polish sur la page', 36), null, 'words after the value');
    assert.equal(commandAt('un chemin src/app', 17), null, 'a slash inside a word');
    assert.equal(commandAt('/kit:new mon idée', 17), null);
  });

  it('reads /model and /effort as a change of the session', () => {
    assert.deepEqual(tuning('/model sonnet'), { model: 'sonnet' });
    assert.deepEqual(tuning('/model default'), { model: '' });
    assert.deepEqual(tuning(' /effort high '), { effort: 'high' });
    assert.deepEqual(tuning('/effort auto'), { effort: '' });
    assert.equal(tuning('/effort extreme'), null);
    assert.equal(tuning('/model'), null);
    assert.equal(tuning('/compact'), null);
  });

  it('opens a view of its own for /mcp, /context and /usage typed alone', () => {
    assert.equal(nativeView('/mcp'), 'mcp');
    assert.equal(nativeView(' /context  '), 'context');
    assert.equal(nativeView('/usage'), 'usage');
    assert.equal(nativeView('/mcp add github'), null);
    assert.equal(nativeView('/compact'), null);
  });
});

describe('questionAnswers', () => {
  const single: Question = { question: 'Colour?', header: 'Colour', options: [{ label: 'Red', description: '' }, { label: 'Blue', description: '' }], multiSelect: false };
  const multi: Question = { question: 'Sizes?', header: 'Sizes', options: [{ label: 'S', description: '' }, { label: 'M', description: '' }], multiSelect: true };

  it('maps each question text to the chosen label, labels joined for multiSelect', () => {
    assert.deepEqual(questionAnswers([single, multi], { 'Colour?': ['Blue'], 'Sizes?': ['S', 'M'] }, {}), { 'Colour?': 'Blue', 'Sizes?': 'S, M' });
  });

  it('uses the user\'s own text: instead of the choice for one answer, in addition for several', () => {
    assert.deepEqual(questionAnswers([single, multi], { 'Colour?': ['Red'], 'Sizes?': ['S'] }, { 'Colour?': ' Green ', 'Sizes?': 'XL' }), { 'Colour?': 'Green', 'Sizes?': 'S, XL' });
  });

  it('leaves unanswered questions out', () => {
    assert.deepEqual(questionAnswers([single, multi], {}, { 'Sizes?': '  ' }), {});
  });
});

describe('usage of the subscription', () => {
  it('names the windows and says when they free up, relative to today', () => {
    assert.equal(quotaWindowName('seven_day'), '7 jours');
    assert.equal(quotaWindowName('seven_day_extra_usage'), 'seven day extra usage');
    const now = new Date(2026, 9, 16, 18, 0);
    assert.equal(resetLabel(new Date(2026, 9, 16, 19, 40).getTime() / 1000, now), 'aujourd’hui à 19:40');
    assert.equal(resetLabel(new Date(2026, 9, 17, 8, 0).getTime(), now), 'demain à 08:00');
    assert.equal(resetLabel(new Date(2026, 9, 19, 14, 0).getTime(), now), 'lundi à 14:00');
    assert.equal(resetLabel(new Date(2026, 10, 2, 9, 5).getTime(), now), 'le 2/11 à 09:05');
  });

  it('says how worrying a usage is', () => {
    assert.deepEqual([0.2, 0.75, 0.95].map(usageLevel), ['calm', 'rising', 'high']);
  });
});

describe('search in a thread', async () => {
  const { findAll, fold, foldQuery } = await import('../../shared/search.ts');
  it('ignores capitals and accents, and maps each match back to the original text', () => {
    const { folded, origin } = fold('Élève CAFÉ');
    assert.equal(folded, 'eleve cafe');
    assert.equal(origin.length, folded.length);
    assert.deepEqual(findAll(folded, foldQuery(' café ')), [6]);
    assert.equal(origin[6], 6);
    assert.deepEqual(findAll('aaaa', 'aa'), [0, 2], 'no overlap');
    assert.deepEqual(findAll('abc', ''), []);
  });
});

describe('messages being written', () => {
  const drafts = withPartial(withPartial({}, 's', 'chef', 'Je regarde'), 's', 'toolu_1', 'Je liste');

  it('keeps the text so far, by session and by writer', () => {
    assert.deepEqual(withPartial(drafts, 's', 'chef', 'Je regarde le code'), { s: { chef: 'Je regarde le code', toolu_1: 'Je liste' } });
  });

  it('drops a draft once its message arrives whole, and all of them when the turn ends', () => {
    assert.deepEqual(afterEvent(drafts, 's', { k: 'say', who: 'chef', text: 'Je regarde le code.' }), { s: { toolu_1: 'Je liste' } });
    assert.deepEqual(afterEvent(drafts, 's', { k: 'end', ok: true, text: '', ms: 1 }), {});
    assert.equal(afterEvent(drafts, 's', { k: 'act', who: 'chef', id: 'c', tool: 'Read', detail: '/a' }), drafts, 'unchanged otherwise');
    assert.equal(afterEvent(drafts, 'other', { k: 'end', ok: true, text: '', ms: 1 }), drafts);
    assert.equal(afterEvent(drafts, 's', { k: 'state', state: 'work' }), drafts, 'a waiting session that starts working again');
    assert.deepEqual(afterEvent(drafts, 's', { k: 'state', state: 'closed' }), {});
  });
});

describe('markdown', () => {
  it('gives every code block a copy button, its code escaped', () => {
    const html = mdToHtml('```js\nif (a < b) run();\n```');
    assert.match(html, /^<div class="cp-code"><pre><code class="language-js">if \(a &lt; b\) run\(\);\n<\/code><\/pre><button type="button" class="cp-code__copy" data-copy/);
    assert.ok(!mdToHtml('un `mot`').includes('data-copy'), 'not inline code');
  });
});

describe('side questions', () => {
  it('reads "/btw <question>" and offers /btw among the commands', () => {
    assert.equal(asideQuestion('/btw  où en es-tu ? '), 'où en es-tu ?');
    assert.equal(asideQuestion('/btw'), '');
    assert.equal(asideQuestion('/btwx'), null);
    assert.equal(asideQuestion('dis /btw'), null);
    assert.deepEqual(commandSuggestions([], '/bt').map((command) => command.name), ['btw']);
    assert.deepEqual(commandSuggestions([{ name: 'btw' }], '/btw').length, 1, 'not twice when Claude Code lists it too');
  });
});

describe('sessions open side by side', () => {
  it('fills the right column, then opens a second, then refuses past six', () => {
    let columns = addTo([['a']], 'b', 2)!;
    columns = addTo(columns, 'c', 2)!;
    assert.deepEqual(columns, [['a', 'b', 'c']]);
    columns = addTo(columns, 'd', 2)!;
    assert.deepEqual(columns, [['a', 'b', 'c'], ['d']]);
    columns = addTo(addTo(columns, 'e', 2)!, 'f', 2)!;
    assert.ok(isFull(columns, 2));
    assert.equal(addTo(columns, 'g', 2), null);
    assert.equal(addTo([['a', 'b', 'c']], 'd', 1), null, 'a window too narrow for a second column');
  });

  it('keeps every window in its column when one closes: only the ones under it move up', () => {
    assert.deepEqual(removeFrom([['a', 'b', 'c'], ['d', 'e']], 'a'), [['b', 'c'], ['d', 'e']]);
    assert.deepEqual(removeFrom([['a'], ['d', 'e']], 'a'), [['d', 'e']], 'an empty column goes');
    assert.deepEqual(addTo([['b', 'c'], ['d', 'e']], 'x', 2), [['b', 'c', 'x'], ['d', 'e']], 'the hole is filled first');
  });

  it('shows a clicked session in the place of the one in use', () => {
    assert.deepEqual(replaceIn([['a', 'b'], ['c']], 'b', 'x'), [['a', 'x'], ['c']]);
  });

  it('gives the keyboard to the window under the one closed, else above, else the other column', () => {
    assert.equal(nextFocus([['a', 'b', 'c']], 'b'), 'c');
    assert.equal(nextFocus([['a', 'b', 'c']], 'c'), 'b');
    assert.equal(nextFocus([['a'], ['d']], 'a'), 'd');
    assert.equal(nextFocus([['a']], 'a'), null);
  });

  it('places the windows: each column shares its height, a window alone takes all of it', () => {
    assert.equal(placement([['a', 'b']]).rows, 2);
    const { rows, slots } = placement([['a', 'b', 'c'], ['d']]);
    assert.equal(rows, 3);
    assert.deepEqual(slots.at(-1), { id: 'd', column: 1, row: 0, span: 3 });
  });

  it('in focus mode, opens the newest on the left, three columns, then splits the first, the second, the third, and refuses past six', () => {
    let columns: string[][] = [];
    for (const id of ['a', 'b', 'c']) columns = addTo(columns, id, 3, FOCUS_TILING)!;
    assert.deepEqual(columns, [['c'], ['b'], ['a']]);
    columns = addTo(columns, 'd', 3, FOCUS_TILING)!;
    assert.deepEqual(columns, [['d', 'c'], ['b'], ['a']]);
    columns = addTo(columns, 'e', 3, FOCUS_TILING)!;
    assert.deepEqual(columns, [['e', 'd'], ['c', 'b'], ['a']]);
    columns = addTo(columns, 'f', 3, FOCUS_TILING)!;
    assert.deepEqual(columns, [['f', 'e'], ['d', 'c'], ['b', 'a']]);
    assert.deepEqual(addTo([['c'], ['b', 'x'], ['a']], 'd', 3, FOCUS_TILING), [['d', 'c'], ['b', 'x'], ['a']], 'a shape set by hand is kept');
    assert.ok(isFull(columns, 3, FOCUS_TILING));
    assert.equal(addTo(columns, 'g', 3, FOCUS_TILING), null);
  });

  it('in focus mode, keeps the columns when one closes or is replaced, and fills a column that went', () => {
    assert.deepEqual(removeFrom([['e', 'd'], ['c', 'b'], ['a']], 'e', FOCUS_TILING), [['d'], ['c', 'b'], ['a']]);
    assert.deepEqual(removeFrom([['d', 'c'], ['b'], ['a']], 'b', FOCUS_TILING), [['d'], ['c'], ['a']]);
    assert.deepEqual(removeFrom([['b'], ['a']], 'b', FOCUS_TILING), [['a']]);
    assert.deepEqual(replaceIn([['f', 'e'], ['d', 'c'], ['b', 'a']], 'c', 'x'), [['f', 'e'], ['d', 'x'], ['b', 'a']]);
    assert.deepEqual(fitColumns([['e', 'd'], ['c', 'b'], ['a']], 2, FOCUS_TILING), [['e', 'd'], ['c', 'b']], 'the oldest close');
    assert.deepEqual(fitColumns([['c', 'b'], ['a']], 3, FOCUS_TILING), [['c'], ['b'], ['a']], 'a wider window spreads them out');
  });

  it('in focus mode, starts from the left and lets a window alone in its column take its height', () => {
    const { rows, slots } = placement([['d', 'c'], ['b'], ['a']], FOCUS_TILING);
    assert.equal(rows, 2);
    assert.deepEqual(slots.find(({ id }) => id === 'd'), { id: 'd', column: 2, row: 0, span: 1 }, 'the first column is the last from the right');
    assert.deepEqual(slots.find(({ id }) => id === 'b'), { id: 'b', column: 1, row: 0, span: 2 });
  });

  it('lays the open windows out again when focus mode comes or goes, closing the ones with no room', () => {
    assert.deepEqual(retile([['a', 'b', 'c'], ['d']], 3, FOCUS_TILING), [['d', 'c'], ['b'], ['a']], 'the last opened first');
    assert.deepEqual(retile([['d', 'c'], ['b'], ['a']], 2), [['a', 'b', 'c'], ['d']], 'and back in the order they were opened');
    assert.deepEqual(retile([['f', 'e'], ['d', 'c'], ['b', 'a']], 1), [['a', 'b', 'c']]);
    assert.equal(maxColumns(1440, FOCUS_TILING), 3, 'three columns beside the list on a laptop');
  });

  it('fits two columns from about 1100px, never more, and closes the one that no longer fits', () => {
    assert.equal(maxColumns(390), 1);
    assert.equal(maxColumns(1100), 1);
    assert.equal(maxColumns(1280), 2);
    assert.equal(maxColumns(3840), 2);
    assert.deepEqual(fitColumns([['a'], ['b']], 1), [['a']]);
  });
});
