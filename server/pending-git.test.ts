// What git says a session leaves pending, on real throwaway repositories.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { readGitPending } from './pending-git.ts';

const scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'os-pending-git-')));
after(() => rmSync(scratch, { recursive: true, force: true }));

const IDENTITY = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com'];
const sh = (cwd: string, ...args: string[]) => execFileSync('git', [...IDENTITY, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let count = 0;
const commit = (cwd: string, file: string) => { writeFileSync(path.join(cwd, file), `${file} ${++count}\n`); sh(cwd, 'add', '.'); sh(cwd, 'commit', '-q', '-m', file); };

/** A clone of a bare repository with one commit on main, up to date with its upstream. */
function clone(): string {
  const remote = path.join(scratch, `remote-${++count}.git`);
  const seed = path.join(scratch, `seed-${count}`);
  const root = path.join(scratch, `repo-${count}`);
  sh(scratch, 'init', '-q', '--bare', '-b', 'main', remote);
  mkdirSync(seed);
  sh(seed, 'init', '-q', '-b', 'main');
  commit(seed, 'README.md');
  sh(seed, 'push', '-q', remote, 'main');
  sh(scratch, 'clone', '-q', remote, root);
  return root;
}

describe('what git says a session leaves pending', () => {
  it('says nothing outside a repository, or when all is committed and pushed', async () => {
    const plain = path.join(scratch, 'plain');
    mkdirSync(plain);
    assert.equal(await readGitPending(plain), null);
    assert.equal(await readGitPending(path.join(scratch, 'missing')), null);
    assert.equal(await readGitPending(clone()), null);
  });

  it('counts the files not committed and the commits not pushed', async () => {
    const root = clone();
    writeFileSync(path.join(root, 'README.md'), 'changed\n');
    assert.deepEqual(await readGitPending(root), { dirty: 1, unpushed: 0, noUpstream: false, branch: 'main' });
    sh(root, 'checkout', '-q', '--', 'README.md');
    commit(root, 'a.txt');
    commit(root, 'b.txt');
    assert.deepEqual(await readGitPending(root), { dirty: 0, unpushed: 2, noUpstream: false, branch: 'main' });
  });

  it('says nothing of a new branch without a commit of its own, and counts those of a branch never pushed', async () => {
    const root = clone();
    sh(root, 'checkout', '-q', '-b', 'feature');
    assert.equal(await readGitPending(root), null);
    commit(root, 'feature.txt');
    assert.deepEqual(await readGitPending(root), { dirty: 0, unpushed: 1, noUpstream: true, branch: 'feature' });
  });

  it('says nothing of commits in a repository with no remote, nor on a branch whose remote one was deleted', async () => {
    const local = path.join(scratch, 'local');
    mkdirSync(local);
    sh(local, 'init', '-q', '-b', 'main');
    commit(local, 'notes.md');
    assert.equal(await readGitPending(local), null);
    writeFileSync(path.join(local, 'notes.md'), 'changed\n');
    assert.deepEqual(await readGitPending(local), { dirty: 1, unpushed: 0, noUpstream: false, branch: 'main' });
    const root = clone();
    sh(root, 'checkout', '-q', '-b', 'merged');
    commit(root, 'merged.txt');
    sh(root, 'push', '-q', '-u', 'origin', 'merged');
    sh(root, 'push', '-q', 'origin', '--delete', 'merged');
    sh(root, 'fetch', '-q', '--prune');
    assert.equal(await readGitPending(root), null);
  });
});
