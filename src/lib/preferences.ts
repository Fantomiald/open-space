import { outTarget } from '../state/out.ts';

/**
 * What only Open Space's own page keeps: a window taken out (src/state/out.ts) reads them but never writes its own
 * (it has no windows laid out, and its seen marks go to that page, see src/net/out.ts).
 */
const PAGE_ONLY = new Set(['layout', 'windows', 'seen', 'mods-open', 'pip', 'view', 'project']);

// Per-browser preferences (theme, notifications, last view). Storage can be missing or blocked: every access is guarded.
export function readPreference<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`poste:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: unknown) {
  if (outTarget && PAGE_ONLY.has(key)) return;
  try {
    localStorage.setItem(`poste:${key}`, JSON.stringify(value));
  } catch { /* private mode: the preference lasts until reload */ }
}
