import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { BackgroundTask, OfficeEvent, Quota, SlashCommand } from '../shared/protocol.ts';
import { asJson } from './json.ts';
import { Normalizer, describeRequest, ruleText, type AgentLaunch, type InitInfo, type ScheduleChange, type ToolRequest, type TurnResult } from './normalizer.ts';

function createNormalizer(peerName?: (address: string) => string, agentLaunch?: (agentId: string) => AgentLaunch | null) {
  const files: { who: string; caption: string; files: readonly { path: string; size: number; image: boolean }[]; display: string }[] = [];
  const seen = { files, events: [] as OfficeEvent[], results: [] as TurnResult[], quotas: [] as Quota[], inits: [] as InitInfo[], commands: [] as SlashCommand[][], requests: [] as ToolRequest[], cancels: [] as string[], partials: [] as string[], order: [] as string[], background: [] as BackgroundTask[][], schedules: [] as ScheduleChange[] };
  const normalizer = new Normalizer({
    emit: (event) => { seen.events.push(event); seen.order.push(event.k); },
    onInit: (info) => seen.inits.push(info), onCommands: (commands) => seen.commands.push(commands),
    onQuota: (quota) => seen.quotas.push(quota), onResult: (result) => seen.results.push(result),
    onRequest: (request) => { seen.requests.push(request); seen.order.push('request'); }, onCancel: (requestId) => seen.cancels.push(requestId), onPartial: (who, text) => seen.partials.push(`${who}:${text}`),
    onBackground: (tasks) => seen.background.push(tasks), onSchedule: (change) => seen.schedules.push(change),
    names: new Set(), peerName, agentLaunch, onFiles: (who, caption, sent, display) => files.push({ who, caption, files: sent, display }),
  });
  return { normalizer, ...seen };
}

/** Replays a captured stream-json file (real `claude -p` output, see fixtures/) through a Normalizer. */
function replay(fixture: string, agentLaunch?: (agentId: string) => AgentLaunch | null) {
  const created = createNormalizer(undefined, agentLaunch);
  const refused: string[] = [];
  const lines = readFileSync(new URL(`./fixtures/${fixture}.jsonl`, import.meta.url), 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    const refusedId = created.normalizer.handle(asJson(JSON.parse(line)));
    if (refusedId) refused.push(refusedId);
  }
  return { ...created, refused };
}

describe('Normalizer on a real simple turn', () => {
  const { events, results, quotas, inits, partials } = replay('simple-turn');

  it('reads model and slash commands from the init message', () => {
    assert.deepEqual(inits, [{ model: 'claude-haiku-5-5', commands: ['kit:new', 'kit:status', 'superpowers:brainstorming', 'compact'], socket: '', conversationId: 'b40531d7-8ea6-4c7f-875e-058a07dcfee9', version: '2.1.301' }], 'recorded before Claude Code had sockets');
    assert.deepEqual(events[0], { k: 'init', model: 'claude-haiku-5-5' });
  });

  it('emits what the assistant said', () => {
    assert.ok(events.some((event) => event.k === 'say' && event.who === 'chef' && event.text === 'pong'));
  });

  it('reports the end of the turn', () => {
    assert.deepEqual(results, [{ ok: true, text: 'pong', ms: 2429 }]);
  });

  it('reads the five-hour quota', () => {
    assert.deepEqual(quotas, [{ fiveHour: 0.02, resetsAt: 1792149600, windows: [{ name: 'five_hour', utilization: 0.02, resetsAt: 1792149600 }, { name: 'seven_day', utilization: 0.1, resetsAt: 1792627200 }] }]);
  });

  it('passes the text on while it is being written', () => {
    assert.deepEqual(partials, ['chef:pong']);
  });

  it('does not emit partial-message noise as events', () => {
    assert.deepEqual([...new Set(events.map((event) => event.k))].sort(), ['init', 'say']);
  });
});

