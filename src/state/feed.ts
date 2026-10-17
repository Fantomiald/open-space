// Turns a session's event log into the thread shown in the detail panel. Pure function.
import type { LoggedEvent, PlanItem } from '../../shared/protocol.ts';

/** `agent`: the sub-agent that said or did it (its id), null for the session's own agent; `author` is its name. */
export type FeedItem =
  /** images: the pictures sent with the message, by name under /attachments/ */
  | { id: number; kind: 'user'; at: number; text: string; images: string[] }
  | { id: number; kind: 'assistant'; at: number; text: string; author: string | null; agent: string | null }
  | { id: number; kind: 'tool'; at: number; tool: string; detail: string; author: string | null; agent: string | null; ok: boolean | null; callId: string }
  | { id: number; kind: 'subagent'; at: number; agentId: string; name: string; task: string; status: 'working' | 'done' | 'failed'; report: string }
  /** question: an AskUserQuestion call (allowed = answered) */
  | { id: number; kind: 'permission'; at: number; requestId: string; tool: string; detail: string; author: string | null; agent: string | null; question: boolean; status: 'pending' | 'allowed' | 'denied' | 'cancelled' }
  | { id: number; kind: 'turn'; at: number; ok: boolean; stopped: boolean; ms: number }
  | { id: number; kind: 'notice'; at: number; text: string };

export interface Feed { items: FeedItem[]; plan: PlanItem[] }

export function buildFeed(events: readonly LoggedEvent[]): Feed {
  const items: FeedItem[] = [];
  const subagents = new Map<string, FeedItem & { kind: 'subagent' }>();
  const tools = new Map<string, FeedItem & { kind: 'tool' }>();
  const permissions = new Map<string, FeedItem & { kind: 'permission' }>();
  let plan: PlanItem[] = [];
  const author = (who: string) => (who === 'chef' ? null : subagents.get(who)?.name ?? 'Sous-agent');
  const agent = (who: string) => (who === 'chef' ? null : who);

  for (const { seq, at, ev } of events) {
    switch (ev.k) {
      case 'start': items.push({ id: seq, kind: 'user', at, text: ev.text, images: ev.images ?? [] }); break;
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
      case 'end': items.push({ id: seq, kind: 'turn', at, ok: ev.ok, stopped: ev.stopped === true, ms: ev.ms }); break;
      case 'error': items.push({ id: seq, kind: 'notice', at, text: ev.message }); break;
      case 'note': items.push({ id: seq, kind: 'notice', at, text: ev.text }); break;
      case 'state':
        if (ev.reason && (ev.state === 'closed' || ev.state === 'error' || ev.state === 'done')) items.push({ id: seq, kind: 'notice', at, text: ev.reason });
        break;
    }
  }
  return { items, plan };
}

/** A run of tool calls in a row, shown as one line that opens on the calls. */
export interface ToolRun { id: number; kind: 'tools'; tools: (FeedItem & { kind: 'tool' })[] }
export type ThreadEntry = Exclude<FeedItem, { kind: 'tool' }> | ToolRun;

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
      : (item.kind === 'assistant' || item.kind === 'tool' || item.kind === 'permission') && owner === agent;
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
