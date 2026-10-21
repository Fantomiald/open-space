// What a session changed in its files: the files it (or one of its sub-agents) wrote with Edit, Write, MultiEdit or
// NotebookEdit, found in Claude Code's transcripts, and what git says of each against the last commit. Like Claude
// Code's /diff, a file whose changes were committed shows nothing any more. A file changed by a shell command (sed, a
// generator) is not seen: only the editing tools leave its path.
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FileChange, SessionChanges } from '../shared/protocol.ts';
import { projectFolder } from './conversations.ts';
import { asArray, asString, isJson } from './json.ts';

const EDITING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const FILE_LIMIT = 200;
const PATCH_LIMIT = 80 * 1024;
const TOTAL_LIMIT = 800 * 1024;
/** Git's empty tree: what a repository without any commit is compared with. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** The files written by the editing tools in a transcript (JSON lines), the last written last. */
export function editedFiles(transcript: string): string[] {
  const files = new Map<string, true>();
  for (const line of transcript.split('\n')) {
    if (!line.includes('"tool_use"')) continue;
    let record: unknown;
    try { record = JSON.parse(line); } catch { continue; }
    if (!isJson(record) || !isJson(record.message)) continue;
    for (const block of asArray(record.message.content)) {
      if (!isJson(block) || block.type !== 'tool_use' || !EDITING_TOOLS.has(asString(block.name)) || !isJson(block.input)) continue;
      const file = asString(block.input.file_path) || asString(block.input.notebook_path);
      if (!path.isAbsolute(file)) continue;
      files.delete(file);
      files.set(file, true);
    }
  }
  return [...files.keys()];
}

/** The transcripts of a conversation: its own, then those of its sub-agents. */
async function transcripts(cwd: string, sessionId: string, home?: string): Promise<string[]> {
  const folder = projectFolder(cwd, home);
  const subagents = path.join(folder, sessionId, 'subagents');
  const names = await readdir(subagents).catch(() => [] as string[]);
  return [path.join(folder, `${sessionId}.jsonl`), ...names.filter((name) => name.endsWith('.jsonl')).map((name) => path.join(subagents, name))];
}

const git = (cwd: string, args: readonly string[]) => new Promise<string>((resolve, reject) => {
  execFile('git', ['-c', 'core.quotepath=off', ...args], { cwd, timeout: 15000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' } },
    (error, stdout) => (error ? reject(error) : resolve(stdout)));
});

/** "12\t3\tpath" lines: added and removed lines per file ("-" for a binary file). */
export function parseNumstat(text: string): Map<string, { added: number; removed: number; binary: boolean }> {
  const counts = new Map<string, { added: number; removed: number; binary: boolean }>();
  for (const line of text.split('\n')) {
    const [added, removed, ...rest] = line.split('\t');
    if (!rest.length) continue;
    counts.set(rest.join('\t'), { added: Number(added) || 0, removed: Number(removed) || 0, binary: added === '-' });
  }
  return counts;
}

/** A unified diff of several files, cut into each file's part, by its path (the "b/" side, or "a/" for a deleted file). */
export function splitPatch(text: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const part of text.split(/^(?=diff --git )/m)) {
    const target = /^\+\+\+ b\/(.+)$/m.exec(part)?.[1] ?? /^--- a\/(.+)$/m.exec(part)?.[1];
    const hunks = part.indexOf('\n@@');
    if (target) parts.set(target, hunks === -1 ? '' : part.slice(hunks + 1));
  }
  return parts;
}

const cutPatch = (patch: string): { patch: string; truncated?: true } => (patch.length > PATCH_LIMIT ? { patch: patch.slice(0, patch.lastIndexOf('\n', PATCH_LIMIT) + 1), truncated: true } : { patch });

/** A new file not yet known to git, as an addition of all its lines. */
async function untracked(file: string): Promise<Omit<FileChange, 'path'>> {
  const content = await readFile(file).catch(() => null);
  if (!content) return { status: 'deleted', added: 0, removed: 0, patch: '' };
  if (content.includes(0)) return { status: 'added', added: 0, removed: 0, patch: '', binary: true };
  const lines = content.toString('utf8').replace(/\n$/, '').split('\n');
  return { status: 'added', added: lines.length, removed: 0, ...cutPatch(`@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join('\n')}\n`) };
}

