// Git for the sessions that work on a branch of their own, in a worktree of their repository (see
// docs/superpowers/specs/2026-10-21-worktrees-design.md). Open Space makes the worktree itself, where Claude Code's own
// `claude --worktree` would (<repo>/.claude/worktrees/<name>), so the terminal and Claude Code find the same folders,
// and it keeps the part that must be safe: checking and moving the base branch, never losing work without saying so.
// The part that needs judgement (one clean commit, catching up, conflicts) is asked of the session itself.
//
// What Open Space remembers of a branch lives in the repository's own config (branch.<name>.openspace-*, local, never
// committed): who it is for, its base, the conversation that works on it. `git branch -D` takes it away with the branch.
import { execFile } from 'node:child_process';
import { accessSync, constants, existsSync, realpathSync } from 'node:fs';
import { appendFile, cp, mkdir, readdir, readFile, rename, rm, rmdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BRANCH_PREFIX, WORKTREES_FOLDER, isInside, worktreeNames } from '../shared/worktrees.ts';
import type { BranchRow, BranchStatus, FolderRepo, MergeProblem } from '../shared/protocol.ts';
import { projectFolder } from './conversations.ts';
import { st } from './i18n/index.ts';

const GIT_TIMEOUT_MS = 60_000;
const NOTE = 'openspace';

interface GitResult { code: number; stdout: string; stderr: string }

/** Runs git in `cwd`; never throws (the code says how it went). */
function run(cwd: string, args: readonly string[], input?: string): Promise<GitResult> {
  return new Promise((resolve) => {
    // core.fsmonitor names a program git runs on status: a folder's own .git/config must not start one here
    const child = execFile('git', ['-c', 'core.quotepath=off', '-c', 'core.fsmonitor=false', ...args], {
      cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' },
    }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
    if (input !== undefined) child.stdin?.end(input);
  });
}

/** Runs git and gives what it wrote; throws with git's last words when it fails. */
async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await run(cwd, args);
  if (result.code !== 0) throw new GitError(lastLine(result.stderr) || lastLine(result.stdout) || `git ${args[0]} failed`);
  return result.stdout;
}

export class GitError extends Error {}

const lastLine = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean).at(-1) ?? '';
const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);
const real = (folder: string) => { try { return realpathSync(folder); } catch { return path.resolve(folder); } };

/** A worktree of a repository, as `git worktree list --porcelain` tells it (the main checkout first); `lock`: why it is locked, '' when no reason was given. */
export interface WorktreeEntry { path: string; head: string; branch: string | null; locked: boolean; lock?: string }

export function parseWorktreeList(text: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('worktree ')) { current = { path: line.slice(9), head: '', branch: null, locked: false }; entries.push(current); continue; }
    if (!current) continue;
    if (line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (line.startsWith('branch ')) current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (line === 'locked' || line.startsWith('locked ')) { current.locked = true; current.lock = line.slice(7); }
  }
  return entries;
}

/**
 * A locked worktree is in use: by a program still running, when its reason names a process ("claude session x (pid 465
 * start …)" is what `claude --worktree` leaves, and keeps after it ended: checked with 2.1.306), or for good, locked by
 * hand. Open Space never removes one.
 */
