// Translates what a `claude -p --output-format stream-json` process says into OfficeEvents.
// `who` is "chef" (the main agent of the session) or the tool_use id of the Task/Agent call that
// started a sub-agent (every message of that sub-agent carries it as parent_tool_use_id).
import { actDetail, permissionDetail, SUBAGENT_NAMES, cut } from '../shared/activity.ts';
import type { OfficeEvent, PlanItem, Question, Quota, SlashCommand } from '../shared/protocol.ts';
import { asArray, asJson, asNumber, asString, type Json } from './json.ts';

export interface TurnResult { ok: boolean; text: string; ms: number }

/** `socket`: where other Claude Code sessions reach this one ("/tmp/cc-socks/<pid>.sock"; their SendMessage calls write "uds:" before it). */
export interface InitInfo { model: string; commands: string[]; socket: string }

/** A can_use_tool control request: a tool call (or an AskUserQuestion call) waiting for the user. */
export interface ToolRequest { requestId: string; who: string; tool: string; input: Record<string, unknown>; suggestions: Json[] }

export type AskEvent = Extract<OfficeEvent, { k: 'ask' }>;

export interface NormalizerOptions {
  emit: (event: OfficeEvent) => void;
  onInit: (info: InitInfo) => void;
  onCommands: (commands: SlashCommand[]) => void;
  onQuota: (quota: Quota) => void;
  onResult: (result: TurnResult) => void;
  onRequest: (request: ToolRequest) => void;
  /** Claude Code withdrew a request (it will not wait for the answer any more) */
  onCancel: (requestId: string) => void;
  /** the text of a message still being written, so far (it then arrives whole as a `say` event) */
  onPartial: (who: string, text: string) => void;
  /** first names already taken by sub-agents of this session (shared across resumes) */
  names: Set<string>;
  /** the name of the session a SendMessage call goes to: its `to` is a name, or a socket address when answering one */
  peerName?: (address: string) => string;
}

export class Normalizer {
  private whoOfTool = new Map<string, string>(); // tool call id -> who made it
  private reported = new Set<string>();
  /** every sub-agent called, gone or not */
  private hired = new Set<string>();
  /** the text being written, by who writes it */
  private writing = new Map<string, string>();
  /** sub-agents currently working (called, not yet gone) */
  readonly present = new Set<string>();

  private options: NormalizerOptions;

  constructor(options: NormalizerOptions) {
    this.options = options;
  }

  private pickName() {
    const { names } = this.options;
    const name = SUBAGENT_NAMES.find((candidate) => !names.has(candidate)) ?? `Renfort ${names.size + 1}`;
    names.add(name);
    return name;
  }

  /** Handles one line of the stream. Returns the id of a control request that must be refused (unknown kind), else null. */
  handle(message: Json): string | null {
    switch (message.type) {
      case 'system': this.system(message); break;
      case 'assistant': this.assistant(message); break;
      case 'user': this.user(message); break;
      case 'stream_event': this.partial(message); break;
      case 'result': {
        // a turn started by another session's message: Claude Code only says so here, at its end
        const origin = asJson(message.origin);
        if (origin.kind === 'peer' && asString(origin.body).trim()) this.options.emit({ k: 'peer', from: asString(origin.name) || 'Une autre session', text: asString(origin.body).slice(0, 20000) });
        this.options.onResult({
          ok: !message.is_error && message.subtype === 'success', text: asString(message.result), ms: asNumber(message.duration_ms),
        });
        break;
      }
      case 'rate_limit_event': {
        const windows = Object.entries(asJson(asJson(message.rate_limit_info).unifiedWindows)).map(([name, raw]) => {
          const window = asJson(raw);
          return { name, utilization: asNumber(window.utilization), resetsAt: asNumber(window.resetsAt) || null };
        });
        const fiveHour = windows.find((window) => window.name === 'five_hour');
        if (fiveHour) this.options.onQuota({ fiveHour: fiveHour.utilization, resetsAt: fiveHour.resetsAt, windows });
        break;
      }
      case 'control_request': return this.controlRequest(message);
      case 'control_cancel_request': this.options.onCancel(asString(message.request_id)); break;
    }
    return null;
  }