describe('Normalizer on a real permission request (allowed)', () => {
  const { requests, results, order } = replay('permission-allowed');
  const request = requests[0];

  it('passes the control_request on with the tool input and the suggested rules', () => {
    assert.equal(requests.length, 1);
    assert.equal(request.tool, 'Bash');
    assert.equal(request.who, 'chef');
    assert.deepEqual(request.input, { command: 'touch created-by-bureau.txt', description: 'Create empty file created-by-bureau.txt' });
    // only addRules suggestions are kept (addDirectories is dropped)
    assert.deepEqual(request.suggestions, [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'touch created-by-bureau.txt' }], behavior: 'allow', destination: 'localSettings' }]);
  });

  it('describes it as a yes/no with the exact command', () => {
    const ask = describeRequest(request, '/work/lab1');
    assert.equal(ask.canAlways, true);
    assert.equal(ask.questions, undefined);
    assert.equal(ask.detail, 'touch created-by-bureau.txt');
    assert.deepEqual(ask.always, ['la commande « touch created-by-bureau.txt »'], 'what "Toujours" allows');
  });

  it('says in words what a suggested rule allows', () => {
    assert.equal(ruleText({ toolName: 'Bash', ruleContent: 'npm test:*' }), 'les commandes qui commencent par « npm test »');
    assert.equal(ruleText({ toolName: 'Edit', ruleContent: 'src/**' }), 'Edit sur « src/** »');
    assert.equal(ruleText({ toolName: 'WebFetch' }), 'WebFetch, pour tout');
  });

  it('orders events: act, request, act_done', () => {
    assert.deepEqual(order.filter((kind) => ['act', 'request', 'act_done'].includes(kind)), ['act', 'request', 'act_done']);
  });

  it('ends the turn successfully', () => {
    assert.equal(results[0].ok, true);
  });
});

describe('AskUserQuestion', () => {
  const questions = [
    { question: 'Which colour?', header: 'Colour', options: [{ label: 'Red', description: 'warm' }, { label: 'Blue', description: 'cold' }], multiSelect: false },
    { question: 'Which sizes?', header: 'Sizes', options: [{ label: 'S', description: '' }, { label: 'M', description: '' }], multiSelect: true },
  ];
  const request: ToolRequest = { requestId: 'q1', who: 'chef', tool: 'AskUserQuestion', input: { questions }, suggestions: [] };

  it('becomes a question with its options, never an "always"', () => {
    const ask = describeRequest(request, '/work');
    assert.deepEqual(ask.questions, questions);
    assert.equal(ask.canAlways, false);
    assert.equal(ask.detail, 'Which colour?\nWhich sizes?');
  });

  it('falls back to a yes/no when the input does not have the expected shape', () => {
    const ask = describeRequest({ ...request, input: { questions: 'nope' } }, '/work');
    assert.equal(ask.questions, undefined);
  });
});

describe('Normalizer on a real permission request (denied by the host)', () => {
  const { events, results } = replay('permission-denied');

  it('marks the tool call as failed', () => {
    const done = events.find((event) => event.k === 'act_done');
    assert.ok(done && done.k === 'act_done' && done.ok === false);
  });

  it('still ends the turn normally', () => {
    assert.equal(results[0].ok, true);
    assert.match(results[0].text, /REFUSED/);
  });
});

describe('Normalizer on a real sub-agent sent to the background', () => {
  const { events, results } = replay('subagent-background');
  const agentId = 'toolu_01XoChX6kX9cKzHZPRYVCWGe';

  it('keeps it at work past the placeholder its launch returns, and lets it leave with its real report', () => {
    assert.deepEqual(events.filter((event) => event.k === 'hire' || event.k === 'report' || event.k === 'leave').map((event) => event.k), ['hire', 'report', 'leave']);
    const report = events.find((event) => event.k === 'report');
    assert.equal(report?.k === 'report' && report.text, 'ok');
    const leave = events.find((event) => event.k === 'leave');
    assert.ok(leave?.k === 'leave' && leave.who === agentId && leave.ok && leave.tokens > 0);
    assert.equal(results.length, 2, 'its end starts a turn of the main agent of its own');
  });
});