export function inUse(entry: WorktreeEntry, alive = isAlive): boolean {
  if (!entry.locked) return false;
  const pid = /\(pid (\d+)/.exec(entry.lock ?? '')?.[1];
  return pid ? alive(Number(pid)) : true;
}

function isAlive(pid: number) {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

export async function worktreeList(cwd: string): Promise<WorktreeEntry[]> {
  return parseWorktreeList(await git(cwd, ['worktree', 'list', '--porcelain'])).map((entry) => ({ ...entry, path: real(entry.path) }));
}

/** Files with changes not committed in a checkout ("M  a.ts", "?? b.ts"), by path. */
async function uncommitted(cwd: string): Promise<string[]> {
  const out = await git(cwd, ['status', '--porcelain', '-z', '--untracked-files=all']);
  const paths: string[] = [];
  const parts = out.split('\0');
  for (let index = 0; index < parts.length; index++) {
    const entry = parts[index];
    if (entry.length < 4) continue;
    paths.push(entry.slice(3));
    // a rename gives its old name next: it is not a file of its own
    if (entry[0] === 'R' || entry[0] === 'C') index++;
  }
  return paths;
}

/** What the launcher needs to know of a folder (FolderRepo, but how many branches are left to tidy): none when it is not in a git repository. */
export async function folderRepo(folder: string): Promise<Omit<FolderRepo, 'merged'> | null> {
  const top = await run(folder, ['rev-parse', '--show-toplevel']);
  if (top.code !== 0) return null;
  const checkout = real(top.stdout.trim());
  const list = await worktreeList(checkout).catch(() => []);
  const main = list[0];
  if (!main) return null;
  const branches = lines(await git(main.path, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])).filter((name) => !name.startsWith(BRANCH_PREFIX));
  // a folder inside a worktree goes back to the same place in the main checkout
  const sub = path.relative(checkout, real(folder));
  // a repository without any commit has a branch name but nothing to start a branch from
  const born = !/^0+$/.test(main.head);
  return { root: main.path, sub: sub.startsWith('..') ? '' : sub, branch: born ? main.branch ?? '' : '', branches, dirty: (await uncommitted(main.path).catch(() => [])).length };
}

/** `.claude/worktrees/` in the repository's own exclude file (local, nothing committed), once. */
async function excludeWorktrees(mainRoot: string) {
  const common = path.resolve(mainRoot, (await git(mainRoot, ['rev-parse', '--git-common-dir'])).trim());
  const file = path.join(common, 'info', 'exclude');
  const line = `${WORKTREES_FOLDER}/`;
  const text = await readFile(file, 'utf8').catch(() => '');
  if (text.split('\n').some((entry) => entry.trim() === line || entry.trim() === `/${line}`)) return;
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${text && !text.endsWith('\n') ? '\n' : ''}# Open Space: the sessions' own folders\n${line}\n`);
}

const branchExists = async (mainRoot: string, branch: string) => (await run(mainRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])).code === 0;

/** What Open Space keeps of a branch, in the repository's config. */
export interface BranchNote { name?: string; base?: string; sub?: string; conversation?: string }

export async function setBranchNote(mainRoot: string, branch: string, note: BranchNote) {
  for (const [key, value] of Object.entries(note)) {
    if (value) await git(mainRoot, ['config', `branch.${branch}.${NOTE}-${key}`, value]);
  }
}

export async function branchNotes(mainRoot: string): Promise<Map<string, BranchNote>> {
  const found = await run(mainRoot, ['config', '--local', '--get-regexp', `^branch\\..*\\.${NOTE}-`]);
  const notes = new Map<string, BranchNote>();
  for (const line of lines(found.stdout)) {
    const space = line.includes(' ') ? line.indexOf(' ') : line.length;
    const key = line.slice(0, space), value = line.slice(space + 1);
    const at = key.lastIndexOf(`.${NOTE}-`);
    const branch = key.slice('branch.'.length, at), field = key.slice(at + NOTE.length + 2) as keyof BranchNote;
    if (!['name', 'base', 'sub', 'conversation'].includes(field)) continue;
    notes.set(branch, { ...notes.get(branch), [field]: value });
  }
  return notes;
}

export interface NewWorktree { root: string; branch: string }

/**
 * A worktree and its branch for a session: os/<name>-<slug> from `base`, in <repo>/.claude/worktrees/os-<name>-<slug>,
 * with -2, -3… when either is taken.
 */
export async function createWorktree(options: { mainRoot: string; name: string; about: string; base: string; note: BranchNote }): Promise<NewWorktree> {
  const { mainRoot } = options;
  let names = worktreeNames(options.name, options.about);
  for (let suffix = 2; existsSync(path.join(mainRoot, WORKTREES_FOLDER, names.folder)) || await branchExists(mainRoot, names.branch); suffix++) {
    names = worktreeNames(options.name, options.about, suffix);
  }
  await excludeWorktrees(mainRoot);
  const root = path.join(mainRoot, WORKTREES_FOLDER, names.folder);
  await mkdir(path.dirname(root), { recursive: true });
  await git(mainRoot, ['worktree', 'add', '-b', names.branch, root, options.base]);
  await setBranchNote(mainRoot, names.branch, { ...options.note, base: options.base });
  return { root: real(root), branch: names.branch };
}