  private controlRequest(message: Json): string | null {
    const requestId = asString(message.request_id);
    const request = asJson(message.request);
    if (request.subtype !== 'can_use_tool') return requestId;
    this.options.onRequest({
      requestId,
      who: this.whoOfTool.get(asString(request.tool_use_id)) ?? 'chef',
      tool: asString(request.tool_name),
      input: asJson(request.input) as Record<string, unknown>,
      suggestions: asArray(request.permission_suggestions).map(asJson).filter((s) => s.type === 'addRules'),
    });
    return null;
  }

  /** A chunk of a message being written (--include-partial-messages): only text is passed on, thinking is not shown. */
  private partial(message: Json) {
    const who = asString(message.parent_tool_use_id) || 'chef';
    const event = asJson(message.event);
    if (event.type === 'content_block_start') this.writing.delete(who);
    const delta = asJson(event.delta);
    if (event.type !== 'content_block_delta' || delta.type !== 'text_delta') return;
    const text = (this.writing.get(who) ?? '') + asString(delta.text);
    this.writing.set(who, text);
    this.options.onPartial(who, text);
  }

  private system(message: Json) {
    switch (message.subtype) {
      case 'init':
        this.options.onInit({
          model: asString(message.model),
          commands: asArray(message.slash_commands).filter((name): name is string => typeof name === 'string'),
          socket: asString(message.messaging_socket_path),
        });
        this.options.emit({ k: 'init', model: asString(message.model) });
        break;
      case 'commands_changed':
        this.options.onCommands(asArray(message.commands).map(asJson).filter((c) => asString(c.name)).map((c) => ({
          name: asString(c.name), description: cut(c.description, 200) || undefined, argumentHint: asString(c.argumentHint) || undefined,
        })));
        break;
      case 'task_notification': {
        // the end of a task, sub-agents included (in the background or not, it comes before the Task call's result).
        // The report is in handback_report when the sub-agent handed it back; the summary then only says so.
        const id = asString(message.tool_use_id);
        if (!id || !message.status) break;
        const report = asString(asJson(message.handback_report).text) || asString(message.summary);
        if (report.trim() && this.present.has(id) && !this.reported.has(id)) {
          this.reported.add(id);
          this.options.emit({ k: 'report', who: id, text: report.slice(0, 20000) });
        }
        this.leave(id, message.status === 'completed', asJson(message.usage));
        break;
      }
    }
  }

  private leave(id: string, ok: boolean, usage: Json = {}) {
    if (!this.present.delete(id)) return;
    this.options.emit({ k: 'leave', who: id, ok, tokens: asNumber(usage.total_tokens), tools: asNumber(usage.tool_uses), ms: asNumber(usage.duration_ms) });
  }

  private assistant(message: Json) {
    const who = asString(message.parent_tool_use_id) || 'chef';
    for (const block of asArray(asJson(message.message).content).map(asJson)) {
      if (block.type === 'thinking') {
        this.options.emit({ k: 'think', who });
      } else if (block.type === 'text' && asString(block.text).trim()) {
        this.options.emit({ k: 'say', who, text: asString(block.text) });
      } else if (block.type === 'tool_use') {
        this.toolUse(who, block);
      }
    }
  }

  private toolUse(who: string, block: Json) {
    const id = asString(block.id);
    const name = asString(block.name);
    const input = asJson(block.input) as Record<string, unknown>;
    // how a sub-agent hands its report back: the report itself comes with its end
    if (name === 'SubagentHandback') return;
    this.whoOfTool.set(id, who);
    if (name === 'Agent' || name === 'Task') {
      const type = asString(input.subagent_type);
      this.present.add(id);
      this.hired.add(id);
      this.options.emit({ k: 'hire', id, type, name: this.pickName(), task: cut(input.description || type, 48), prompt: cut(input.prompt, 2000) });
    } else if (name === 'TodoWrite' && who === 'chef') {
      const items: PlanItem[] = asArray(input.todos).map(asJson).map((todo) => ({
        text: cut(todo.content ?? todo.activeForm, 90),
        status: todo.status === 'completed' ? 'completed' : todo.status === 'in_progress' ? 'in_progress' : 'pending',
      }));
      this.options.emit({ k: 'plan', items });
    } else if (name === 'SendMessage') {
      const to = asString(input.to);
      const recipient = this.options.peerName?.(to) ?? to;
      this.options.emit({ k: 'act', who, id, tool: name, detail: cut(`→ ${recipient || 'une autre session'} : ${asString(input.summary) || asString(input.message)}`, 160) });
    } else {
      this.options.emit({ k: 'act', who, id, tool: name, detail: actDetail(name, input) });
    }
  }

