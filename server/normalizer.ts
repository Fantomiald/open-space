// Translates what a `claude -p --output-format stream-json` process says into OfficeEvents.
// `who` is "chef" (the main agent of the session) or the tool_use id of the Task/Agent call that
// started a sub-agent (every message of that sub-agent carries it as parent_tool_use_id).
import { actDetail, isSubagentHandback, permissionDetail, SUBAGENT_NAMES, cut } from '../shared/activity.ts';
import type { BackgroundTask, OfficeEvent, PlanItem, Question, Quota, SlashCommand } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import { asArray, asJson, asNumber, asString, type Json } from './json.ts';

export interface TurnResult { ok: boolean; text: string; ms: number }

/** `socket`: where other Claude Code sessions reach this one ("/tmp/cc-socks/<pid>.sock"; their SendMessage calls write "uds:" before it). */
/** `conversationId`: the conversation Claude Code goes on with (a new one after /clear) */
export interface InitInfo { model: string; commands: string[]; socket: string; conversationId: string; version: string }

/** A can_use_tool control request: a tool call (or an AskUserQuestion call) waiting for the user. */
export interface ToolRequest { requestId: string; who: string; tool: string; input: Record<string, unknown>; suggestions: Json[] }

export type AskEvent = Extract<OfficeEvent, { k: 'ask' }>;

/** Something the session's agent planned to do later on its own, once the tool call that plans it went through. */
export type ScheduleChange =
  | { kind: 'wakeup'; seconds: number } | { kind: 'wakeup_stop' }
  | { kind: 'cron'; cron: string; recurring: boolean } | { kind: 'cron_delete' };

/** The Agent call that first started a sub-agent, and the sub-agent's type. */
export interface AgentLaunch { call: string; type: string }

export interface NormalizerOptions {
  emit: (event: OfficeEvent) => void;
  onInit: (info: InitInfo) => void;
  onCommands: (commands: SlashCommand[]) => void;
  onQuota: (quota: Quota) => void;
  /** Claude Code started compacting the conversation (it ends with a compact event) */
  onCompacting?: () => void;
  onResult: (result: TurnResult) => void;
  onRequest: (request: ToolRequest) => void;
  /** Claude Code withdrew a request (it will not wait for the answer any more) */
  onCancel: (requestId: string) => void;
  /** the text of a message still being written, so far (it then arrives whole as a `say` event) */
  onPartial: (who: string, text: string) => void;
  /** files Claude sent the user (SendUserFile, see claude-process.ts): their paths as Claude Code checked them */
  onFiles?: (who: string, caption: string, files: readonly { path: string; size: number; image: boolean }[], display: string) => void;
  /** a page Claude published with its Artifact tool: its claude.ai address and the local HTML file it came from */
  onArtifact?: (who: string, artifact: { url: string; path: string; title: string }) => void;
  /** how full the context is: `used` as of the session's own agent's last answer, `max` the model's window (from a turn's end) */
  onContext?: (context: { used?: number; max?: number }) => void;
  /** where Remote Control is at, once turned on (system/bridge_state: "ready", "connected", "failed"…) */
  onRemoteState?: (state: string) => void;
  /** the commands running in the background now, sub-agents left out (they come as hire and leave events) */
  onBackground?: (tasks: BackgroundTask[]) => void;
  /** a /loop wake-up or a cron job planned or cancelled (ScheduleWakeup, CronCreate, CronDelete) */
  onSchedule?: (change: ScheduleChange) => void;
  /** first names already taken by sub-agents of this session (shared across resumes) */
  names: Set<string>;
  /** the name of the session a SendMessage call goes to: its `to` is a name, or a socket address when answering one */
  peerName?: (address: string) => string;
  /** how a sub-agent was launched, by its agentId: one woken up again may come from an earlier process of the conversation */
  agentLaunch?: (agentId: string) => AgentLaunch | null;
}

export class Normalizer {
  private whoOfTool = new Map<string, string>(); // tool call id -> who made it
  private reported = new Set<string>();
  /** every sub-agent called, gone or not */
  private hired = new Set<string>();
  /** the text being written, by who writes it */
  private writing = new Map<string, string>();
  /** SendUserFile calls waiting for their result (what they sent comes with it), with how Claude asked them shown: 'render', 'attach' or '' */
  private sending = new Map<string, string>();
  /** Artifact calls publishing a page, waiting for their result (its address comes with it) */
  private publishing = new Set<string>();
  /** ScheduleWakeup, CronCreate and CronDelete calls waiting for their result, by tool call id */
  private scheduling = new Map<string, ScheduleChange>();
  /** the Task call of each sub-agent, by the id Claude Code gives its task (agentId, in the call's result) */
  private agentTasks = new Map<string, string>();
  /** what each SendMessage call said: a sub-agent it wakes up again works on it */
  private sentMessages = new Map<string, string>();
  /** the Task call of each sub-agent woken up again, by the SendMessage call that woke it up */
  private revived = new Map<string, string>();
  /** sub-agents currently working (called, not yet gone) */
  readonly present = new Set<string>();

