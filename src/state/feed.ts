// Turns a session's event log into the thread shown in the detail panel. Pure function.
import { isSubagentHandback } from '../../shared/activity.ts';
import type { BranchNews, LoggedEvent, PlanItem, SentFile, UploadedFile } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';

/** `agent`: the sub-agent that said or did it (its id), null for the session's own agent; `author` is its name. */
export type FeedItem =
  /** images: the pictures sent with the message, by name under /attachments/ */
  | { id: number; kind: 'user'; at: number; text: string; images: string[]; files: UploadedFile[] }
  | { id: number; kind: 'assistant'; at: number; text: string; author: string | null; agent: string | null }
  | { id: number; kind: 'tool'; at: number; tool: string; detail: string; author: string | null; agent: string | null; ok: boolean | null; callId: string }
  | { id: number; kind: 'subagent'; at: number; agentId: string; name: string; task: string; status: 'working' | 'done' | 'failed'; report: string }
  /** question: an AskUserQuestion call (allowed = answered) */
  | { id: number; kind: 'permission'; at: number; requestId: string; tool: string; detail: string; author: string | null; agent: string | null; question: boolean; status: 'pending' | 'allowed' | 'denied' | 'cancelled' }
  /** a message from another Claude Code session (`from`: its name) */
  | { id: number; kind: 'peer'; at: number; from: string; text: string; subagent: { agentId: string; name: string } | null }
  /** `startId`: the first item of the turn, which picks its word (see turnWord) */
  | { id: number; kind: 'turn'; at: number; ok: boolean; stopped: boolean; ms: number; startId: number }
  | { id: number; kind: 'notice'; at: number; text: string }
  /** what became of the session's own branch: its base moved on, merged, thrown away, kept, cleaned */
  | { id: number; kind: 'branch'; at: number; what: BranchNews; branch: string; base: string; behind?: number }
  /** files the session (or a sub-agent: `agent`) sent the user, with what it said of them */
  | { id: number; kind: 'files'; at: number; author: string | null; agent: string | null; caption: string; files: SentFile[] }
  | { id: number; kind: 'artifact'; at: number; author: string | null; agent: string | null; title: string; url: string; stored: string | null }
  /** a command the user ran with "!": `code` null while it runs (or when stopped after too long), `done` once it ended */
  | { id: number; kind: 'shell'; at: number; shellId: string; command: string; output: string; code: number | null; done: boolean; ms: number; byUser: boolean };

export interface Feed { items: FeedItem[]; plan: PlanItem[] }

export function buildFeed(events: readonly LoggedEvent[]): Feed {
  const items: FeedItem[] = [];
  const subagents = new Map<string, FeedItem & { kind: 'subagent' }>();
  const tools = new Map<string, FeedItem & { kind: 'tool' }>();
  const permissions = new Map<string, FeedItem & { kind: 'permission' }>();
  const shells = new Map<string, FeedItem & { kind: 'shell' }>();
  let plan: PlanItem[] = [];
  /** where the running turn's items start: a message from another session is told at the end of the turn it started */
  let turnStart = 0;
  /** the first event of the running turn */
  let turnFirst = 0;
  const author = (who: string) => (who === 'chef' ? null : subagents.get(who)?.name ?? t.session.feed.subagent);
  const agent = (who: string) => (who === 'chef' ? null : who);

  for (const { seq, at, ev } of events) {
    // a command run with "!" is the user's own, outside the turns
    if (!turnFirst && ev.k !== 'state' && ev.k !== 'init' && ev.k !== 'shell' && ev.k !== 'shell_done') turnFirst = seq;
    switch (ev.k) {
      case 'start': items.push({ id: seq, kind: 'user', at, text: ev.text, images: ev.images ?? [], files: ev.files ?? [] }); turnStart = items.length; break;
      // older logs hold the sub-agents' hand-backs as messages from another session: their report is in their tab
      case 'peer': {
        if (isSubagentHandback(ev.text)) break;
        const writer = ev.subagent ? { agentId: ev.subagent, name: subagents.get(ev.subagent)?.name ?? ev.from } : null;
        items.splice(turnStart, 0, { id: seq, kind: 'peer', at, from: ev.from, text: ev.text, subagent: writer });
        break;
      }
      case 'say': items.push({ id: seq, kind: 'assistant', at, text: ev.text, author: author(ev.who), agent: agent(ev.who) }); break;
      case 'plan': plan = ev.items; break;
      case 'hire': {
        const item = { id: seq, kind: 'subagent' as const, at, agentId: ev.id, name: ev.name, task: ev.task, status: 'working' as const, report: '' };
        subagents.set(ev.id, item);
        items.push(item);
        break;
      }
      case 'report': {
        const item = subagents.get(ev.who);
        if (item) item.report = ev.text;
        break;
      }
      case 'leave': {
        const item = subagents.get(ev.who);
        if (item) item.status = ev.ok ? 'done' : 'failed';
        break;
      }
      case 'act': {
        const item = { id: seq, kind: 'tool' as const, at, tool: ev.tool, detail: ev.detail, author: author(ev.who), agent: agent(ev.who), ok: null, callId: ev.id };
        tools.set(ev.id, item);
        items.push(item);
        break;
      }
      case 'act_done': {
        const item = tools.get(ev.id);
        if (item) item.ok = ev.ok;
        break;
      }
      case 'ask': {
        const item = { id: seq, kind: 'permission' as const, at, requestId: ev.requestId, tool: ev.tool, detail: ev.detail, author: author(ev.who), agent: agent(ev.who), question: !!ev.questions, status: 'pending' as const };
        permissions.set(ev.requestId, item);
        items.push(item);
        break;
      }
      case 'ask_done': {
        const item = permissions.get(ev.requestId);
        if (item) item.status = ev.cancelled ? 'cancelled' : ev.allow ? 'allowed' : 'denied';
        break;
      }
      case 'end': items.push({ id: seq, kind: 'turn', at, ok: ev.ok, stopped: ev.stopped === true, ms: ev.ms, startId: turnFirst || seq }); turnStart = items.length; turnFirst = 0; break;
      case 'files': items.push({ id: seq, kind: 'files', at, author: author(ev.who), agent: agent(ev.who), caption: ev.caption ?? '', files: ev.files }); break;
      case 'artifact': items.push({ id: seq, kind: 'artifact', at, author: author(ev.who), agent: agent(ev.who), title: ev.title, url: ev.url, stored: ev.stored }); break;
      case 'shell': {
        const item = { id: seq, kind: 'shell' as const, at, shellId: ev.id, command: ev.command, output: '', code: null, done: false, ms: 0, byUser: false };
        shells.set(ev.id, item);
        items.push(item);
        break;
      }
      case 'shell_done': {
        const item = shells.get(ev.id);
        if (item) Object.assign(item, { output: ev.output, code: ev.code, done: true, ms: ev.ms, byUser: ev.byUser === true });
        break;
      }
      case 'compact': items.push({ id: seq, kind: 'notice', at, text: t.session.feed.compacted(ev.auto, ev.before, ev.after, ev.idle === true) }); break;
      case 'cleared': items.push({ id: seq, kind: 'notice', at, text: t.session.feed.cleared }); break;
      case 'error': items.push({ id: seq, kind: 'notice', at, text: ev.message }); break;
      case 'note': items.push({ id: seq, kind: 'notice', at, text: ev.text }); break;
      case 'branch': items.push({ id: seq, kind: 'branch', at, what: ev.what, branch: ev.branch, base: ev.base, ...(ev.behind ? { behind: ev.behind } : {}) }); break;
      case 'state':
        if (ev.reason && (ev.state === 'closed' || ev.state === 'error' || ev.state === 'done')) items.push({ id: seq, kind: 'notice', at, text: ev.reason });
        break;
    }
  }
  return { items, plan };
}