  private user(message: Json) {
    for (const block of asArray(asJson(message.message).content).map(asJson)) {
      if (block.type !== 'tool_result') continue;
      const id = asString(block.tool_use_id);
      const who = this.whoOfTool.get(id);
      if (who === undefined) continue;
      if (this.present.has(id)) {
        // a sub-agent's report comes back to the main agent as the tool result of the Task call
        const result = asJson(message.tool_use_result);
        // except for one sent to the background (or elsewhere): that result is a placeholder, and the sub-agent goes on
        // working until its task_notification
        if (result.status === 'async_launched' || result.status === 'remote_launched') continue;
        if (!this.reported.has(id)) {
          const text = asString(asJson(result.handbackReport).text) || textOf(block.content);
          if (text.trim()) { this.reported.add(id); this.options.emit({ k: 'report', who: id, text: text.slice(0, 20000) }); }
        }
        const usage = asJson(result.usage);
        this.leave(id, !block.is_error && result.status !== 'failed', Object.keys(usage).length ? usage : { total_tokens: result.totalTokens, tool_uses: result.totalToolUseCount, duration_ms: result.totalDurationMs });
        continue;
      }
      // the result of a Task call whose sub-agent already left with its task_notification
      if (this.hired.has(id)) continue;
      this.options.emit({ k: 'act_done', who, id, ok: !block.is_error });
    }
  }
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return asArray(content).map((part) => (asString(asJson(part).type) === 'text' ? asString(asJson(part).text) : '')).join('\n');
}

/** The questions of an AskUserQuestion call, or null when the input does not have the expected shape. */
export function parseQuestions(input: Record<string, unknown>): Question[] | null {
  const questions = asArray(input.questions).map(asJson).map((question) => ({
    question: asString(question.question),
    header: asString(question.header),
    multiSelect: question.multiSelect === true,
    options: asArray(question.options).map(asJson).map((option) => ({ label: asString(option.label), description: asString(option.description) })).filter((option) => option.label),
  })).filter((question) => question.question && question.options.length > 0);
  return questions.length ? questions : null;
}

/**
 * What one rule suggested by Claude Code allows, in words. Bash rules ending in ":*" cover every command starting
 * with what comes before; a rule without content covers the whole tool.
 */
export function ruleText(rule: Json): string {
  const tool = asString(rule.toolName) || 'cet outil';
  const content = asString(rule.ruleContent);
  if (!content) return `${tool}, pour tout`;
  if (tool === 'Bash') return content.endsWith(':*') ? `les commandes qui commencent par « ${content.slice(0, -2).trim()} »` : `la commande « ${content} »`;
  return `${tool} sur « ${content} »`;
}

/** The `ask` event shown for a request. An AskUserQuestion call with readable questions becomes a question, anything else a yes/no. */
export function describeRequest(request: ToolRequest, folder: string): AskEvent {
  const { requestId, who, tool, input, suggestions } = request;
  const questions = tool === 'AskUserQuestion' ? parseQuestions(input) : null;
  if (questions) {
    return { k: 'ask', who, requestId, tool, detail: questions.map((question) => question.question).join('\n'), canAlways: false, questions };
  }
  const always = suggestions.flatMap((suggestion) => asArray(suggestion.rules).map(asJson)).map(ruleText);
  return { k: 'ask', who, requestId, tool, detail: permissionDetail(tool, input, folder), canAlways: suggestions.length > 0, ...(always.length ? { always } : {}) };
}