/** A worktree again for a branch kept without one (a session switched off with "Keep the branch", then resumed). */
export async function recreateWorktree(mainRoot: string, branch: string): Promise<string> {
  const stem = branch.startsWith(BRANCH_PREFIX) ? branch.slice(BRANCH_PREFIX.length) : branch.replace(/[^\w-]+/g, '-');
  let folder = `os-${stem}`;
  for (let suffix = 2; existsSync(path.join(mainRoot, WORKTREES_FOLDER, folder)); suffix++) folder = `os-${stem}-${suffix}`;
  await excludeWorktrees(mainRoot);
  const root = path.join(mainRoot, WORKTREES_FOLDER, folder);
  await mkdir(path.dirname(root), { recursive: true });
  await git(mainRoot, ['worktree', 'add', root, branch]);
  return real(root);
}

/**
 * What a new worktree gets from the main checkout that git does not carry: with a `.worktreeinclude` at the root
 * (gitignore patterns, Claude Code's convention), the ignored files it names; else the .env files (outside
 * node_modules) and the node_modules and Pods folders. Relative paths, a folder ending with "/".
 */
export async function includedEntries(mainRoot: string): Promise<string[]> {
  const rules = path.join(mainRoot, '.worktreeinclude');
  const ignored = (args: string[]) => run(mainRoot, ['ls-files', '-z', '--others', '--ignored', '--directory', ...args]).then((result) => result.stdout.split('\0').filter(Boolean));
  let entries: string[];
  if (existsSync(rules)) {
    const named = await ignored([`--exclude-from=${rules}`]);
    // only what git ignores: a file it tracks or could track goes with the branch already
    const checked = await run(mainRoot, ['check-ignore', '-z', '--stdin'], named.map((entry) => entry.replace(/\/$/, '')).join('\0'));
    const kept = new Set(checked.stdout.split('\0').filter(Boolean));
    entries = named.filter((entry) => kept.has(entry.replace(/\/$/, '')));
  } else {
    entries = (await ignored(['--exclude-standard'])).filter((entry) => {
      const parts = entry.replace(/\/$/, '').split('/');
      const base = parts.at(-1) ?? '';
      if (entry.endsWith('/')) return base === 'node_modules' || base === 'Pods';
      return base.startsWith('.env') && !parts.includes('node_modules');
    });
  }
  return entries.filter((entry) => !isInside(`/${entry.replace(/\/$/, '')}`, `/${WORKTREES_FOLDER}`) && !entry.startsWith('.git/'));
}

export interface CopyResult { copied: number; failed: number; skipped: boolean }

/**
 * APFS clones on Mac; independent ordinary copies elsewhere (or when cloning is unavailable).
 */
