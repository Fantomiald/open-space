// Small display helpers.
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${String(minutes % 60).padStart(2, '0')}` : `${Math.floor(hours / 24)} j`;
}

/** "depuis 3 min" style label. */
export const since = (from: number, now: number) => `depuis ${formatDuration(now - from)}`;

/** The last folder of a path: the project name. */
export const folderName = (path: string) => path.split('/').filter(Boolean).pop() ?? path;

/** Replaces the home folder with "~" so full user paths never fill the screen. */
export const homeRelative = (path: string) => path.replace(/^\/(?:Users|home)\/[^/]+/, '~');

export const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

const WINDOW_NAMES: Readonly<Record<string, string>> = {
  five_hour: '5 heures', seven_day: '7 jours', seven_day_opus: '7 jours, Opus', seven_day_sonnet: '7 jours, Sonnet',
};
/** "7 jours" for Claude Code's "seven_day" usage window; an unknown window keeps its own name, made readable. */
export const quotaWindowName = (name: string) => WINDOW_NAMES[name] ?? name.replace(/_/g, ' ');

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** When a usage window frees up ("aujourd'hui à 19:40", "demain à 08:00", "lundi à 14:00"), from Unix seconds or ms. */
export function resetLabel(resetsAt: number, now: Date): string {
  const date = new Date(resetsAt < 1e12 ? resetsAt * 1000 : resetsAt);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  const day = days <= 0 ? 'aujourd’hui' : days === 1 ? 'demain' : days < 7 ? WEEKDAYS[date.getDay()] : `le ${date.getDate()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${day} à ${time}`;
}

/** How worrying a usage is: calm, getting high, nearly out. */
export const usageLevel = (utilization: number) => (utilization >= 0.9 ? 'high' : utilization >= 0.7 ? 'rising' : 'calm');

/** The folder a session runs in when none is given: the one chosen in the settings while it is still allowed, else the first root. */
export const defaultFolder = (roots: readonly string[], chosen = '') =>
  (chosen && roots.some((root) => chosen === root || chosen.startsWith(`${root}/`)) ? chosen : roots[0] ?? '');