/** What git says of some files of one repository against its last commit (or `since`); files without changes are left out. */
async function inRepository(top: string, files: readonly string[], since?: string): Promise<FileChange[]> {
  const base = since ?? await git(top, ['rev-parse', '--verify', '--quiet', 'HEAD']).then(() => 'HEAD', () => EMPTY_TREE);
  const relative = files.map((file) => path.relative(top, file));
  const options = ['diff', base, '--no-color', '--no-ext-diff', '--no-renames'];
  const [numstat, statuses, patch, others] = await Promise.all([
    git(top, [...options, '--numstat', '--', ...relative]),
    git(top, [...options, '--name-status', '--', ...relative]),
    git(top, [...options, '-U3', '--', ...relative]),
    git(top, ['ls-files', '--others', '--exclude-standard', '--', ...relative]),
  ]);
  const counts = parseNumstat(numstat);
  const letters = new Map(statuses.split('\n').filter(Boolean).map((line) => { const [letter, ...rest] = line.split('\t'); return [rest.join('\t'), letter] as const; }));
  const patches = splitPatch(patch);
  const newFiles = new Set(others.split('\n').filter(Boolean));
  const changes: FileChange[] = [];
  for (const [index, name] of relative.entries()) {
    const file = files[index];
    if (newFiles.has(name)) { changes.push({ path: file, ...(await untracked(file)) }); continue; }
    const count = counts.get(name);
    if (!count) continue;
    const letter = letters.get(name);
    const status = letter === 'A' ? 'added' : letter === 'D' ? 'deleted' : 'modified';
    changes.push({ path: file, status, added: count.added, removed: count.removed, ...(count.binary ? { patch: '', binary: true } : cutPatch(patches.get(name) ?? '')) });
  }
  return changes;
}

/**
 * Where a session's branch left its base (`base`, the branch it merges into) and the files it changed since, committed
 * or not: an isolated session's work is all of its branch (see server/worktrees.ts).
 */
async function branchWork(cwd: string, base: string): Promise<{ top: string; start: string; files: string[] } | null> {
  try {
    const top = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim();
    const start = (await git(top, ['merge-base', base, 'HEAD'])).trim();
    const [committed, others] = await Promise.all([git(top, ['diff', '--name-only', '--no-renames', start]), git(top, ['ls-files', '--others', '--exclude-standard'])]);
    return { top, start, files: [...committed.split('\n'), ...others.split('\n')].filter(Boolean).map((file) => path.join(top, file)) };
  } catch {
    return null;
  }
}

/**
 * The changes of a session's files. `allowed`: whether a folder may be read (inside the roots); a file outside them, or
 * outside any git repository, is listed without its diff. `base`: the session works on a branch of its own, which is
 * compared from where it left `base`, commits included.
 */
export async function sessionChanges(cwd: string, sessionId: string, allowed: (directory: string) => boolean, home?: string, base?: string): Promise<SessionChanges> {
  const texts = await Promise.all((await transcripts(cwd, sessionId, home)).map((file) => readFile(file, 'utf8').catch(() => '')));
  const edited = [...new Set(texts.flatMap(editedFiles))];
  const branch = base ? await branchWork(cwd, base) : null;
  const files = [...new Set([...(branch?.files ?? []), ...edited])].slice(-FILE_LIMIT);
  const repositories = new Map<string, string[]>();
  const outside: FileChange[] = [];
  const tops = new Map<string, string | null>();
  for (const file of files) {
    const directory = path.dirname(file);
    if (!allowed(directory)) continue;
    if (!tops.has(directory)) tops.set(directory, await git(directory, ['rev-parse', '--show-toplevel']).then((top) => top.trim(), () => null));
    const top = tops.get(directory);
    if (top) repositories.set(top, [...(repositories.get(top) ?? []), file]);
    else outside.push({ path: file, status: 'outside', added: 0, removed: 0, patch: '' });
  }
  const found = (await Promise.all([...repositories].map(([top, list]) => inRepository(top, list, branch && top === branch.top ? branch.start : undefined).catch(() => [])))).flat();
  // the order the files were last written in, and no more patch text than a message should carry
  const order = new Map(files.map((file, index) => [file, index]));
  const changes = [...found, ...outside].sort((a, b) => (order.get(b.path) ?? 0) - (order.get(a.path) ?? 0));
  let budget = TOTAL_LIMIT;
  for (const change of changes) {
    if (change.patch.length <= budget) { budget -= change.patch.length; continue; }
    change.patch = '';
    change.truncated = true;
  }
  return { files: changes, added: changes.reduce((sum, change) => sum + change.added, 0), removed: changes.reduce((sum, change) => sum + change.removed, 0), touched: edited.length };
}