describe('Normalizer on a real Bash command sent to the background', () => {
  const { background, events, results } = replay('bash-background');

  it('tells which commands run in the background, until there are none', () => {
    assert.deepEqual(background, [[{ id: 'brd1kvdrn', description: 'Run a 12-second background sleep then echo finished' }], []]);
    assert.equal(events.filter((event) => event.k === 'hire').length, 0, 'a command is not a sub-agent');
    assert.equal(results.length, 2, 'its end starts a turn of its own');
  });

  it('leaves background sub-agents out: they come and go as hire and leave events', () => {
    assert.deepEqual(replay('subagent-background').background, [[], []]);
  });
});

describe('Normalizer on what the agent plans for later', () => {
  it('tells a /loop wake-up or a cron job once its call went through, not a refused one nor a sub-agent\'s', () => {
    const { normalizer, schedules } = createNormalizer();
    const call = (id: string, name: string, input: Record<string, unknown>, isError = false, parent: string | null = null) => {
      normalizer.handle({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'tool_use', id, name, input }] } });
      normalizer.handle({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok', is_error: isError }] } });
    };
    call('w1', 'ScheduleWakeup', { delaySeconds: 1200, prompt: '/loop check', reason: 'r' });
    call('c1', 'CronCreate', { cron: '30 14 28 2 *', prompt: 'remind', recurring: false });
    call('c2', 'CronCreate', { cron: '*/5 * * * *', prompt: 'tick' }, true);
    call('c3', 'CronCreate', { cron: '*/5 * * * *', prompt: 'tick' }, false, 'task1');
    call('d1', 'CronDelete', { id: 'abc' });
    call('w2', 'ScheduleWakeup', { stop: true });
    assert.deepEqual(schedules, [
      { kind: 'wakeup', seconds: 1200 }, { kind: 'cron', cron: '30 14 28 2 *', recurring: false }, { kind: 'cron_delete' }, { kind: 'wakeup_stop' },
    ]);
  });
});

describe('Normalizer on a real sub-agent with its text forwarded', () => {
  const { events } = replay('subagent-forwarded');
  const agentId = 'toolu_01MWpLFovyxfk3GDNCiFkgs1';
  const ofAgent = events.filter((event) => 'who' in event && event.who === agentId);

  it('shows what the sub-agent writes, under its own id', () => {
    assert.ok(ofAgent.some((event) => event.k === 'say' && event.text === 'I will list the folder now.'));
  });

  it('takes its report from handback_report, not from the summary that only points to it', () => {
    const reports = events.filter((event) => event.k === 'report');
    assert.equal(reports.length, 1);
    assert.match(reports[0].k === 'report' ? reports[0].text : '', /^I will list the folder now\.\n\nRan `ls \| wc -l`/);
  });

  it('leaves once, without a stray action for the handback nor for the Task result', () => {
    assert.deepEqual(events.filter((event) => event.k === 'leave').map((event) => event.k === 'leave' && event.ok), [true]);
    assert.ok(!events.some((event) => event.k === 'act' && event.tool === 'SubagentHandback'));
    assert.ok(!events.some((event) => event.k === 'act_done' && event.id === agentId));
  });
});

