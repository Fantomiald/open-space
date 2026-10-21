// What Claude Code planned to do later on its own (ScheduleWakeup of /loop, CronCreate): it lives only in its process, so
// the process is kept until then. Pure functions, no clock of their own.
import type { ScheduleChange } from './normalizer.ts';

/** Until when each planned wake-up may still come, epoch ms: the /loop's next one, and one per cron job. */
export interface Schedules { wakeAt: number; crons: number[] }

export const noSchedules = (): Schedules => ({ wakeAt: 0, crons: [] });

const MINUTE = 60_000;
/** Claude Code expires a recurring job after 7 days, and clamps a wake-up between 1 min and 1 h */
const RECURRING_MS = 7 * 24 * 60 * MINUTE;
const ONCE_FALLBACK_MS = 24 * 60 * MINUTE;

export function applySchedule(schedules: Schedules, change: ScheduleChange, now: number): Schedules {
  switch (change.kind) {
    case 'wakeup': return { ...schedules, wakeAt: now + Math.min(Math.max(change.seconds, 60), 3600) * 1000 };
    case 'wakeup_stop': return { ...schedules, wakeAt: 0 };
    case 'cron': return { ...schedules, crons: [...schedules.crons, change.recurring ? now + RECURRING_MS : onceAt(change.cron, now) ?? now + ONCE_FALLBACK_MS] };
    // the deleted job is not known by its id here: the one held the longest goes (a recurring one before a one-shot)
    case 'cron_delete': {
      const crons = [...schedules.crons].sort((a, b) => a - b);
      crons.pop();
      return { ...schedules, crons };
    }
  }
}

/** The latest moment something planned may still wake the session up (0: nothing is planned any more). */
export function scheduledUntil(schedules: Schedules, now: number): number {
  return Math.max(0, ...[schedules.wakeAt, ...schedules.crons].filter((at) => at > now));
}

/** How many planned wake-ups are still to come. */
export const pendingSchedules = (schedules: Schedules, now: number) => [schedules.wakeAt, ...schedules.crons].filter((at) => at > now).length;

/**
 * The time a one-shot job runs ("30 14 28 2 *": minute, hour, day and month pinned, in local time), the next one from
 * `now`; null when the expression does not pin them. Claude Code may run it up to 90 s early.
 */
export function onceAt(cron: string, now: number): number | null {
  const [minute, hour, day, month] = cron.trim().split(/\s+/).map((field) => (/^\d+$/.test(field) ? Number(field) : Number.NaN));
  if ([minute, hour, day, month].some(Number.isNaN)) return null;
  const year = new Date(now).getFullYear();
  const at = new Date(year, month - 1, day, hour, minute).getTime();
  return at > now - MINUTE ? at : new Date(year + 1, month - 1, day, hour, minute).getTime();
}
