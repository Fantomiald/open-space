// The worktrees' git, on real throwaway repositories.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { projectFolder } from './conversations.ts';
import {
  branchNotes, branchStatus, checkOnBranch, commitWork, copyIncluded, createWorktree, deleteBranch, dropBranch, folderRepo, includedEntries, inUse, keptBranchOf,
  landBranch, listBranches, moveConversation, parseWorktreeList, recreateWorktree, removeWorktree, setBranchNote,
} from './worktrees.ts';

const scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'os-worktrees-')));
after(() => rmSync(scratch, { recursive: true, force: true }));

const IDENTITY = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com'];
const sh = (cwd: string, ...args: string[]) => execFileSync('git', [...IDENTITY, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (file: string, text: string) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); };

let count = 0;
/** A repository on main with one commit, a .gitignore for node_modules and .env, and what a project leaves around. */
function repository(): string {
  const root = path.join(scratch, `repo-${++count}`);
  mkdirSync(root);
  sh(root, 'init', '-q', '-b', 'main');
  sh(root, 'config', 'core.autocrlf', 'false');
  write(path.join(root, '.gitignore'), 'node_modules/\n.env*\nPods/\n');
  write(path.join(root, 'app.ts'), 'export const a = 1;\n');
  write(path.join(root, 'mobile', 'index.ts'), 'export const b = 2;\n');
  sh(root, 'add', '.');
  sh(root, 'commit', '-q', '-m', 'init');
  return root;
}

const commit = (cwd: string, file: string, text: string, message = `change ${file}`) => { write(path.join(cwd, file), text); sh(cwd, 'add', '.'); sh(cwd, 'commit', '-q', '-m', message); };

test('a folder outside git is no repository; inside, its root, branch, branches and changes', async () => {
  const outside = path.join(scratch, 'plain');
  mkdirSync(outside);
  assert.equal(await folderRepo(outside), null);
  const root = repository();
  sh(root, 'branch', 'develop');
  sh(root, 'branch', 'os/lina-old');
  write(path.join(root, 'app.ts'), 'export const a = 3;\n');
  write(path.join(root, 'new.ts'), 'new\n');
  const found = await folderRepo(path.join(root, 'mobile'));
  assert.deepEqual(found, { root, sub: 'mobile', branch: 'main', branches: ['develop', 'main'], dirty: 2 });
});

test('a worktree is made in .claude/worktrees on its own branch, excluded from git, named again when taken', async () => {
  const root = repository();
  const made = await createWorktree({ mainRoot: root, name: 'Lina', about: 'Ajoute Apple Pay au checkout', base: 'main', note: { name: 'Lina', sub: '' } });
  assert.deepEqual(made, { root: path.join(root, '.claude/worktrees/os-lina-apple-pay-checkout'), branch: 'os/lina-apple-pay-checkout' });
  assert.equal(sh(made.root, 'branch', '--show-current').trim(), 'os/lina-apple-pay-checkout');
  // the main checkout does not see the folder
  assert.equal(sh(root, 'status', '--porcelain'), '');
  const again = await createWorktree({ mainRoot: root, name: 'Lina', about: 'Ajoute Apple Pay au checkout', base: 'main', note: {} });
  assert.equal(again.branch, 'os/lina-apple-pay-checkout-2');
  const exclude = readFileSync(path.join(root, '.git/info/exclude'), 'utf8');
  assert.equal(exclude.split('\n').filter((line) => line === '.claude/worktrees/').length, 1);
  assert.deepEqual((await branchNotes(root)).get(made.branch), { name: 'Lina', base: 'main' });
});