describe('Normalizer on a real sub-agent woken up again by SendMessage after its process ended', () => {
  // the process that launched it was stopped while it worked; this one resumes the conversation, then sends it a message
  const launchCall = 'toolu_011wextvJCeHP1eMLv9u8B19';
  const sendCall = 'toolu_01CvPKKY8zjziCkGFB8uLnUi';
  const asked: string[] = [];
  const { events } = replay('subagent-revived', (agentId) => {
    asked.push(agentId);
    return agentId === 'a7aee1b457a5fc39d' ? { call: launchCall, type: 'general-purpose' } : null;
  });

  it('hires it again under the id of the Agent call its messages carry', () => {
    const hires = events.filter((event) => event.k === 'hire');
    assert.equal(hires.length, 1);
    assert.ok(hires[0].k === 'hire' && hires[0].id === launchCall && hires[0].type === 'general-purpose' && hires[0].task === 'Sleeper');
    assert.match(hires[0].k === 'hire' ? hires[0].prompt : '', /^Run Bash `sleep 15` once more/);
    assert.deepEqual(asked, ['a7aee1b457a5fc39d']);
    assert.ok(events.some((event) => event.k === 'act' && event.who === launchCall && event.tool === 'Bash'));
  });

  it('lets it leave when its end comes under the id of the SendMessage call', () => {
    assert.deepEqual(events.filter((event) => event.k === 'leave').map((event) => event.k === 'leave' && [event.who, event.ok]), [[launchCall, true]]);
    assert.ok(!events.some((event) => 'who' in event && event.who === sendCall));
  });

  it('passes on its report', () => {
    assert.deepEqual(events.filter((event) => event.k === 'report').map((event) => event.k === 'report' && [event.who, event.text]), [[launchCall, 'done\n\nresumed']]);
  });

  it('cannot place it without its launch record, and shows nothing then', () => {
    const { events: blind } = replay('subagent-revived');
    assert.ok(!blind.some((event) => event.k === 'hire' || event.k === 'leave'));
  });
});

describe('Normalizer on a real message between two sessions (SendMessage)', () => {
  const { events, inits, order } = replay('peer-message');

  it('keeps the socket other sessions reach this one at', () => {
    assert.equal(inits[0].socket, '/tmp/cc-socks/22286.sock');
  });

  it('shows who a message goes to and what it is about', () => {
    assert.ok(events.some((event) => event.k === 'act' && event.tool === 'SendMessage' && event.detail === '→ Bob Test : ping'));
  });

  it('shows the message that started a turn, told at its end, before the end', () => {
    assert.deepEqual(events.filter((event) => event.k === 'peer'), [{ k: 'peer', from: 'Bob Test', text: 'Pong de Bob : ping bien reçu.' }]);
    assert.ok(order.indexOf('peer') > order.lastIndexOf('init'), 'with the second turn, the one it started');
  });

  it('leaves out a background sub-agent’s hand-back: it repeats the report of its task notification', () => {
    const { normalizer, events: seen } = createNormalizer();
    normalizer.handle({ type: 'result', subtype: 'success', is_error: false, result: '', duration_ms: 1, origin: { kind: 'peer', name: 'general-purpose', body: '[Subagent hand-back] The text below is the final report of a subagent…\n  Done.' } });
    assert.deepEqual(seen.filter((event) => event.k === 'peer'), []);
  });

  it('marks the other messages of a background sub-agent as its own, by the task id its launch gave', () => {
    const { normalizer, events: seen } = createNormalizer();
    normalizer.handle({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'task1', name: 'Agent', input: { subagent_type: 'general-purpose', description: 'Tableau', prompt: 'go', run_in_background: true } }] } });
    normalizer.handle({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'task1', content: 'launched' }] }, tool_use_result: { isAsync: true, status: 'async_launched', agentId: 'a04f5ae49b848c901' } });
    normalizer.handle({ type: 'result', subtype: 'success', is_error: false, result: '', duration_ms: 1, origin: { kind: 'peer', from: 'a04f5ae49b848c901', senderTaskId: 'a04f5ae49b848c901', name: 'general-purpose', body: 'Done: server side.\nLeft: the panel.' } });
    assert.deepEqual(seen.filter((event) => event.k === 'peer'), [{ k: 'peer', from: 'general-purpose', text: 'Done: server side.\nLeft: the panel.', subagent: 'task1' }]);
  });

  it('names a session answered at its socket after the session living there', () => {
    const { normalizer, events: seen } = createNormalizer((address) => (address === 'uds:/tmp/cc-socks/1.sock' ? 'Margot' : address));
    normalizer.handle({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'SendMessage', input: { to: 'uds:/tmp/cc-socks/1.sock', message: 'Je vais bien', summary: '' } }] } });
    assert.deepEqual(seen.map((event) => event.k === 'act' && event.detail), ['→ Margot : Je vais bien']);
  });
});

