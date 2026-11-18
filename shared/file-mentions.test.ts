import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { folderOfPath, pathMention, rankPaths, type PathEntry } from './file-mentions.ts';

const file = (path: string): PathEntry => ({ path, folder: false });
const folder = (path: string): PathEntry => ({ path, folder: true });

describe('file mentions', () => {
  const entries: PathEntry[] = [
    folder('src'), folder('src/command'), folder('src/components'), folder('docs'), folder('app'), folder('app/src'), folder('app/src/components'),
    file('README.md'), file('src/compute.ts'), file('src/command/CommandField.tsx'), file('src/command/Composer.tsx'),
    file('src/components/Button.tsx'), file('app/src/components/Card.tsx'), file('docs/Été.md'), file('docs/my notes.txt'),
  ];
  const paths = (query: string, limit?: number) => rankPaths(entries, query, limit).map((entry) => entry.path);

  it('offers the names starting with what is typed first, the shallowest first, then the paths that hold it', () => {
    assert.deepEqual(paths('comp'), ['src/components', 'src/compute.ts', 'app/src/components', 'src/command/Composer.tsx', 'src/components/Button.tsx', 'app/src/components/Card.tsx']);
    assert.deepEqual(paths('field'), ['src/command/CommandField.tsx']);
  });

  it('finds a name whatever its case and accents', () => {
    assert.deepEqual(paths('ete'), ['docs/Été.md']);
    assert.deepEqual(paths('readme'), ['README.md']);
  });

  it('lists the folder itself then what is in it once its name is typed with a "/"', () => {
    assert.deepEqual(paths('src/', 4), ['src', 'src/command', 'src/components', 'src/compute.ts']);
    assert.deepEqual(paths('src/comp'), ['src/components', 'src/compute.ts', 'app/src/components', 'src/components/Button.tsx', 'app/src/components/Card.tsx']);
  });

  it('starts with the folder’s own entries when nothing is typed yet, and stops at the limit', () => {
    assert.deepEqual(paths('', 5), ['app', 'docs', 'README.md', 'src', 'app/src']);
    assert.equal(rankPaths(entries, 'zzz').length, 0);
  });

  it('writes a mention Claude Code reads: a folder open to go on typing, a name with a space in quotes', () => {
    assert.deepEqual(pathMention(file('src/compute.ts')), { insert: '@src/compute.ts ', caret: 16, whole: '@src/compute.ts' });
    assert.deepEqual(pathMention(folder('src/command')), { insert: '@src/command/', caret: 13, whole: '@src/command/' });
    assert.deepEqual(pathMention(file('docs/my notes.txt')), { insert: '@"docs/my notes.txt" ', caret: 21, whole: '@"docs/my notes.txt"' });
    // the caret stays inside the quotes, before the closing one, to type on into the folder
    assert.deepEqual(pathMention(folder('my docs')), { insert: '@"my docs/"', caret: 10, whole: '@"my docs/' });
  });

  it('tells the folder an entry is in, the root as ""', () => {
    assert.equal(folderOfPath('src/command/Composer.tsx'), 'src/command');
    assert.equal(folderOfPath('README.md'), '');
  });
});
