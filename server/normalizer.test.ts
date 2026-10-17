import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { OfficeEvent, Quota, SlashCommand } from '../shared/protocol.ts';
import { asJson } from './json.ts';
import { Normalizer, describeRequest, ruleText, type InitInfo, type ToolRequest, type TurnResult } from './normalizer.ts';

function createNormalizer(peerName?: (address: string) => string) {
  const seen = { events: [] as OfficeEvent[], results: [] as TurnResult[], quotas: [] as Quota[], inits: [] as InitInfo[], commands: [] as SlashCommand[][], requests: [] as ToolRequest[], cancels: [] as string[], partials: [] as string[], order: [] as string[] };
  const normalizer = new Normalizer({
    emit: (event) => { seen.events.push(event); seen.order.push(event.k); },
    onInit: (info) => seen.inits.push(info), onCommands: (commands) => seen.commands.push(commands),
    onQuota: (quota) => seen.quotas.push(quota), onResult: (result) => seen.results.push(result),
    onRequest: (request) => { seen.requests.push(request); seen.order.push('request'); }, onCancel: (requestId) => seen.cancels.push(requestId), onPartial: (who, text) => seen.partials.push(`${who}:${text}`),
    names: new Set(), peerName,
  });
  return { normalizer, ...seen };
}

/** Replays a captured stream-json file (real `claude -p` output, see fixtures/) through a Normalizer. */
function replay(fixture: string) {
  const created = createNormalizer();
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
    assert.deepEqual(inits, [{ model: 'claude-haiku-5-5', commands: ['kit:new', 'kit:status', 'superpowers:brainstorming', 'compact'], socket: '' }], 'recorded before Claude Code had sockets');
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

  it('names a session answered at its socket after the session living there', () => {
    const { normalizer, events: seen } = createNormalizer((address) => (address === 'uds:/tmp/cc-socks/1.sock' ? 'Charline' : address));
    normalizer.handle({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'SendMessage', input: { to: 'uds:/tmp/cc-socks/1.sock', message: 'Je vais bien', summary: '' } }] } });
    assert.deepEqual(seen.map((event) => event.k === 'act' && event.detail), ['→ Charline : Je vais bien']);
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
