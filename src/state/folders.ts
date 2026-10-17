import { homeRelative } from '../lib/format.ts';

/**
 * The folders offered for what the user typed, the way the page shows them ("~/…"): those whose path holds it, the ones
 * whose own name starts with it first. Nothing typed: all of them, up to `limit`.
 */
export function matchFolders(directories: readonly string[], typed: string, limit = 50): string[] {
  const query = homeRelative(typed.trim()).toLowerCase();
  if (!query) return directories.slice(0, limit);
  const name = query.split('/').filter(Boolean).at(-1) ?? query;
  const found = directories.filter((directory) => homeRelative(directory).toLowerCase().includes(query));
  const startsWithName = (directory: string) => (directory.split('/').at(-1) ?? '').toLowerCase().startsWith(name);
  return [...found.filter(startsWithName), ...found.filter((directory) => !startsWithName(directory))].slice(0, limit);
}