test('what is copied: .env files and node_modules / Pods folders, or what .worktreeinclude names', async () => {
  const root = repository();
  write(path.join(root, '.env'), 'SECRET=1\n');
  write(path.join(root, 'mobile', '.env.local'), 'LOCAL=1\n');
  write(path.join(root, 'node_modules', 'x', 'index.js'), 'x\n');
  write(path.join(root, 'node_modules', 'x', '.env'), 'no\n');
  write(path.join(root, 'mobile', 'node_modules', 'y.js'), 'y\n');
  write(path.join(root, 'mobile', 'ios', 'Pods', 'p.h'), 'p\n');
  write(path.join(root, 'scratch.log'), 'not this\n');
  assert.deepEqual((await includedEntries(root)).sort(), ['.env', 'mobile/.env.local', 'mobile/ios/Pods/', 'mobile/node_modules/', 'node_modules/']);
  // Files and dependency folders are independent copies on Windows/Linux, APFS clones on Mac.
  {
    const made = await createWorktree({ mainRoot: root, name: 'Tom', about: 'dark mode', base: 'main', note: {} });
    const copied = await copyIncluded(root, made.root);
    assert.equal(copied.failed, 0);
    assert.equal(copied.copied, 5);
    assert.equal(copied.skipped, false);
    assert.equal(readFileSync(path.join(made.root, '.env'), 'utf8'), 'SECRET=1\n');
    assert.ok(existsSync(path.join(made.root, 'mobile/node_modules/y.js')));
    assert.equal(sh(made.root, 'status', '--porcelain'), '');
    write(path.join(made.root, '.env'), 'SECRET=2\n');
    write(path.join(made.root, 'mobile/node_modules/y.js'), 'modified\n');
    assert.equal(readFileSync(path.join(root, '.env'), 'utf8'), 'SECRET=1\n');
    assert.equal(readFileSync(path.join(root, 'mobile/node_modules/y.js'), 'utf8'), 'y\n');
    assert.deepEqual(await copyIncluded(root, made.root), { copied: 0, failed: 0, skipped: false }, 'existing files are never overwritten');
  }
  // a .worktreeinclude says what to take, among what git ignores (a tracked file or one git does not ignore goes with the branch)
  write(path.join(root, '.worktreeinclude'), '.env\nscratch.log\napp.ts\nmobile/node_modules/\n');
  assert.deepEqual((await includedEntries(root)).sort(), ['.env', 'mobile/node_modules/', 'node_modules/x/.env']);
});

test("a branch's status: commits ahead, files, changes not committed, the base's new commits", async () => {
  const root = repository();
  const made = await createWorktree({ mainRoot: root, name: 'Zoe', about: 'hero', base: 'main', note: {} });
  assert.deepEqual({ ...await branchStatus(made.root, 'main'), head: '' }, { ahead: 0, behind: 0, files: 0, dirty: 0, head: '' });
  commit(made.root, 'hero.ts', 'hero\n');
  commit(made.root, 'app.ts', 'export const a = 2;\n');
  write(path.join(made.root, 'draft.ts'), 'draft\n');
  commit(root, 'other.ts', 'other\n');
  const status = await branchStatus(made.root, 'main');
  assert.deepEqual({ ...status, head: '' }, { ahead: 2, behind: 1, files: 3, dirty: 1, head: '' });
  assert.match(status.head, /^[0-9a-f]{40}$/);
});

test('landing a branch fast-forwards the base checked out in the main checkout, after the checks', async () => {
  const root = repository();
  const made = await createWorktree({ mainRoot: root, name: 'Lina', about: 'pay', base: 'main', note: {} });
  commit(made.root, 'pay.ts', 'pay\n');
  write(path.join(made.root, 'left.ts'), 'left\n');
  assert.deepEqual(await landBranch({ mainRoot: root, worktreeRoot: made.root, branch: made.branch, base: 'main' }), { ok: false, problem: { kind: 'dirty', count: 1 } });
  rmSync(path.join(made.root, 'left.ts'));
  // the base moved on: the session must catch up first
  commit(root, 'other.ts', 'other\n');
  assert.deepEqual(await landBranch({ mainRoot: root, worktreeRoot: made.root, branch: made.branch, base: 'main' }), { ok: false, problem: { kind: 'behind' } });
  sh(made.root, 'rebase', '-q', 'main');
  // uncommitted changes of the main checkout in a file the branch changes: refused, nothing moved
  write(path.join(root, 'pay.ts'), 'mine\n');
  assert.deepEqual(await landBranch({ mainRoot: root, worktreeRoot: made.root, branch: made.branch, base: 'main' }), { ok: false, problem: { kind: 'overlap', count: 1 } });
  rmSync(path.join(root, 'pay.ts'));
  // other uncommitted changes stay as they are
  write(path.join(root, 'app.ts'), 'export const a = 9;\n');
  assert.deepEqual(await landBranch({ mainRoot: root, worktreeRoot: made.root, branch: made.branch, base: 'main' }), { ok: true });
  assert.equal(sh(root, 'rev-parse', 'main').trim(), sh(root, 'rev-parse', made.branch).trim());
  assert.equal(readFileSync(path.join(root, 'pay.ts'), 'utf8'), 'pay\n');
  assert.equal(readFileSync(path.join(root, 'app.ts'), 'utf8'), 'export const a = 9;\n');
});