  private options: NormalizerOptions;

  constructor(options: NormalizerOptions) {
    this.options = options;
  }

  private pickName() {
    const { names } = this.options;
    const name = SUBAGENT_NAMES.find((candidate) => !names.has(candidate)) ?? st.normalizer.extraSubagent(names.size + 1);
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
        // one of this session's sub-agents writes like another session (signed with its type, "general-purpose"), with
        // its task's id as senderTaskId (transcripts of 2.1.302): its hand-back repeats its report, its other messages
        // (how far it got) are marked as its own
        const body = asString(origin.body);
        const senderTask = asString(origin.senderTaskId);
        if (origin.kind === 'peer' && body.trim() && !isSubagentHandback(body)) {
          this.options.emit({
            k: 'peer', from: asString(origin.name) || st.normalizer.peerUnknown, text: body.slice(0, 20000),
            ...(senderTask ? { subagent: this.agentTasks.get(senderTask) ?? senderTask } : {}),
          });
        }
        // the window of the model that answered (Claude Code tells it per model at a turn's end)
        const windows = Object.values(asJson(message.modelUsage)).map((usage) => asNumber(asJson(usage).contextWindow)).filter(Boolean);
        if (windows.length) this.options.onContext?.({ max: Math.max(...windows) });
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
          conversationId: asString(message.session_id),
          version: asString(message.claude_code_version),
        });
        this.options.emit({ k: 'init', model: asString(message.model) });
        break;
      case 'status':
        if (message.status === 'compacting') this.options.onCompacting?.();
        break;
      case 'compact_boundary': {
        const metadata = asJson(message.compact_metadata);
        const after = asNumber(metadata.post_tokens);
        this.options.emit({ k: 'compact', auto: metadata.trigger === 'auto', before: asNumber(metadata.pre_tokens), after });
        if (after) this.options.onContext?.({ used: after });
        break;
      }
      case 'bridge_state':
        this.options.onRemoteState?.(asString(message.state));
        break;
      case 'background_tasks_changed':
        // the whole list each time (fixtures/bash-background.jsonl, 2.1.304)
        this.options.onBackground?.(asArray(message.tasks).map(asJson).filter((task) => asString(task.task_id) && !asString(task.task_type).includes('agent'))
          .map((task) => ({ id: asString(task.task_id), description: cut(task.description, 90) })));
        break;
      case 'commands_changed':
        this.options.onCommands(asArray(message.commands).map(asJson).filter((c) => asString(c.name)).map((c) => ({
          name: asString(c.name), description: cut(c.description, 200) || undefined, argumentHint: asString(c.argumentHint) || undefined,
        })));
        break;
      case 'task_started': {
        // a sub-agent woken up again by a SendMessage call, after its end or after the process that launched it
        // stopped: its messages carry the id of the Agent call that first started it, its end the id of the SendMessage
        // call (fixtures/subagent-revived.jsonl, 2.1.303)
        const via = asString(message.tool_use_id);
        if (message.task_type !== 'local_agent' || !this.sentMessages.has(via)) break;
        const agentId = asString(message.task_id);
        const launch = this.options.agentLaunch?.(agentId) ?? null;
        const call = this.agentTasks.get(agentId) ?? launch?.call;
        if (!call || this.present.has(call)) break;
        this.revived.set(via, call);
        this.agentTasks.set(agentId, call);
        this.hire(call, launch?.type ?? '', asString(message.description), this.sentMessages.get(via) ?? '');
        break;
      }
      case 'task_notification': {
        // the end of a task, sub-agents included (in the background or not, it comes before the Task call's result).
        // The report is in handback_report when the sub-agent handed it back; the summary then only says so.
        const raw = asString(message.tool_use_id);
        const id = this.revived.get(raw) ?? raw;
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

  private hire(id: string, type: string, task: string, prompt: string) {
    this.present.add(id);
    this.hired.add(id);
    this.options.emit({ k: 'hire', id, type, name: this.pickName(), task: cut(task || type, 48), prompt: cut(prompt, 2000) });
  }

  private leave(id: string, ok: boolean, usage: Json = {}) {
    if (!this.present.delete(id)) return;
    this.options.emit({ k: 'leave', who: id, ok, tokens: asNumber(usage.total_tokens), tools: asNumber(usage.tool_uses), ms: asNumber(usage.duration_ms) });
  }

  private assistant(message: Json) {
    const who = asString(message.parent_tool_use_id) || 'chef';
    // what this answer was given to read is the context as it stands (cache included); a sub-agent has its own
    const usage = asJson(asJson(message.message).usage);
    if (who === 'chef' && Object.keys(usage).length) {
      const used = asNumber(usage.input_tokens) + asNumber(usage.cache_creation_input_tokens) + asNumber(usage.cache_read_input_tokens) + asNumber(usage.output_tokens);
      if (used) this.options.onContext?.({ used });
    }
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
    // the files are shown with the call's result, no action line
    if (name === 'SendUserFile') { this.sending.set(id, asString(input.display)); return; }
    // a page, not an asset upload nor a read, list or delete
    const schedule = who === 'chef' ? scheduleOf(name, input) : null;
    if (schedule) this.scheduling.set(id, schedule);
    if (name === 'Artifact' && (input.action ?? 'publish') === 'publish' && input.asset !== true && input.file_path) this.publishing.add(id);
    if (name === 'Agent' || name === 'Task') {
      this.hire(id, asString(input.subagent_type), asString(input.description), asString(input.prompt));
    } else if (name === 'TodoWrite' && who === 'chef') {
      const items: PlanItem[] = asArray(input.todos).map(asJson).map((todo) => ({
        text: cut(todo.content ?? todo.activeForm, 90),
        status: todo.status === 'completed' ? 'completed' : todo.status === 'in_progress' ? 'in_progress' : 'pending',
      }));
      this.options.emit({ k: 'plan', items });
    } else if (name === 'SendMessage') {
      const to = asString(input.to);
      const recipient = this.options.peerName?.(to) ?? to;
      this.sentMessages.set(id, asString(input.message));
      this.options.emit({ k: 'act', who, id, tool: name, detail: cut(st.normalizer.sentTo(recipient || st.normalizer.recipientUnknown, asString(input.summary) || asString(input.message)), 160) });
    } else {
      this.options.emit({ k: 'act', who, id, tool: name, detail: actDetail(name, input, st.normalizer.searchIn) });
    }
  }

  private user(message: Json) {
    for (const block of asArray(asJson(message.message).content).map(asJson)) {
      if (block.type !== 'tool_result') continue;
      const id = asString(block.tool_use_id);
      const who = this.whoOfTool.get(id);
      if (who === undefined) continue;
      const display = this.sending.get(id);
      if (display !== undefined) {
        this.sending.delete(id);
        const result = asJson(message.tool_use_result);
        const files = asArray(result.attachments).map(asJson).filter((file) => asString(file.path) && file.pathValidated !== false)
          .map((file) => ({ path: asString(file.path), size: asNumber(file.size), image: file.isImage === true }));
        if (files.length) this.options.onFiles?.(who, asString(result.caption), files, display);
        continue;
      }
      const schedule = this.scheduling.get(id);
      if (schedule) {
        this.scheduling.delete(id);
        if (!block.is_error) this.options.onSchedule?.(schedule);
      }
      if (this.publishing.delete(id)) {
        // checked with the transcripts of 2.1.302: tool_use_result is { url, path, title, artifact_id, updated, … }
        const result = asJson(message.tool_use_result);
        const url = asString(result.url);
        const file = asString(result.path);
        if (!block.is_error && ARTIFACT_URL.test(url) && /\.html?$/i.test(file)) this.options.onArtifact?.(who, { url, path: file, title: asString(result.title).slice(0, 200) });
      }
      if (this.present.has(id)) {
        // a sub-agent's report comes back to the main agent as the tool result of the Task call
        const result = asJson(message.tool_use_result);
        if (asString(result.agentId)) this.agentTasks.set(asString(result.agentId), id);
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

function scheduleOf(tool: string, input: Record<string, unknown>): ScheduleChange | null {
  switch (tool) {
    case 'ScheduleWakeup': return input.stop === true ? { kind: 'wakeup_stop' } : { kind: 'wakeup', seconds: asNumber(input.delaySeconds) };
    case 'CronCreate': return { kind: 'cron', cron: asString(input.cron), recurring: input.recurring !== false };
    case 'CronDelete': return { kind: 'cron_delete' };
    default: return null;
  }
}

/** A page of claude.ai's artifacts, the only address an artifact card links to. */
const ARTIFACT_URL = /^https:\/\/claude\.ai\/(code\/)?artifact\/[\w-]{1,100}$/;

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
  const tool = asString(rule.toolName) || st.normalizer.thisTool;
  const content = asString(rule.ruleContent);
  if (!content) return st.normalizer.ruleWholeTool(tool);
  if (tool === 'Bash') return content.endsWith(':*') ? st.normalizer.ruleCommandsStartingWith(content.slice(0, -2).trim()) : st.normalizer.ruleCommand(content);
  return st.normalizer.ruleToolOn(tool, content);
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
