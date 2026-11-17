// The files and folders of a session's folder that "@" offers in the message field (ranked by
// shared/file-mentions.ts). In a git repository, git's own list: what is tracked and what is new, without what
// .gitignore leaves out, the folders taken from the files' paths. Elsewhere, a walk of the folder, bounded in entries
// and in time. Never above the folder (git lists from where it runs, the walk follows no link), and an answer only
// holds paths that are there, inside it on real paths (paths.ts): git still lists a file deleted but not committed.
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { MAX_PATH_MATCHES, rankPaths, type PathEntry } from '../shared/file-mentions.ts';
import { resolveInside } from './paths.ts';

/** Never offered, even when .gitignore forgets them: version control, dependencies, caches. */
const SKIPPED = new Set(['.git', '.hg', '.svn', 'node_modules', 'bower_components', '__pycache__', '.venv', '.DS_Store']);
const MAX_PATHS = 50_000;
const WALK_MS = 1_000;
const GIT_TIMEOUT_MS = 5_000;
/** How long a folder's list serves the next keystrokes before it is read again. */
const LIST_TTL_MS = 5_000;

/** The files git knows in `root` and under it (`dir/` for an untracked repository inside), or null outside git. */
function gitFiles(root: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    // core.fsmonitor names a program git would run: a folder's own .git/config must not start one here (worktrees.ts)
    execFile('git', ['-c', 'core.quotepath=off', '-c', 'core.fsmonitor=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root, timeout: GIT_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' },
    }, (error, stdout) => resolve(error ? null : String(stdout).split('\0').filter(Boolean)));
  });
}

/** The files git listed and the folders their paths go through. */
function fromFiles(files: readonly string[]): PathEntry[] {
  const folders = new Set<string>();
  const entries: PathEntry[] = [];
  for (const file of new Set(files)) {
    const names = file.replace(/\/$/, '').split('/');
    if (names.some((name) => SKIPPED.has(name))) continue;
    for (let count = 1; count < names.length; count++) folders.add(names.slice(0, count).join('/'));
    if (file.endsWith('/')) folders.add(names.join('/'));
    else entries.push({ path: file, folder: false });
    if (entries.length >= MAX_PATHS) break;
  }
  return [...[...folders].map((folder) => ({ path: folder, folder: true })), ...entries];
}

/** The folder walked breadth first (the nearest paths first when it stops), links listed but not followed. */
async function walk(root: string): Promise<PathEntry[]> {
  const until = Date.now() + WALK_MS;
  const entries: PathEntry[] = [];
  const folders = [''];
  while (folders.length && entries.length < MAX_PATHS && Date.now() < until) {
    const folder = folders.shift() as string;
    const found = await readdir(path.join(root, folder), { withFileTypes: true }).catch(() => []);
    for (const entry of found) {
      if (SKIPPED.has(entry.name)) continue;
      const relative = folder ? `${folder}/${entry.name}` : entry.name;
      entries.push({ path: relative, folder: entry.isDirectory() });
      if (entry.isDirectory()) folders.push(relative);
    }
  }
  return entries;
}

/** Every file and folder "@" can offer in `root` (a real path): git's list, else a walk (also for a folder git ignores). */
export async function listPaths(root: string): Promise<PathEntry[]> {
  const files = await gitFiles(root);
  return files?.length ? fromFiles(files) : walk(root);
}

/**
 * Answers the field's queries for a folder: its list is read once for the keystrokes that follow (`ttlMs`), then the
 * best paths for the query that are there and inside it, MAX_PATH_MATCHES at most.
 */
export function pathFinder(ttlMs = LIST_TTL_MS): (root: string, query: string) => Promise<PathEntry[]> {
  const lists = new Map<string, { at: number; entries: Promise<PathEntry[]> }>();
  return async (root, query) => {
    const now = Date.now();
    for (const [folder, list] of lists) if (now - list.at >= ttlMs) lists.delete(folder);
    let list = lists.get(root);
    if (!list) {
      list = { at: now, entries: listPaths(root) };
      lists.set(root, list);
    }
    const ranked = rankPaths(await list.entries, query, MAX_PATH_MATCHES * 2);
    return ranked.filter((entry) => resolveInside(root, entry.path) !== null).slice(0, MAX_PATH_MATCHES);
  };
}
