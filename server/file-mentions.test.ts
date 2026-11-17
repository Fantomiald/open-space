import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { PathEntry } from '../shared/file-mentions.ts';
import { listPaths, pathFinder } from './file-mentions.ts';

const write = (file: string, text = '') => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); };
const sorted = (entries: PathEntry[]) => entries.map((entry) => `${entry.path}${entry.folder ? '/' : ''}`).sort();

describe('the paths "@" offers', () => {
  let base: string, repo: string, plain: string;
  before(() => {
    base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'file-mentions-')));
    repo = path.join(base, 'repo');
    plain = path.join(base, 'plain');
    write(path.join(base, 'outside', 'secret.txt'), 'secret');
    write(path.join(repo, '.gitignore'), '*.log\n');
    write(path.join(repo, 'README.md'));
    write(path.join(repo, 'src', 'app.ts'));
    write(path.join(repo, 'src', 'lib', 'util.ts'));
    write(path.join(repo, 'old.ts'));
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, stdio: 'ignore' });
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'first');
    // after the commit: new, ignored, a dependency folder .gitignore forgot, a file deleted, a link leading out
    write(path.join(repo, 'notes', 'todo.md'));
    write(path.join(repo, 'debug.log'));
    write(path.join(repo, 'node_modules', 'pkg', 'index.js'));
    rmSync(path.join(repo, 'old.ts'));
    symlinkSync(path.join(base, 'outside', 'secret.txt'), path.join(repo, 'leak.txt'));
    write(path.join(plain, 'top.txt'));
    write(path.join(plain, 'a', 'b', 'deep.txt'));
    write(path.join(plain, 'node_modules', 'pkg', 'index.js'));
    write(path.join(plain, '.git', 'HEAD'));
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  it('takes git’s list in a repository: tracked and new files, their folders, without what is ignored or node_modules', async () => {
    const listed = sorted(await listPaths(repo));
    assert.ok(listed.includes('src/'));
    assert.ok(listed.includes('src/lib/'));
    assert.ok(listed.includes('src/lib/util.ts'));
    assert.ok(listed.includes('notes/todo.md'), 'a file not committed yet');
    assert.ok(!listed.includes('debug.log'), '.gitignore is followed');
    assert.ok(!listed.some((entry) => entry.startsWith('node_modules')));
  });

  it('lists from the session’s folder when it is inside a repository, never above it', async () => {
    assert.deepEqual(sorted(await listPaths(path.join(repo, 'src'))), ['app.ts', 'lib/', 'lib/util.ts']);
  });

  it('walks a folder outside git, without .git or node_modules', async () => {
    assert.deepEqual(sorted(await listPaths(plain)), ['a/', 'a/b/', 'a/b/deep.txt', 'top.txt']);
  });

  it('answers a query with paths that are there and inside the folder', async () => {
    const find = pathFinder(0);
    assert.deepEqual(await find(repo, 'util'), [{ path: 'src/lib/util.ts', folder: false }]);
    assert.deepEqual(await find(repo, 'old'), [], 'deleted, though git still has it');
    assert.deepEqual(await find(repo, 'leak'), [], 'a link leading out');
    assert.deepEqual(await find(repo, 'debug'), []);
    assert.deepEqual((await find(plain, 'deep')).map((entry) => entry.path), ['a/b/deep.txt']);
  });
});
