// The triggers on the page's side (shared/triggers.ts): what the Automates panel shows of them. Pure functions, tested
// without a DOM.
import { nextCronRun, parseCron } from '../../shared/cron.ts';
import type { SessionInfo } from '../../shared/protocol.ts';
import { MCP_SERVER_NAME, type TriggerInput, type TriggerRun } from '../../shared/triggers.ts';

/** When a cron trigger starts next: a time, null when its schedule never comes, undefined when it is not a valid cron (or a webhook). */
export function nextStart(input: Pick<TriggerInput, 'kind' | 'cron'>, now: number): number | null | undefined {
  if (input.kind !== 'cron') return undefined;
  const cron = parseCron(input.cron);
  return cron ? nextCronRun(cron, now) : undefined;
}

/** The last firings of one trigger, newest first. */
export const runsOf = (runs: readonly TriggerRun[], triggerId: string, max = 8) => runs.filter((run) => run.triggerId === triggerId).slice(0, max);

/** The folders a trigger is likely to be made for: those of the sessions, then the allowed roots, each once. */
export function folderChoices(sessions: readonly Pick<SessionInfo, 'cwd' | 'worktree'>[], roots: readonly string[]): string[] {
  return [...new Set([...sessions.filter((session) => !session.worktree).map((session) => session.cwd), ...roots])].sort((a, b) => a.localeCompare(b));
}

/** What another program puts in its MCP configuration to reach Open Space. */
export const externalMcpConfig = (url: string) => JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { type: 'http', url } } }, null, 2);

/** The same with Claude Code's own command. */
export const claudeMcpCommand = (url: string) => `claude mcp add --transport http ${MCP_SERVER_NAME} ${url}`;

/**
 * A schedule as the page offers it, for those who do not write cron: every 1, 3 or 6 hours, or at a time on some days
 * of the week (0 Sunday to 6 Saturday, all seven for every day); anything else stays a cron of its own.
 */
export type Schedule =
  | { kind: 'hours'; every: 1 | 3 | 6; minute: number }
  | { kind: 'days'; days: number[]; hour: number; minute: number }
  | { kind: 'custom' };

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** The days of a cron's day-of-week field ("*", "1-5", "1,3,5", 7 for Sunday too), or null when it is something else. */
function daysOf(field: string): number[] | null {
  if (field === '*') return EVERY_DAY;
  const days = new Set<number>();
  for (const part of field.split(',')) {
    const range = /^([0-7])(?:-([0-7]))?$/.exec(part);
    if (!range) return null;
    const from = Number(range[1]), to = Number(range[2] ?? range[1]);
    if (to < from) return null;
    for (let day = from; day <= to; day++) days.add(day % 7);
  }
  return [...days].sort((a, b) => a - b);
}

/** The schedule a cron expression is, in the page's terms. */
export function scheduleOf(cron: string): Schedule {
  const [minute, hour, day, month, week, ...rest] = cron.trim().split(/\s+/);
  if (rest.length || day !== '*' || month !== '*' || !/^\d{1,2}$/.test(minute ?? '') || Number(minute) > 59) return { kind: 'custom' };
  if (week === '*' && hour === '*') return { kind: 'hours', every: 1, minute: Number(minute) };
  const every = /^\*\/(3|6)$/.exec(hour ?? '');
  if (week === '*' && every) return { kind: 'hours', every: Number(every[1]) as 3 | 6, minute: Number(minute) };
  const days = daysOf(week ?? '');
  if (!days || !/^\d{1,2}$/.test(hour ?? '') || Number(hour) > 23) return { kind: 'custom' };
  return { kind: 'days', days, hour: Number(hour), minute: Number(minute) };
}

/** The cron expression of a schedule ('custom' has none of its own). The days are written as ranges where they follow. */
export function cronOf(schedule: Exclude<Schedule, { kind: 'custom' }>): string {
  if (schedule.kind === 'hours') return `${schedule.minute} ${schedule.every === 1 ? '*' : `*/${schedule.every}`} * * *`;
  const days = [...new Set(schedule.days)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let index = 0; index < days.length;) {
    let end = index;
    while (days[end + 1] === days[end] + 1) end++;
    ranges.push(end - index >= 2 ? `${days[index]}-${days[end]}` : days.slice(index, end + 1).join(','));
    index = end + 1;
  }
  const week = days.length === 7 || !days.length ? '*' : ranges.join(',');
  return `${schedule.minute} ${schedule.hour} * * ${week}`;
}
