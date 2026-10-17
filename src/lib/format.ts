// Small display helpers.
import { locale, t } from '../i18n/index.ts';

export function formatDuration(ms: number): string {
  const { duration } = t.common;
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return duration.seconds(seconds);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return duration.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? duration.hours(hours, String(minutes % 60).padStart(2, '0')) : duration.days(Math.floor(hours / 24));
}

/** "for 3 min" style label. */
export const since = (from: number, now: number) => t.common.since(formatDuration(now - from));

/** The last folder of a path: the project name. */
export const folderName = (path: string) => path.split('/').filter(Boolean).pop() ?? path;

/** Replaces the home folder with "~" so full user paths never fill the screen. */
export const homeRelative = (path: string) => path.replace(/^\/(?:Users|home)\/[^/]+/, '~');

export { plural } from '../i18n/index.ts';

/** "7 days" for Claude Code's "seven_day" usage window; an unknown window keeps its own name, made readable. */
export const quotaWindowName = (name: string) => t.common.quota.windows[name] ?? name.replace(/_/g, ' ');

/** When a usage window frees up ("today at 19:40", "tomorrow at 08:00", "Monday at 14:00"), from Unix seconds or ms. */
export function resetLabel(resetsAt: number, now: Date): string {
  const { reset } = t.common;
  const date = new Date(resetsAt < 1e12 ? resetsAt * 1000 : resetsAt);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  const day = days <= 0 ? reset.today
    : days === 1 ? reset.tomorrow
    : days < 7 ? date.toLocaleDateString(locale(), { weekday: 'long' })
    : reset.onDate(date.getDate(), String(date.getMonth() + 1).padStart(2, '0'));
  return reset.at(day, time);
}

/** How worrying a usage is: calm, getting high, nearly out. */
export const usageLevel = (utilization: number) => (utilization >= 0.9 ? 'high' : utilization >= 0.7 ? 'rising' : 'calm');

export { defaultFolder } from '../../shared/folders.ts';
