import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BranchRow, BranchStatus, FolderRepo, SessionInfo, SessionState, WorktreeInfo } from '../../shared/protocol.ts';
import { asksBeforeSwitchingOff, branchCard, branchLines, branchPreview, branchSignature, checkedByDefault, isolationOffer, keyOf, loss, occupants, shownFolder } from './worktrees.ts';

const session = (id: string, state: SessionState, extra: Partial<SessionInfo> = {}): SessionInfo => ({
  id, name: id, cwd: '/work/garden', model: '', activeModel: '', permissionMode: 'auto', state, stateSince: 1000, createdAt: 0, turns: 1, permissions: [],
  subagents: [], command: '', lastMessage: '', resumable: true, lastSeq: 5, ...extra,
});
const repo: FolderRepo = { root: '/work/garden', sub: '', branch: 'main', branches: ['main'], dirty: 0, merged: 0 };
const status = (extra: Partial<BranchStatus> = {}): BranchStatus => ({ ahead: 0, behind: 0, files: 0, dirty: 0, head: 'abc', ...extra });
const worktree = (extra: Partial<WorktreeInfo> = {}): WorktreeInfo => ({
  branch: 'os/lina-pay', base: 'main', root: '/work/garden/.claude/worktrees/os-lina-pay', mainRoot: '/work/garden', home: '/work/garden', ...extra,
});
const row = (branch: string, extra: Partial<BranchRow> = {}): BranchRow => ({ branch, folder: null, base: 'main', head: 'a'.repeat(40), at: 1, ahead: 0, dirty: 0, merged: true, claude: false, ...extra });

describe('isolating a new session', () => {
  it('counts the sessions of the main checkout, resting ones included, not the isolated ones nor those elsewhere', () => {
    const list = [
      session('Hugo', 'work', { cwd: '/work/garden/mobile', stateSince: 3 }), session('Zoe', 'wait', { resting: true, stateSince: 5 }),
      session('Lina', 'wait', { cwd: worktree().root, worktree: worktree() }), session('Tom', 'work', { cwd: '/work/garden-web' }),
    ];
    assert.deepEqual(occupants(list, repo).map((one) => one.name), ['Zoe', 'Hugo']);
    assert.deepEqual(occupants(list, repo, 'Zoe').map((one) => one.name), ['Hugo']);
  });

  it('offers it when the folder is taken (checked), always when asked, and checked off when told never', () => {
    assert.deepEqual(isolationOffer('busy', repo, 0), { shown: false, checked: false });
    assert.deepEqual(isolationOffer('busy', repo, 1), { shown: true, checked: true });
    assert.deepEqual(isolationOffer('always', repo, 0), { shown: true, checked: true });
    assert.deepEqual(isolationOffer('never', repo, 2), { shown: true, checked: false });
    assert.deepEqual(isolationOffer('busy', null, 2), { shown: false, checked: false });
    assert.deepEqual(isolationOffer('always', { ...repo, branch: '' }, 2), { shown: false, checked: false }, 'a detached checkout has no base');
  });

  it('shows the branch the server will name', () => {
    assert.equal(branchPreview('Lina', 'Ajoute Apple Pay au checkout'), 'os/lina-apple-pay-checkout');
    assert.equal(branchPreview('Zoé', ''), 'os/zoe');
  });
});

describe("an isolated session's card", () => {
  it('shows ready when it waits and its branch has news, unless put off for this state of the branch', () => {
    const ready = session('Lina', 'wait', { worktree: worktree({ status: status({ ahead: 2, files: 3 }) }) });
    assert.deepEqual(branchCard(ready, undefined), { kind: 'ready', status: status({ ahead: 2, files: 3 }) });
    assert.equal(branchCard(ready, branchSignature(status({ ahead: 2, files: 3 }))), null);
    assert.ok(branchCard(ready, branchSignature(status({ ahead: 1 }))), 'a change brings it back');
    assert.equal(branchCard({ ...ready, state: 'work' }, undefined), null);
    assert.equal(branchCard(session('Lina', 'wait', { worktree: worktree({ status: status() }) }), undefined), null, 'nothing new');
    assert.equal(branchCard(session('Lina', 'wait'), undefined), null);
  });

  it('shows the failure of a merge, and nothing while it merges', () => {
    assert.deepEqual(branchCard(session('Lina', 'wait', { worktree: worktree({ merge: { step: 'failed', problem: { kind: 'behind' } } }) }), undefined), { kind: 'failed' });
    assert.equal(branchCard(session('Lina', 'wait', { worktree: worktree({ status: status({ ahead: 1 }), merge: { step: 'asked', retried: false } }) }), undefined), null);
  });

  it('asks before switching off only with work on the branch, and shows the main folder', () => {
    assert.equal(asksBeforeSwitchingOff(session('Lina', 'wait', { worktree: worktree({ status: status({ dirty: 1 }) }) })), true);
    assert.equal(asksBeforeSwitchingOff(session('Lina', 'wait', { worktree: worktree({ status: status() }) })), false);
    assert.equal(asksBeforeSwitchingOff(session('Lina', 'wait', { worktree: worktree() })), true, 'not known yet: asked');
    assert.equal(asksBeforeSwitchingOff(session('Lina', 'wait')), false);
    assert.equal(shownFolder(session('Lina', 'wait', { cwd: worktree().root, worktree: worktree() })), '/work/garden');
  });
});

describe('the cleaning panel', () => {
  const lina = session('Lina', 'work', { worktree: worktree({ root: '/w/os-lina', branch: 'os/lina-pay' }) });
  const zoe = session('Zoe', 'wait', { resting: true, worktree: worktree({ root: '/w/os-zoe', branch: 'os/zoe-hero' }) });
  const rows = [
    row('os/lina-pay', { folder: '/w/os-lina', merged: false, ahead: 3, at: 50 }), row('os/zoe-hero', { folder: '/w/os-zoe', at: 40 }),
    row('os/hugo-migration', { name: 'Hugo', at: 30 }), row('os/tom-dark', { merged: false, ahead: 2, name: 'Tom', at: 20 }), row('os/nora-links', { folder: '/w/os-nora', merged: false, dirty: 4, at: 10 }),
  ];
  const lines = branchLines(rows, [lina, zoe]);

  it('finds the session on each branch and how it is doing', () => {
    assert.deepEqual(lines.map((line) => [line.row.branch, line.name, line.state, line.locked]), [
      ['os/lina-pay', 'Lina', 'working', true], ['os/zoe-hero', 'Zoe', 'resting', false], ['os/hugo-migration', 'Hugo', 'off', false],
      ['os/tom-dark', 'Tom', 'off', false], ['os/nora-links', null, 'off', false],
    ]);
  });

  it('checks the merged branches nobody works on, and says what the others would lose', () => {
    const checked = checkedByDefault(lines);
    assert.deepEqual([...checked].map((key) => key.split('\u0000')[0]), ['os/zoe-hero', 'os/hugo-migration']);
    assert.deepEqual(loss(lines, checked), { commits: 0, files: 0 });
    assert.deepEqual(loss(lines, new Set([...checked, keyOf(lines[3]), keyOf(lines[4])])), { commits: 2, files: 4 });
  });

  it('a worktree still in use (Claude Code in a terminal) is locked, and never checked', () => {
    const [line] = branchLines([row('worktree-spike', { folder: '/w/spike', claude: true, inUse: true })], []);
    assert.equal(line.locked, true);
    assert.equal(checkedByDefault([line]).size, 0);
  });
});