test('landing a branch on a base checked out nowhere moves the ref; in another worktree, it is refused', async () => {
  const root = repository();
  sh(root, 'branch', 'release');
  const made = await createWorktree({ mainRoot: root, name: 'Tom', about: 'fix', base: 'release', note: {} });
  commit(made.root, 'fix.ts', 'fix\n');
  assert.deepEqual(await landBranch({ mainRoot: root, worktreeRoot: made.root, branch: made.branch, base: 'release' }), { ok: true });
  assert.equal(sh(root, 'rev-parse', 'release').trim(), sh(root, 'rev-parse', made.branch).trim());
  // the main checkout did not move
  assert.equal(sh(root, 'branch', '--show-current').trim(), 'main');
  const elsewhere = path.join(scratch, `elsewhere-${count}`);
  sh(root, 'worktree', 'add', '-q', elsewhere, 'release');
  commit(made.root, 'more.ts', 'more\n');
  const outcome = await landBranch({ mainRoot: root, worktreeRoot: made.root, branch: made.branch, base: 'release' });
  assert.deepEqual(outcome, { ok: false, problem: { kind: 'elsewhere', folder: realpathSync(elsewhere) } });
});

test('keeping a branch commits its work as wip, removes its folder, and finds it again for its conversation', async () => {
  const root = repository();
  const made = await createWorktree({ mainRoot: root, name: 'Nora', about: 'links', base: 'main', note: { conversation: '11111111-2222-3333-4444-555555555555' } });
  write(path.join(made.root, 'links.ts'), 'links\n');
  assert.equal(await commitWork(made.root, 'Nora'), true);
  assert.equal(await commitWork(made.root, 'Nora'), false);
  assert.equal(sh(root, 'log', '-1', '--format=%s', made.branch).trim(), 'wip: Nora');
  await removeWorktree(root, made.root, false);
  assert.ok(!existsSync(made.root));
  const kept = await keptBranchOf(root, '11111111-2222-3333-4444-555555555555');
  assert.equal(kept?.branch, made.branch);
  const again = await recreateWorktree(root, made.branch);
  assert.equal(again, made.root);
  assert.equal(readFileSync(path.join(again, 'links.ts'), 'utf8'), 'links\n');
  // checked out again: not a kept branch any more
  assert.equal(await keptBranchOf(root, '11111111-2222-3333-4444-555555555555'), null);
});