describe('Normalizer on files Claude sends the user (SendUserFile, as seen with 2.1.302)', () => {
  it('passes the files on with their caption once sent, with no action line', () => {
    const { normalizer, events, files } = createNormalizer();
    normalizer.handle({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'f1', name: 'SendUserFile', input: { files: ['/repo/shot.png'], caption: 'test', status: 'normal' } }] } });
    normalizer.handle({
      type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'f1', content: '1 file delivered to user.' }] },
      tool_use_result: { caption: 'test', attachments: [{ path: '/repo/shot.png', size: 1396, isImage: true, media_type: 'image/png', pathValidated: true }, { path: '/nope', size: 1, pathValidated: false }] },
    });
    assert.deepEqual(files, [{ who: 'chef', caption: 'test', files: [{ path: '/repo/shot.png', size: 1396, image: true }], display: '' }]);
    assert.deepEqual(events, []);
  });
});

describe('Normalizer on pages Claude publishes (Artifact, as in the transcripts of 2.1.302)', () => {
  it('passes a published page on with its claude.ai address and its file, and keeps its action line', () => {
    const published: { who: string; artifact: { url: string; path: string; title: string } }[] = [];
    const events: OfficeEvent[] = [];
    const normalizer = new Normalizer({
      emit: (event) => events.push(event), onInit: () => {}, onCommands: () => {}, onQuota: () => {}, onResult: () => {}, onRequest: () => {}, onCancel: () => {}, onPartial: () => {},
      names: new Set(), onArtifact: (who, artifact) => published.push({ who, artifact }),
    });
    const url = 'https://claude.ai/code/artifact/45d6ab09-7dfe-4be7-b936-67421f2ca900';
    const call = (id: string, input: object, result: object, isError = false) => {
      normalizer.handle({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Artifact', input }] } });
      normalizer.handle({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: `Published at ${url}`, is_error: isError }] }, tool_use_result: result });
    };
    call('a1', { file_path: '/tmp/headers.html', description: 'Quatre en-têtes' }, { url, path: '/tmp/headers.html', artifact_id: 'x', title: 'Headers', updated: false });
    call('a2', { action: 'list' }, { url, path: '/tmp/headers.html' });
    call('a3', { file_path: '/tmp/x.html' }, { url: 'https://evil.example/artifact/1', path: '/tmp/x.html' });
    call('a4', { file_path: '/tmp/y.html' }, { url, path: '/tmp/y.html' }, true);
    assert.deepEqual(published, [{ who: 'chef', artifact: { url, path: '/tmp/headers.html', title: 'Headers' } }]);
    assert.deepEqual(events.filter((event) => event.k === 'act').length, 4, 'each call keeps its action line');
  });
});

describe('Normalizer on the context (as seen with 2.1.302)', () => {
  it('measures the context at each answer of the session’s own agent, the window at a turn’s end, and tells a compaction', () => {
    const contexts: { used?: number; max?: number }[] = [];
    const seen: OfficeEvent[] = [];
    const normalizer = new Normalizer({
      emit: (event) => seen.push(event), onInit: () => {}, onCommands: () => {}, onQuota: () => {}, onResult: () => {}, onRequest: () => {}, onCancel: () => {}, onPartial: () => {},
      names: new Set(), onContext: (context) => contexts.push(context),
    });
    normalizer.handle({ type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 2, cache_creation_input_tokens: 14454, cache_read_input_tokens: 15310, output_tokens: 4 } } });
    normalizer.handle({ type: 'assistant', parent_tool_use_id: 'agent', message: { content: [{ type: 'text', text: 'sub' }], usage: { input_tokens: 999 } } });
    normalizer.handle({ type: 'result', subtype: 'success', is_error: false, result: 'ok', duration_ms: 1, modelUsage: { 'claude-haiku-5-5': { contextWindow: 1000000 } } });
    normalizer.handle({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 29998, post_tokens: 5250 } });
    assert.deepEqual(contexts, [{ used: 29770 }, { max: 1000000 }, { used: 5250 }], 'a sub-agent’s own context is left out');
    assert.deepEqual(seen.filter((event) => event.k === 'compact'), [{ k: 'compact', auto: false, before: 29998, after: 5250 }]);
  });
});

