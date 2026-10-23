import assert from 'node:assert/strict';
import { it } from 'node:test';
import { expandHomePath, isFolderPath } from './paths.ts';
import { isMetricsPath } from './metrics.ts';
import { defaultFolder } from './folders.ts';

it('accepts native Windows notes and Markdown paths, while rejecting relative paths and NULs', () => {
  for (const folder of ['D:\\Mes notes', 'C:/Users/Test/Journal', '\\\\server\\share\\notes', '~/Journal', '~\\Journal']) {
    assert.ok(isFolderPath(folder), folder);
    assert.ok(isMetricsPath(`${folder}\\chiffres.md`), folder);
  }
  for (const file of ['C:chiffres.md', 'notes/chiffres.md', 'D:\\notes\0\\chiffres.md', '~someone/notes.md']) assert.ok(!isMetricsPath(file), file);
  assert.equal(expandHomePath('~\\Journal', 'C:\\Users\\Test'), 'C:\\Users\\Test\\Journal');
  assert.equal(expandHomePath('~', 'C:\\Users\\Test'), 'C:\\Users\\Test');
});

it('keeps a Windows default folder inside an allowed root and rejects a sibling or another drive', () => {
  const roots = ['D:\\Code', 'C:\\Projects'];
  assert.equal(defaultFolder(roots, 'c:/projects/mobile'), 'c:/projects/mobile');
  assert.equal(defaultFolder(roots, 'C:\\Projects-old'), roots[0]);
  assert.equal(defaultFolder(roots, 'E:\\Projects'), roots[0]);
});
