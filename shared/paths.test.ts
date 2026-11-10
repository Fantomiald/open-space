import assert from 'node:assert/strict';
import { it } from 'node:test';
import { expandHomePath, isFullPath } from './paths.ts';
import { defaultFolder } from './folders.ts';

it('accepts native Windows notes paths, while rejecting relative paths and NULs', () => {
  for (const folder of ['D:\\Mes notes', 'C:/Users/Test/Journal', '\\\\server\\share\\notes', '~/Journal', '~\\Journal']) {
    assert.ok(isFullPath(folder), folder);
  }
  for (const folder of ['C:notes', 'notes/journal', 'D:\\notes\0', '~someone/notes']) assert.ok(!isFullPath(folder), folder);
  assert.equal(expandHomePath('~\\Journal', 'C:\\Users\\Test'), 'C:\\Users\\Test\\Journal');
  assert.equal(expandHomePath('~', 'C:\\Users\\Test'), 'C:\\Users\\Test');
});

it('keeps a Windows default folder inside an allowed root and rejects a sibling or another drive', () => {
  const roots = ['D:\\Code', 'C:\\Projects'];
  assert.equal(defaultFolder(roots, 'c:/projects/mobile'), 'c:/projects/mobile');
  assert.equal(defaultFolder(roots, 'C:\\Projects-old'), roots[0]);
  assert.equal(defaultFolder(roots, 'E:\\Projects'), roots[0]);
});