test('the branches of a repository: worktrees of Open Space and Claude Code, os/* branches without a folder, merged or not', async () => {
  const root = repository();
  const merged = await createWorktree({ mainRoot: root, name: 'Hugo', about: 'migration', base: 'main', note: { name: 'Hugo' } });
  const ahead = await createWorktree({ mainRoot: root, name: 'Tom', about: 'dark mode', base: 'main', note: { name: 'Tom' } });
  commit(ahead.root, 'dark.ts', 'dark\n');
  commit(ahead.root, 'mode.ts', 'mode\n');
  const dirty = await createWorktree({ mainRoot: root, name: 'Nora', about: 'links', base: 'main', note: {} });
  write(path.join(dirty.root, 'links.ts'), 'links\n');
  sh(root, 'worktree', 'add', '-q', '-b', 'worktree-spike', path.join(root, '.claude/worktrees/spike'), 'main');
  sh(root, 'branch', 'os/old-one');
  await setBranchNote(root, 'os/old-one', { name: 'Zoé' });
  const rows = await listBranches(root);
  const by = new Map(rows.map((row) => [row.branch, row]));
  assert.deepEqual([...by.keys()].sort(), ['os/hugo-migration', 'os/nora-links', 'os/old-one', 'os/tom-dark-mode', 'worktree-spike']);
  assert.equal(by.get('os/hugo-migration')?.merged, true);
  assert.equal(by.get('os/hugo-migration')?.name, 'Hugo');
  assert.deepEqual([by.get('os/tom-dark-mode')?.ahead, by.get('os/tom-dark-mode')?.merged], [2, false]);
  assert.deepEqual([by.get('os/nora-links')?.dirty, by.get('os/nora-links')?.merged], [1, false]);
  assert.deepEqual([by.get('os/old-one')?.folder, by.get('os/old-one')?.name], [null, 'Zoé']);
  assert.equal(by.get('worktree-spike')?.claude, true);
  assert.ok((by.get('os/hugo-migration')?.at ?? 0) > 0);
  await dropBranch(root, { branch: merged.branch, folder: merged.root });
  await dropBranch(root, { branch: dirty.branch, folder: dirty.root });
  assert.ok(!existsSync(dirty.root));
  assert.deepEqual((await listBranches(root)).map((row) => row.branch).sort(), ['os/old-one', 'os/tom-dark-mode', 'worktree-spike']);
});

test("a conversation's transcripts move from one folder's key to another's, sub-agents included", async () => {
  const home = path.join(scratch, 'home');
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const from = projectFolder('/work/garden/.claude/worktrees/os-lina', home), to = projectFolder('/work/garden', home);
  write(path.join(from, `${id}.jsonl`), '{"a":1}\n');
  write(path.join(from, id, 'subagents', 'agent-1.jsonl'), '{}\n');
  await moveConversation('/work/garden/.claude/worktrees/os-lina', '/work/garden', [id, id], home);
  assert.equal(readFileSync(path.join(to, `${id}.jsonl`), 'utf8'), '{"a":1}\n');
  assert.ok(existsSync(path.join(to, id, 'subagents', 'agent-1.jsonl')));
  assert.ok(!existsSync(path.join(from, `${id}.jsonl`)));
  assert.ok(!existsSync(path.join(from, id)));
  assert.ok(!existsSync(from), 'the empty key of the worktree goes too');
});

test('a worktree off its branch (a detached HEAD, a rebase under way) is never landed: its work is not on the branch', async () => {
  const root = repository();
  const made = await createWorktree({ mainRoot: root, name: 'Lina', about: 'pay', base: 'main', note: {} });
  commit(made.root, 'pay.ts', 'pay\n');
  sh(made.root, 'checkout', '-q', '--detach');
  commit(made.root, 'more.ts', 'more\n');
  const outcome = await landBranch({ mainRoot: root, worktreeRoot: made.root, branch: made.branch, base: 'main' });
  assert.equal(outcome.ok, false);
  assert.equal(!outcome.ok && outcome.problem.kind, 'git');
  assert.equal(sh(root, 'log', '-1', '--format=%s', 'main').trim(), 'init');
  await assert.rejects(checkOnBranch(made.root, made.branch), /plus sur la branche/);
  // a rebase stopped on a conflict: refused too
  sh(made.root, 'checkout', '-q', made.branch);
  commit(made.root, 'app.ts', 'export const a = 2;\n');
  commit(root, 'app.ts', 'export const a = 3;\n');
  assert.throws(() => sh(made.root, 'rebase', '-q', 'main'));
  await assert.rejects(checkOnBranch(made.root, made.branch));
});

