// What Settings > Keys shows of the vault (shared/secrets.ts StoredKey): which keys a filter keeps, who each one is
// for and who used it, and whether it has not been used for long. Pure, tested without the page.
import type { StoredKey } from '../../shared/secrets.ts';

export const KEYS_FILTERS = ['all', 'everywhere', 'here'] as const;
export type KeysFilter = (typeof KEYS_FILTERS)[number];

/** A key not used for longer than this is shown in amber: maybe a key nobody needs any more. */
export const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** The keys a filter keeps: every one, those for every session, or those of the project `here` (the session in view's). */
export function filterKeys(keys: readonly StoredKey[], filter: KeysFilter, here?: string): StoredKey[] {
  if (filter === 'everywhere') return keys.filter((key) => key.scope === 'all');
  if (filter === 'here') return here ? keys.filter((key) => key.scope === 'project' && key.owner === here) : [];
  return [...keys];
}

/** The keys in the order of the list: by name, then by scope (every session first). */
export function sortKeys(keys: readonly StoredKey[]): StoredKey[] {
  const rank = { all: 0, project: 1, trigger: 2, mod: 3 } as const;
  return [...keys].sort((a, b) => a.name.localeCompare(b.name) || rank[a.scope] - rank[b.scope] || (a.owner ?? '').localeCompare(b.owner ?? ''));
}

export const isStale = (key: StoredKey, now: number) => !!key.lastUsed && now - key.lastUsed.at > STALE_AFTER_MS;

/** The projects a key can be kept for from the settings: those of the sessions, and those already holding a key, once each. */
export function projectChoices(sessionProjects: readonly (string | undefined)[], keys: readonly StoredKey[]): string[] {
  const found = [...sessionProjects, ...keys.filter((key) => key.scope === 'project').map((key) => key.owner)].filter((each): each is string => !!each);
  return [...new Set(found)].sort((a, b) => a.localeCompare(b));
}
