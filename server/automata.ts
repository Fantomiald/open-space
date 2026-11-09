// The external runs, without I/O: what another program's run files say, what the page is told of them, and a run's
// thread read from its Claude Code transcript. server/automata-watch.ts reads the files.
//
// The contract (shared/automata.ts AutomatonRun) is written by someone else: every field may be missing, and what does
// not fit is left out rather than refused. A transcript is Claude Code's own format (see conversations.ts), close to the stream-json
// one: its records are turned into stream messages and read by the same Normalizer as a session's.
import { RUN_ID, roleLabel, type AgentRole, type AutomataState, type AutomatonAgent, type AutomatonRun } from '../shared/automata.ts';
import type { LoggedEvent, OfficeEvent } from '../shared/protocol.ts';
import { asArray, asJson, asNumber, asString, isJson, type Json } from './json.ts';
import { Normalizer } from './normalizer.ts';

/** The ended runs the page is told about, newest first. */
export const RECENT_RUNS = 30;
/** The events of a run's thread kept: older ones are dropped (the transcript stays whole on the disk). */
export const MAX_RUN_EVENTS = 600;
const MAX_TEXT = 300;

const cut = (value: unknown, max = MAX_TEXT) => asString(value).trim().slice(0, max);
/** An ISO date (or ms) as ms, 0 when there is none. */
function timeOf(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/** A run's file, read as its program wrote it: null when it is not a run at all. `fileId`: its file name without ".json". */
export function parseRun(raw: unknown, fileId: string): AutomatonRun | null {
  if (!isJson(raw) || !RUN_ID.test(fileId)) return null;
  const id = RUN_ID.test(asString(raw.id)) ? asString(raw.id) : fileId;
  const status = raw.status === 'done' || raw.status === 'failed' ? raw.status : raw.status === 'running' ? 'running' : null;
  if (!status) return null;
  const pid = asNumber(raw.pid, -1);
  return {
    id, sessionId: /^[0-9a-f-]{36}$/i.test(asString(raw.sessionId)) ? asString(raw.sessionId).toLowerCase() : '',
    cwd: cut(raw.cwd, 1000), status, pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    startedAt: timeOf(raw.startedAt), endedAt: timeOf(raw.endedAt) || null, role: cut(raw.role, 80), task: cut(raw.task, 200),
  };
}

/** A run that says it runs but whose process is gone was interrupted (`alive`: whether a process id still exists). */
export function withLiveness(run: AutomatonRun, alive: (pid: number) => boolean): AutomatonRun {
  if (run.status !== 'running') return run;
  return run.pid === null || alive(run.pid) ? run : { ...run, status: 'interrupted' };
}

/** What the page is told, from what was read (the runs already checked by withLiveness). */
export function automataState(runs: readonly AutomatonRun[], roles: readonly AgentRole[]): AutomataState {
  const running = runs.filter((run) => run.status === 'running').sort((a, b) => a.startedAt - b.startedAt);
  const recent = runs.filter((run) => run.status !== 'running').sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt)).slice(0, RECENT_RUNS);
  return { folder: 'ok', running, recent, roles: [...roles].sort((a, b) => a.name.localeCompare(b.name)), agents: {} };
}

/** The sub-agents at work, by run, kept only for the runs at work that have some. */
export function agentsAtWork(running: readonly AutomatonRun[], agents: ReadonlyMap<string, readonly AutomatonAgent[]>): Record<string, AutomatonAgent[]> {
  return Object.fromEntries(running.flatMap((run) => (agents.get(run.id)?.length ? [[run.id, [...agents.get(run.id)!]]] : [])));
}

/** A task-notification Claude Code adds to a transcript when a sub-agent sent to the background ends (checked with 2.1.304). */
export function taskNotification(text: string): Json | null {
  if (!text.startsWith('<task-notification>')) return null;
  const tag = (name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)?.[1]?.trim() ?? '';
  const call = tag('tool-use-id');
  if (!call) return null;
  return {
    type: 'system', subtype: 'task_notification', tool_use_id: call, status: tag('status') || 'completed',
    summary: tag('result') || tag('summary'),
    usage: { total_tokens: Number(tag('subagent_tokens')) || 0, tool_uses: Number(tag('tool_uses')) || 0, duration_ms: Number(tag('duration_ms')) || 0 },
  };
}