test('two merges into one base at once: the base never loses the commit of either', async () => {
  const root = repository();
  sh(root, 'branch', 'release');
  const first = await createWorktree({ mainRoot: root, name: 'Lina', about: 'one', base: 'release', note: {} });
  const second = await createWorktree({ mainRoot: root, name: 'Tom', about: 'two', base: 'release', note: {} });
  commit(first.root, 'one.ts', 'one\n');
  commit(second.root, 'two.ts', 'two\n');
  for (let round = 0; round < 3; round++) {
    const outcomes = await Promise.all([first, second].map((made) => landBranch({ mainRoot: root, worktreeRoot: made.root, branch: made.branch, base: 'release' })));
    const base = sh(root, 'rev-parse', 'release').trim();
    // what landed is in the base: a merge that would drop the other's commit is refused instead
    [first, second].forEach((made, index) => {
      if (outcomes[index].ok) assert.doesNotThrow(() => sh(root, 'merge-base', '--is-ancestor', made.branch, base), `${made.branch} landed but is not in release`);
    });
    // one after the other: the second one finds the base moved, and catches up
    assert.deepEqual(outcomes.map((outcome) => (outcome.ok ? 'ok' : outcome.problem.kind)), ['ok', 'behind']);
    // the one that lost catches up for the next round
    sh(root, 'branch', '-f', 'release', 'main');
  }
});

test('a worktree locked by a program still running, or by hand, is in use; one whose Claude Code ended is not', () => {
  const [, cc, hand] = parseWorktreeList([
    'worktree /r', 'HEAD 1', 'branch refs/heads/main', '',
    'worktree /r/.claude/worktrees/probe', 'HEAD 1', 'branch refs/heads/worktree-probe', 'locked claude session probe (pid 465 start Wed Oct 21 11:33:55 2026)', '',
    'worktree /r/.claude/worktrees/mine', 'HEAD 1', 'branch refs/heads/mine', 'locked', '',
  ].join('\n'));
  assert.equal(cc.lock, 'claude session probe (pid 465 start Wed Oct 21 11:33:55 2026)');
  assert.equal(inUse(cc, () => true), true);
  assert.equal(inUse(cc, () => false), false);
  assert.equal(inUse(hand, () => false), true);
});

test('the cleaning panel: a worktree in use is marked, os/* branches Open Space did not make are not listed, a user branch is never deleted', async () => {
  const root = repository();
  const spike = path.join(root, '.claude/worktrees/spike');
  sh(root, 'worktree', 'add', '-q', '-b', 'worktree-spike', spike, 'main');
  sh(root, 'worktree', 'lock', '--reason', `claude session spike (pid ${process.pid} start now)`, spike);
  sh(root, 'branch', 'os/linux-support');
  const mine = path.join(root, '.claude/worktrees/develop');
  sh(root, 'worktree', 'add', '-q', '-b', 'develop', mine, 'main');
  const rows = await listBranches(root);
  const by = new Map(rows.map((row) => [row.branch, row]));
  assert.deepEqual([...by.keys()].sort(), ['develop', 'worktree-spike']);
  assert.equal(by.get('worktree-spike')?.inUse, true);
  assert.equal(by.get('develop')?.inUse, undefined);
  // the user's own branch, checked out there: its folder goes, the branch stays
  await dropBranch(root, { branch: 'develop', folder: realpathSync(mine) });
  assert.ok(!existsSync(mine));
  assert.equal(sh(root, 'branch', '--list', 'develop').trim(), 'develop');
});

test('a branch whose base was deleted is counted against the main branch, and not called merged', async () => {
  const root = repository();
  sh(root, 'branch', 'feature');
  const made = await createWorktree({ mainRoot: root, name: 'Iris', about: 'menu', base: 'feature', note: {} });
  commit(made.root, 'menu.ts', 'menu\n');
  sh(root, 'branch', '-D', 'feature');
  const row = (await listBranches(root)).find((candidate) => candidate.branch === made.branch);
  assert.deepEqual([row?.base, row?.ahead, row?.merged], ['main', 1, false]);
});

test('deleting a branch only when it is all in another one', async () => {
  const root = repository();
  sh(root, 'branch', 'os/done');
  sh(root, 'checkout', '-q', '-b', 'os/work');
  commit(root, 'work.ts', 'work\n');
  sh(root, 'checkout', '-q', 'main');
  assert.equal(await deleteBranch(root, 'os/work', 'main'), false);
  assert.equal(await deleteBranch(root, 'os/done', 'main'), true);
  assert.equal(sh(root, 'branch', '--list', 'os/*').trim(), 'os/work');
});