export async function copyIncluded(mainRoot: string, worktreeRoot: string, platform = process.platform): Promise<CopyResult> {
  const entries = await includedEntries(mainRoot);
  if (!entries.length) return { copied: 0, failed: 0, skipped: false };
  let copied = 0, failed = 0;
  for (const entry of entries) {
    const relative = entry.replace(/\/$/, '');
    const target = path.join(worktreeRoot, relative);
    if (existsSync(target)) continue;
    await mkdir(path.dirname(target), { recursive: true });
    const source = path.join(mainRoot, relative);
    let ok = platform === 'darwin' && await new Promise<boolean>((resolve) => execFile('/bin/cp', ['-c', '-R', source, target], { timeout: 120_000 }, (error) => resolve(!error)));
    if (!ok) {
      try {
        if (platform === 'darwin') await rm(target, { recursive: true, force: true });
        // No hardlinks: a session editing its .env or dependencies must not change the main checkout.
        await cp(source, target, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
        ok = true;
      } catch { /* reported below; remove any incomplete copy */ }
    }
    if (ok) copied++;
    else { failed++; await rm(target, { recursive: true, force: true }); }
  }
  return { copied, failed, skipped: false };
}

/**
 * Throws unless the worktree is on `branch` with no rebase, merge, cherry-pick or revert under way: otherwise what it
 * holds is not on the branch (a detached HEAD, another branch), and removing the folder would lose it.
 */
export async function checkOnBranch(worktreeRoot: string, branch: string) {
  const head = await run(worktreeRoot, ['symbolic-ref', '-q', 'HEAD']);
  if (head.code !== 0 || head.stdout.trim() !== `refs/heads/${branch}`) throw new GitError(st.worktree.notOnBranch(branch));
  for (const state of ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']) {
    const where = (await git(worktreeRoot, ['rev-parse', '--git-path', state])).trim();
    if (existsSync(path.resolve(worktreeRoot, where))) throw new GitError(st.worktree.midOperation);
  }
}

const local = (branch: string) => `refs/heads/${branch}`;

/** What a session's branch holds against its base (see BranchStatus). */
export async function branchStatus(worktreeRoot: string, base: string): Promise<BranchStatus> {
  const count = async (range: string) => Number((await git(worktreeRoot, ['rev-list', '--count', range])).trim()) || 0;
  const [head, ahead, behind, dirtyPaths] = await Promise.all([
    git(worktreeRoot, ['rev-parse', 'HEAD']).then((out) => out.trim()), count(`${local(base)}..HEAD`), count(`HEAD..${local(base)}`), uncommitted(worktreeRoot),
  ]);
  const start = (await git(worktreeRoot, ['merge-base', local(base), 'HEAD'])).trim();
  const committed = lines(await git(worktreeRoot, ['diff', '--name-only', '--no-renames', start, 'HEAD', '--']));
  return { head, ahead, behind, dirty: dirtyPaths.length, files: new Set([...committed, ...dirtyPaths]).size };
}

/** True when an executable called `name` is on the PATH given. */
function onPath(name: string, searchPath: string) {
  return searchPath.split(path.delimiter).filter((folder) => path.isAbsolute(folder)).some((folder) => {
    try { accessSync(path.join(folder, process.platform === 'win32' ? `${name}.exe` : name), constants.X_OK); return true; } catch { return false; }
  });
}

/** A pull request can be opened: the repository has a remote, and GitHub's `gh` is installed. */
export async function canOpenPullRequest(mainRoot: string, searchPath = process.env.PATH ?? ''): Promise<boolean> {
  const remotes = await run(mainRoot, ['remote']);
  return lines(remotes.stdout).length > 0 && (onPath('gh', searchPath) || ['/opt/homebrew/bin', '/usr/local/bin'].some((folder) => onPath('gh', folder)));
}

export type LandOutcome = { ok: true } | { ok: false; problem: MergeProblem };

/**
 * Brings the base up to a branch the session made ready (one clean commit on top of it): checked first (the worktree
 * clean, the base an ancestor of the branch), then a fast-forward. In the main checkout when the base is checked out
 * there (`merge --ff-only`, refused when its uncommitted files are among those the branch changes); `update-ref`
 * when it is checked out nowhere; never when it is checked out in another worktree.
 */
export function landBranch(options: { mainRoot: string; worktreeRoot: string; branch: string; base: string }): Promise<LandOutcome> {
  // one at a time per repository: two sessions done together do not fight over the main checkout's index, and the
  // second one finds the base moved (and catches up) rather than failing on git's lock
  const previous = landings.get(options.mainRoot) ?? Promise.resolve();
  const next = previous.then(() => land(options));
  landings.set(options.mainRoot, next);
  void next.then(() => { if (landings.get(options.mainRoot) === next) landings.delete(options.mainRoot); });
  return next;
}

const landings = new Map<string, Promise<LandOutcome>>();

async function land(options: { mainRoot: string; worktreeRoot: string; branch: string; base: string }): Promise<LandOutcome> {
  const { mainRoot, worktreeRoot, branch, base } = options;
  try {
    const dirty = await uncommitted(worktreeRoot);
    if (dirty.length) return { ok: false, problem: { kind: 'dirty', count: dirty.length } };
    // what is landed is the branch: work left on a detached HEAD or in a rebase under way would be lost with the folder
    await checkOnBranch(worktreeRoot, branch);
    // read once, then checked and moved from these very commits: another merge into the same base in between makes
    // update-ref refuse, rather than drop its commit
    const before = (await git(mainRoot, ['rev-parse', '--verify', local(base)])).trim();
    const after = (await git(mainRoot, ['rev-parse', '--verify', local(branch)])).trim();
    if ((await run(mainRoot, ['merge-base', '--is-ancestor', before, after])).code !== 0) return { ok: false, problem: { kind: 'behind' } };
    const holder = (await worktreeList(mainRoot)).find((entry) => entry.branch === base);
    if (holder && holder.path !== real(mainRoot)) return { ok: false, problem: { kind: 'elsewhere', folder: holder.path } };
    if (holder) {
      const changed = new Set(lines(await git(mainRoot, ['diff', '--name-only', '--no-renames', before, after, '--'])));
      const common = (await uncommitted(mainRoot)).filter((file) => changed.has(file));
      if (common.length) return { ok: false, problem: { kind: 'overlap', count: common.length } };
      await git(mainRoot, ['merge', '--ff-only', '--quiet', after]);
    } else {
      await git(mainRoot, ['update-ref', local(base), after, before]);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, problem: { kind: 'git', text: error instanceof Error ? error.message : String(error) } };
  }
}

/** Commits what is left in a worktree as "wip: <name>", so nothing stays only in a folder about to go; false when there was nothing. */
export async function commitWork(worktreeRoot: string, name: string): Promise<boolean> {
  if (!(await uncommitted(worktreeRoot)).length) return false;
  await git(worktreeRoot, ['add', '-A']);
  // a safety commit: the repository's hooks (lint, tests) must not keep the work from being saved
  const message = ['commit', '--no-verify', '--quiet', '-m', `wip: ${name}`];
  const first = await run(worktreeRoot, message);
  if (first.code === 0) return true;
  // no identity set up for git on this computer: Open Space signs it
  await git(worktreeRoot, ['-c', 'user.name=Open Space', '-c', 'user.email=open-space@localhost', ...message]);
  return true;
}

/** Removes a worktree's folder (`force`: even with changes, which the caller decided to lose). */
export async function removeWorktree(mainRoot: string, worktreeRoot: string, force: boolean) {
  const result = await run(mainRoot, ['worktree', 'remove', ...(force ? ['--force', '--force'] : []), worktreeRoot]);
  if (result.code === 0) return;
  // already gone from the disk: git only needs to forget it
  if (!existsSync(worktreeRoot)) { await run(mainRoot, ['worktree', 'prune']); return; }
  throw new GitError(lastLine(result.stderr) || 'git worktree remove failed');
}

/** Deletes a branch; with `mergedInto`, only when all of it is in that branch (else it is kept, and false says so). */
export async function deleteBranch(mainRoot: string, branch: string, mergedInto?: string): Promise<boolean> {
  if (!await branchExists(mainRoot, branch)) return true;
  if (mergedInto && (await run(mainRoot, ['merge-base', '--is-ancestor', local(branch), local(mergedInto)])).code !== 0) return false;
  await git(mainRoot, ['branch', '-D', '--quiet', branch]);
  return true;
}

/** The branches Open Space may delete: its own, and those `claude --worktree` makes; any other is the user's. */
const isSessionBranch = (branch: string) => branch.startsWith(BRANCH_PREFIX) || branch.startsWith('worktree-');

/** The branch a kept conversation worked on, when it has no worktree any more: it gets one again when resumed. */
export async function keptBranchOf(mainRoot: string, conversation: string): Promise<{ branch: string; note: BranchNote } | null> {
  const notes = await branchNotes(mainRoot);
  const checkedOut = new Set((await worktreeList(mainRoot)).map((entry) => entry.branch));
  for (const [branch, note] of notes) {
    if (note.conversation === conversation && !checkedOut.has(branch) && await branchExists(mainRoot, branch)) return { branch, note };
  }
  return null;
}

/**
 * The branches of a repository worth tidying: every worktree in .claude/worktrees (Open Space's and Claude Code's), and
 * every os/* branch without one. The base of a branch is the one noted when it was made, else the main checkout's.
 */
export async function listBranches(mainRoot: string): Promise<BranchRow[]> {
  const list = await worktreeList(mainRoot);
  const mainBranch = list[0]?.branch ?? '';
  const notes = await branchNotes(mainRoot);
  const holder = path.join(real(mainRoot), WORKTREES_FOLDER);
  const rows: { branch: string; folder: string | null; head: string; inUse: boolean }[] = list.filter((entry) => isInside(entry.path, holder) && entry.path !== holder)
    .map((entry) => ({ branch: entry.branch ?? '', folder: entry.path, head: entry.head, inUse: inUse(entry) }));
  const checkedOut = new Set(list.map((entry) => entry.branch));
  // an os/* branch Open Space did not make (no note of it) is the user's own
  for (const line of lines(await git(mainRoot, ['for-each-ref', '--format=%(refname:short)%09%(objectname)', `refs/heads/${BRANCH_PREFIX}`]))) {
    const [branch, head] = line.split('\t');
    if (!checkedOut.has(branch) && notes.has(branch)) rows.push({ branch, folder: null, head, inUse: false });
  }
  /** Commits of `ref` not in `base`; null when that cannot be told (the base deleted since). */
  const count = async (base: string, ref: string) => {
    if (!base) return null;
    const result = await run(mainRoot, ['rev-list', '--count', `${local(base)}..${ref}`]);
    return result.code === 0 ? Number(result.stdout.trim()) || 0 : null;
  };
  return Promise.all(rows.map(async (row): Promise<BranchRow> => {
    const note = notes.get(row.branch) ?? {};
    const noted = note.base || mainBranch;
    const ref = row.head;
    // a base deleted since: counted against the main checkout's branch; and when even that cannot be told, all of it
    let base = noted, ahead = await count(noted, ref);
    if (ahead === null && noted !== mainBranch) { base = mainBranch; ahead = await count(mainBranch, ref); }
    const known = ahead !== null;
    if (ahead === null) ahead = Number((await run(mainRoot, ['rev-list', '--count', ref])).stdout.trim()) || 0;
    const at = Number((await run(mainRoot, ['log', '-1', '--format=%ct', ref])).stdout.trim()) * 1000 || 0;
    const dirty = row.folder && existsSync(row.folder) ? (await uncommitted(row.folder).catch(() => [])).length : 0;
    return {
      branch: row.branch, folder: row.folder, base: base || noted, head: row.head, at, ahead, dirty, merged: known && ahead === 0 && dirty === 0,
      claude: row.folder !== null && !path.basename(row.folder).startsWith('os-'),
      ...(row.inUse ? { inUse: true } : {}),
      ...(note.name ? { name: note.name } : {}), ...(note.conversation ? { conversation: note.conversation } : {}),
    };
  }));
}

/**
 * Removes a worktree and its branch (what the cleaning panel was told to; `mergedInto`: the branch only when it is all
 * in that one). A branch that is not a session's (the user's own, checked out in .claude/worktrees) is left.
 */
export async function dropBranch(mainRoot: string, row: { branch: string; folder: string | null }, mergedInto?: string) {
  if (row.folder) await removeWorktree(mainRoot, row.folder, true);
  if (row.branch && isSessionBranch(row.branch)) await deleteBranch(mainRoot, row.branch, mergedInto);
}

/**
 * Moves a conversation's transcripts from where Claude Code keeps those of one folder to another's
 * (~/.claude/projects/<folder key>/<id>.jsonl, and <id>/ for its sub-agents), its process stopped: Open Space looks
 * for them by the session's folder, and the next launch, from the new folder, finds them there (checked with 2.1.306).
 * A file already there (written by a resume from the other folder) is kept if it is the larger one.
 */
export async function moveConversation(fromCwd: string, toCwd: string, ids: readonly string[], home = os.homedir()) {
  const from = projectFolder(fromCwd, home), to = projectFolder(toCwd, home);
  if (from === to) return;
  await mkdir(to, { recursive: true });
  for (const id of new Set(ids)) {
    const file = `${id}.jsonl`;
    if (existsSync(path.join(from, file))) {
      const target = path.join(to, file);
      if (existsSync(target) && (await stat(target)).size >= (await stat(path.join(from, file))).size) await rename(path.join(from, file), `${target}.from-${path.basename(from)}`);
      else await rename(path.join(from, file), target);
    }
    if (existsSync(path.join(from, id))) {
      await cp(path.join(from, id), path.join(to, id), { recursive: true, force: false, errorOnExist: false });
      await rm(path.join(from, id), { recursive: true, force: true });
    }
  }
  // the worktree's own key, left empty, goes too
  if (existsSync(from) && !(await readdir(from)).length) await rmdir(from).catch(() => {});
}