/** What a transcript record says as a stream-json message of `claude -p`, or null for what is not shown (hooks, requests, notes). */
export function streamMessage(record: Json, parent: string | null): Json | null {
  const message = asJson(record.message);
  const extra = parent ? { parent_tool_use_id: parent } : {};
  if (record.type === 'assistant') return { type: 'assistant', message, ...extra };
  if (record.type !== 'user' || record.isMeta === true) return null;
  if (typeof message.content === 'string') return taskNotification(message.content.trim());
  if (!asArray(message.content).some((block) => asJson(block).type === 'tool_result')) return null;
  return { type: 'user', message, tool_use_result: record.toolUseResult, ...extra };
}

/** What the user (here, the program that launched the run) asked in a record, or null for anything else (tool results, notifications, notes). */
export function promptOf(record: Json): string | null {
  if (record.type !== 'user' || record.isMeta === true || record.isSidechain === true) return null;
  const content = asJson(record.message).content;
  const text = typeof content === 'string' ? content
    : asArray(content).flatMap((part) => (asJson(part).type === 'text' ? [asString(asJson(part).text)] : [])).join('\n');
  const clean = text.trim();
  return clean && !clean.startsWith('<') ? clean.slice(0, 20_000) : null;
}

/**
 * A run's thread, built from its transcript as it grows: the main conversation's records, and each sub-agent's
 * (subagents/agent-<id>.jsonl) under the Agent call that launched it. Only the last MAX_RUN_EVENTS are kept.
 */
export class RunThread {
  readonly events: LoggedEvent[] = [];
  truncated = false;
  private seq = 0;
  private at = 0;
  private fresh: LoggedEvent[] = [];
  private readonly normalizer: Normalizer;
  private readonly max: number;
  /** the sub-agents seen launched, by the id of their Agent call */
  private readonly hired = new Set<string>();
  /** the sub-agents at work, by the id of their Agent call */
  private readonly atWork = new Map<string, AutomatonAgent>();

  constructor(cwd: string, max = MAX_RUN_EVENTS) {
    this.max = max;
    const ignore = () => {};
    this.normalizer = new Normalizer({
      emit: (ev) => this.push(ev), names: new Set(), cwd,
      onInit: ignore, onCommands: ignore, onQuota: ignore, onResult: ignore, onRequest: ignore, onCancel: ignore, onPartial: ignore,
    });
  }

  private push(next: OfficeEvent) {
    // a sub-agent is named after its type, the role it plays (its .claude/agents/<role>.md)
    const ev = next.k === 'hire' ? { ...next, name: roleLabel(next.type || 'agent') } : next;
    if (ev.k === 'hire') {
      // told once: by its own transcript first, or by the Agent call (the one read first wins)
      if (this.hired.has(ev.id)) return;
      this.hired.add(ev.id);
      this.atWork.set(ev.id, { id: ev.id, role: ev.type || 'agent', task: ev.task });
    }
    if (ev.k === 'leave') this.atWork.delete(ev.who);
    const event = { seq: ++this.seq, at: this.at || Date.now(), ev };
    this.events.push(event);
    this.fresh.push(event);
    if (this.events.length > this.max) { this.events.splice(0, this.events.length - this.max); this.truncated = true; }
    if (this.fresh.length > this.max) this.fresh.splice(0, this.fresh.length - this.max);
  }

  /** A record of the run's own transcript, or of a sub-agent's (`parent`: the id of the Agent call that launched it). */
  add(record: Json, parent: string | null = null) {
    this.at = timeOf(record.timestamp) || this.at;
    const prompt = parent ? null : promptOf(record);
    if (prompt) { this.push({ k: 'start', text: prompt }); return; }
    const message = streamMessage(record, parent);
    if (message) this.normalizer.handle(message);
  }

  /**
   * A sub-agent found by its own transcript (subagents/agent-<id>.jsonl and its .meta.json): when the Agent call that
   * launched it is older than the part of the run's transcript read, it is told here, so its thread still has a tab.
   */
  subagent(call: string, type: string, description: string) {
    if (!this.hired.has(call)) this.push({ k: 'hire', id: call, type, name: '', task: description.slice(0, 48) || type, prompt: '' });
  }

  /** The sub-agents launched and not back yet, oldest first. */
  working(): AutomatonAgent[] { return [...this.atWork.values()]; }

  /** The events added since the last call. */
  take(): LoggedEvent[] {
    const fresh = this.fresh;
    this.fresh = [];
    return fresh;
  }
}

/** The records of a piece of JSONL text, the unreadable lines left out. */
export function recordsOf(text: string): Json[] {
  return text.split('\n').flatMap((line) => {
    if (!line.trim()) return [];
    try { const value: unknown = JSON.parse(line); return isJson(value) ? [value] : []; } catch { return []; }
  });
}
