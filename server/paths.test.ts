import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { isWithin, listProjectDirectories, resolveAllowedDirectory, resolveInside } from './paths.ts';

let base: string;
let root: string;
let outside: string;

before(() => {
  base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-paths-')));
  root = path.join(base, 'root');
  outside = path.join(base, 'outside');
  mkdirSync(path.join(root, 'project'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(path.join(root, 'project', 'file.txt'), 'inside');
  writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'project', 'link-to-secret.txt'));
  symlinkSync(outside, path.join(root, 'link-to-outside-dir'));
  symlinkSync(path.join(root, 'project'), path.join(root, 'link-to-project'));
  mkdirSync(path.join(base, 'root-evil'));
});

after(() => rmSync(base, { recursive: true, force: true }));

describe('isWithin', () => {
  it('is lexically strict about siblings sharing a prefix', () => {
    assert.equal(isWithin('/a/root', '/a/root'), true);
    assert.equal(isWithin('/a/root', '/a/root/x/y'), true);
    assert.equal(isWithin('/a/root', '/a/root-evil'), false);
    assert.equal(isWithin('/a/root', '/a'), false);
    assert.equal(isWithin('/a/root', '/a/root/..foo'), true);
  });
});

describe('resolveInside', () => {
  it('returns the real path of a file inside the root', () => {
    assert.equal(resolveInside(root, 'project/file.txt'), path.join(root, 'project', 'file.txt'));
  });

  it('refuses dot-dot escapes', () => {
    assert.equal(resolveInside(root, '../outside/secret.txt'), null);
    assert.equal(resolveInside(root, 'project/../../outside/secret.txt'), null);
  });

  it('refuses absolute paths outside the root', () => {
    assert.equal(resolveInside(root, path.join(outside, 'secret.txt')), null);
  });

  it('refuses a symlinked file pointing outside', () => {
    assert.equal(resolveInside(root, 'project/link-to-secret.txt'), null);
  });

  it('refuses a symlinked directory pointing outside', () => {
    assert.equal(resolveInside(root, 'link-to-outside-dir/secret.txt'), null);
  });

  it('allows a symlink that stays inside the root', () => {
    assert.equal(resolveInside(root, 'link-to-project/file.txt'), path.join(root, 'project', 'file.txt'));
  });

  it('returns null for a missing file', () => {
    assert.equal(resolveInside(root, 'project/nope.txt'), null);
  });
});

describe('resolveAllowedDirectory', () => {
  it('accepts a directory under a root and a root itself', () => {
    assert.equal(resolveAllowedDirectory(path.join(root, 'project'), [root]), path.join(root, 'project'));
    assert.equal(resolveAllowedDirectory(root, [root]), root);
  });

  it('refuses directories outside every root, including prefix siblings', () => {
    assert.equal(resolveAllowedDirectory(outside, [root]), null);
    assert.equal(resolveAllowedDirectory(path.join(base, 'root-evil'), [root]), null);
    assert.equal(resolveAllowedDirectory(os.homedir(), [root]), null);
  });

  it('refuses a symlink inside the root that leads outside', () => {
    assert.equal(resolveAllowedDirectory(path.join(root, 'link-to-outside-dir'), [root]), null);
  });

  it('refuses relative paths, files and missing paths', () => {
    assert.equal(resolveAllowedDirectory('project', [root]), null);
    assert.equal(resolveAllowedDirectory(path.join(root, 'project', 'file.txt'), [root]), null);
    assert.equal(resolveAllowedDirectory(path.join(root, 'missing'), [root]), null);
  });

  it('reads "~" as the home, the way the page shows paths, and nothing else starting with it', () => {
    assert.equal(resolveAllowedDirectory('~/project', [root], root), path.join(root, 'project'));
    assert.equal(resolveAllowedDirectory('~', [root], root), root);
    assert.equal(resolveAllowedDirectory('~project', [root], root), null);
    assert.equal(resolveAllowedDirectory('~/../outside', [root], root), null);
  });

  it('ignores roots that do not exist', () => {
    assert.equal(resolveAllowedDirectory(path.join(root, 'project'), [path.join(base, 'ghost'), root]), path.join(root, 'project'));
  });
});

describe('listProjectDirectories', () => {
  it('lists two levels of visible sub-folders, not the roots, skipping files, node_modules, hidden and "_" folders, and symlinks that leave the root', () => {
    mkdirSync(path.join(root, '.hidden'), { recursive: true });
    mkdirSync(path.join(root, '_template'), { recursive: true });
    mkdirSync(path.join(root, 'project', 'mobile', 'deep'), { recursive: true });
    mkdirSync(path.join(root, 'project', 'node_modules'), { recursive: true });
    const listed = listProjectDirectories([root, path.join(base, 'ghost')]);
    assert.ok(!listed.includes(root));
    assert.ok(listed.includes(path.join(root, 'project')));
    assert.ok(listed.includes(path.join(root, 'project', 'mobile')));
    assert.ok(!listed.includes(path.join(root, 'project', 'mobile', 'deep')));
    assert.ok(!listed.some((entry) => entry.includes('.hidden') || entry.includes('_template') || entry.includes('node_modules')));
    assert.ok(!listed.includes(outside));
    assert.ok(!listed.some((entry) => entry.endsWith('file.txt')));
  });
});
