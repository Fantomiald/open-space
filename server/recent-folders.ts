// Folders for a new session, the ones worked in most recently first: Claude Code keeps a folder's conversations in
// ~/.claude/projects/<key>/<id>.jsonl (see conversations.ts).
import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projectKey } from './conversations.ts';

/** Claude Code cuts a longer key to this many characters and appends "-<hash>" (a hash we do not reproduce). */
const KEY_MAX = 200;
/** How long a key folder's newest time is reused, so reopening the launcher costs nothing. */
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; time: number | undefined }>();

/**
 * The directories ordered by when they were last used, most recent first; those never used follow in their own order.
 * `lastUsed`: a time in ms, or undefined for a folder with no conversation.
 */
export function mostRecentFirst(directories: readonly string[], lastUsed: (directory: string) => number | undefined): string[] {
  const times = new Map(directories.map((directory) => [directory, lastUsed(directory)]));
  const used = directories.filter((directory) => times.get(directory) !== undefined);
  const unused = directories.filter((directory) => times.get(directory) === undefined);
  return [...used.sort((a, b) => (times.get(b) ?? 0) - (times.get(a) ?? 0)), ...unused];
}

/**
 * The newest conversation file's time of a key folder, not the folder's own: on NTFS, modifying a file does not
 * touch its folder. Cached for CACHE_MS.
 */
async function newestIn(key: string, now: number): Promise<number | undefined> {
  const cached = cache.get(key);
  if (cached && now - cached.at < CACHE_MS) return cached.time;
  let time: number | undefined;
  try {
    const times = await Promise.all((await readdir(key)).filter((name) => name.endsWith('.jsonl')).map((name) => stat(path.join(key, name)).then((file) => file.mtimeMs, () => undefined)));
    for (const mtime of times) if (mtime !== undefined && (time === undefined || mtime > time)) time = mtime;
  } catch { /* the key folder vanished: never used */ }
  cache.set(key, { at: now, time });
  return time;
}

/**
 * When the newest conversation of each directory was written; a directory with none is absent from the map.
 * ~/.claude/projects is listed once, and only the key folders that exist are read. On Windows, keys are compared
 * without case: a root typed "d:\projets" gives "d--projets-app" where Claude Code wrote "D--Projets-app".
 */
export async function lastConversationTimes(directories: readonly string[], home = os.homedir(), now = Date.now(), platform = process.platform): Promise<Map<string, number>> {
  const projects = path.join(home, '.claude', 'projects');
  const fold = (name: string) => (platform === 'win32' ? name.toLowerCase() : name);
  let keys: string[];
  try { keys = await readdir(projects); } catch { return new Map(); }
  const found = await Promise.all(directories.map(async (directory) => {
    const key = fold(projectKey(directory));
    const prefix = `${key.slice(0, KEY_MAX)}-`;
    const matches = keys.filter((name) => (key.length > KEY_MAX ? fold(name).startsWith(prefix) : fold(name) === key));
    const times = await Promise.all(matches.map((name) => newestIn(path.join(projects, name), now)));
    const newest = times.reduce<number | undefined>((best, time) => (time !== undefined && (best === undefined || time > best) ? time : best), undefined);
    return [directory, newest] as const;
  }));
  return new Map(found.flatMap(([directory, time]) => (time === undefined ? [] : [[directory, time] as const])));
}