/** The turn under way: when it started and its first item (null when the thread ends on a finished turn). */
/** The "!" commands of a session still running: started, not ended yet (what Escape stops). */
export function runningShells(events: readonly LoggedEvent[]): string[] {
  const running = new Set<string>();
  for (const { ev } of events) {
    if (ev.k === 'shell') running.add(ev.id);
    else if (ev.k === 'shell_done') running.delete(ev.id);
  }
  return [...running];
}

export function currentTurn(items: readonly FeedItem[]): { startId: number; at: number } | null {
  const lastEnd = items.findLastIndex((item) => item.kind === 'turn');
  const first = items.slice(lastEnd + 1).find((item) => item.kind !== 'shell');
  return first ? { startId: first.id, at: first.at } : null;
}

/** What the session's own agent is doing in the turn under way: a tool still running (its name), else thinking. */
export function turnPhase(items: readonly FeedItem[]): { tool: string } | 'thinking' {
  const last = items.findLast((item) => (item.kind === 'tool' || item.kind === 'assistant') && item.agent === null);
  return last?.kind === 'tool' && last.ok === null ? { tool: last.tool } : 'thinking';
}

/** The word of a turn, picked by its first item so it stays the same while it runs and once it is over. */
export const turnWord = (startId: number, words: readonly { doing: string; done: string }[]) => words[startId % words.length];

/** A run of tool calls in a row, shown as one line that opens on the calls. */
export interface ToolRun { id: number; kind: 'tools'; tools: (FeedItem & { kind: 'tool' })[] }
export type ThreadEntry = Exclude<FeedItem, { kind: 'tool' }> | ToolRun;

export interface PublishedPage { url: string; title: string }

/** The pages the session published on claude.ai, the latest first: a page published again keeps its place at the top with its new title. */
export function publishedPages(items: readonly FeedItem[]): PublishedPage[] {
  const pages = new Map<string, PublishedPage>();
  for (const item of items) {
    if (item.kind !== 'artifact') continue;
    pages.delete(item.url);
    pages.set(item.url, { url: item.url, title: item.title });
  }
  return [...pages.values()].reverse();
}

/**
 * What one tab of the thread shows. The conversation (`agent` null): the user, the session's own agent, the
 * questions and permissions of everyone, one card per sub-agent, the turns. A sub-agent's tab: only what it said and
 * did. In both, consecutive tool calls are gathered into one run.
 */
export function threadOf(items: readonly FeedItem[], agent: string | null): ThreadEntry[] {
  const entries: ThreadEntry[] = [];
  for (const item of items) {
    const owner = 'agent' in item ? item.agent : null;
    const shown = agent === null
      ? item.kind === 'permission' || owner === null
      : (item.kind === 'assistant' || item.kind === 'tool' || item.kind === 'permission' || item.kind === 'files' || item.kind === 'artifact') && owner === agent;
    if (!shown) continue;
    if (item.kind !== 'tool') { entries.push(item); continue; }
    const last = entries.at(-1);
    if (last?.kind === 'tools') last.tools.push(item);
    else entries.push({ id: item.id, kind: 'tools', tools: [item] });
  }
  return entries;
}

/** "Read ×3, Bash, Edit ×2": the tools of a run, most used first. */
export function toolSummary(tools: readonly { tool: string }[]): string {
  const counts = new Map<string, number>();
  for (const { tool } of tools) counts.set(tool, (counts.get(tool) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([tool, count]) => (count > 1 ? `${tool} ×${count}` : tool)).join(', ');
}
