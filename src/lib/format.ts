// Small display helpers.
import type { TimeFormat } from '../../shared/protocol.ts';
import { locale, t } from '../i18n/index.ts';

/** The user's time format (Preferences.timeFormat), set with the language whenever the settings arrive. */
let clockFormat: TimeFormat = 'auto';
export const setClockFormat = (format: TimeFormat) => { clockFormat = format; };

/** "14:05" or "2:05 PM": a time of day, as the user wants it written. */
export const formatClock = (at: number) => new Date(at).toLocaleTimeString(locale(), {
  hour: '2-digit', minute: '2-digit', ...(clockFormat === 'auto' ? {} : { hour12: clockFormat === '12h' }),
});

export function formatDuration(ms: number): string {
  const { duration } = t.common;
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return duration.seconds(seconds);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return duration.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? duration.hours(hours, String(minutes % 60).padStart(2, '0')) : duration.days(Math.floor(hours / 24));
}

/** How long a session has been in its state: "now" under a minute, so the lists don't tick every second. */
export const formatAge = (ms: number) => (ms < 60_000 ? t.common.justNow : formatDuration(ms));
/** "3 min ago", or "now" under a minute. */
export const formatAgo = (ms: number) => (ms < 60_000 ? t.common.justNow : t.common.ago(formatDuration(ms)));

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

/**
 * Dollars as the usage view shows them: "$9.70", "$1,736" from a thousand on (cents left out), "$0.004" for a fraction
 * of a cent; `round` leaves the cents out from ten dollars on (an axis' ticks).
 */
export function formatDollars(amount: number, round = false): string {
  const digits = amount >= 1000 || (round && (amount >= 10 || amount === 0)) ? 0 : amount > 0 && amount < 0.01 ? 3 : 2;
  return new Intl.NumberFormat(locale(), { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
}

/** A count of tokens in short: "12.4M", "279.5k", "840". */
export const formatTokens = (count: number) => new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: count >= 1000 ? 1 : 0 }).format(count);

/** Minutes of agent time: "41 min", "3 h 05", "52 h 10" (hours are not turned into days: it is time spent, not elapsed). */
export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  return rounded < 60 ? t.common.duration.minutes(rounded) : t.common.duration.hours(Math.floor(rounded / 60), String(rounded % 60).padStart(2, '0'));
}
