import assert from 'node:assert/strict';
import { it } from 'node:test';
import { isAbsolutePath } from '../../shared/paths.ts';
import { folderName, homeRelative, splitPath } from './format.ts';
import { matchFolders } from '../state/folders.ts';

it('accepts drive and UNC roots, including a drive root, and rejects relative Windows paths', () => {
  for (const folder of ['C:\\', 'D:\\My Projects', 'D:/code', '\\\\server\\share', '/home/me']) assert.ok(isAbsolutePath(folder), folder);
  for (const folder of ['C:relative', 'code', '\\relative', '']) assert.ok(!isAbsolutePath(folder), folder);
});

it('shows and searches Windows folders with spaces and either separator', () => {
  assert.equal(folderName('D:\\My Projects\\garden'), 'garden');
  assert.deepEqual(splitPath('D:\\code\\app.ts'), { folder: 'D:\\code\\', name: 'app.ts' });
  assert.equal(homeRelative('C:\\Users\\Ada\\code\\garden'), 'C:\\Users\\Ada\\code\\garden');
  assert.equal(homeRelative('C:/Users/Ada/Journal'), 'C:\\Users\\Ada\\Journal');
  assert.equal(homeRelative('\\\\server\\share\\notes'), '\\\\server\\share\\notes');
  assert.equal(homeRelative('/Users/Ada/Journal'), '~/Journal');
  assert.deepEqual(matchFolders(['D:\\code\\garden', 'D:\\code\\garden-web'], 'd:/code/garden'), ['D:\\code\\garden', 'D:\\code\\garden-web']);
});