describe('Normalizer robustness', () => {
  it('asks to refuse control requests it does not know', () => {
    const { normalizer } = createNormalizer();
    assert.equal(normalizer.handle({ type: 'control_request', request_id: 'r1', request: { subtype: 'mystery' } }), 'r1');
  });

  it('passes a cancelled request on', () => {
    const { normalizer, requests, cancels } = createNormalizer();
    normalizer.handle({ type: 'control_request', request_id: 'r2', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' }, permission_suggestions: [] } });
    normalizer.handle({ type: 'control_cancel_request', request_id: 'r2' });
    assert.deepEqual(requests.map((request) => request.requestId), ['r2']);
    assert.deepEqual(cancels, ['r2']);
  });

  it('tracks sub-agents from the Task call to the tool result', () => {
    const { normalizer, events } = createNormalizer();
    normalizer.handle({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Task', input: { subagent_type: 'explorer', description: 'Look around', prompt: 'Do it' } }] } });
    assert.deepEqual([...normalizer.present], ['t1']);
    normalizer.handle({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'found it' }] }, tool_use_result: { status: 'completed', totalTokens: 10, totalToolUseCount: 2, totalDurationMs: 50 } });
    assert.deepEqual([...normalizer.present], []);
    assert.deepEqual(events.map((event) => event.k), ['hire', 'report', 'leave']);
  });

  it('keeps a sub-agent sent to the background at work until its task notification, which brings its report', () => {
    const { normalizer, events } = createNormalizer();
    normalizer.handle({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Agent', input: { subagent_type: 'general-purpose', description: 'Translate', prompt: 'Go', run_in_background: true } }] } });
    normalizer.handle({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: 'Async agent launched' }] }, tool_use_result: { status: 'async_launched', agentId: 'a1' } });
    assert.deepEqual([...normalizer.present], ['t2'], 'still at work');
    assert.deepEqual(events.map((event) => event.k), ['hire']);
    normalizer.handle({ type: 'system', subtype: 'task_notification', task_id: 'a1', tool_use_id: 't2', status: 'completed', output_file: '/tmp/out', summary: 'Translated 40 strings.', usage: { total_tokens: 900, tool_uses: 4, duration_ms: 60000 } });
    assert.deepEqual([...normalizer.present], []);
    assert.deepEqual(events.map((event) => event.k), ['hire', 'report', 'leave']);
    assert.deepEqual(events.at(-2), { k: 'report', who: 't2', text: 'Translated 40 strings.' });
  });

  it('ignores unknown message types and malformed content without throwing', () => {
    const { normalizer, events } = createNormalizer();
    for (const message of [{ type: 'future_type' }, { type: 'assistant' }, { type: 'assistant', message: { content: 'text' } }, { type: 'user', message: {} }, { type: 'stream_event' }, {}]) {
      assert.doesNotThrow(() => normalizer.handle(message));
    }
    assert.deepEqual(events, []);
  });

  it('turns commands_changed into slash command descriptions', () => {
    const { normalizer, commands } = createNormalizer();
    normalizer.handle({ type: 'system', subtype: 'commands_changed', commands: [{ name: 'kit:new', description: 'Start a project', argumentHint: '<idea>', builtin: false }, { description: 'no name' }] });
    assert.deepEqual(commands, [[{ name: 'kit:new', description: 'Start a project', argumentHint: '<idea>' }]]);
  });
});
