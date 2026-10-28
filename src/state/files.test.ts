import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EMPTY_EXPLORER, fileAfter, fileKind, movePaths, previewOf, previewUrl, treeRows, type OpenFile } from './files.ts';

const opened = (over: Partial<OpenFile> = {}): OpenFile => ({ path: 'a.ts', text: 'one', version: 'v1', draft: null, conflict: null, loaded: 1, saving: false, loading: false, ...over });

describe('the file explorer', () => {
  it('shows the unfolded folders’ contents under them', () => {
    const explorer = { ...EMPTY_EXPLORER, folders: { '': [{ name: 'src', folder: true }, { name: 'a.ts', folder: false }], src: [{ name: 'b.ts', folder: false }], lib: [] }, expanded: ['src'] };
    assert.deepEqual(treeRows(explorer).map((row) => `${row.depth}:${row.path}`), ['0:src', '1:src/b.ts', '0:a.ts']);
    assert.deepEqual(treeRows({ ...explorer, expanded: [] }).map((row) => row.path), ['src', 'a.ts']);
  });

  it('tells a file’s kind from its name', () => {
    assert.deepEqual(['index.ts', 'README.md', 'package.json', 'package-lock.json', '.env', 'vite.config.ts', 'logo.PNG', 'notes'].map(fileKind), ['code', 'text', 'data', 'lock', 'config', 'config', 'image', 'other']);
  });

  it('previews pictures, PDFs, videos and sounds, from a link to the session’s folder', () => {
    assert.deepEqual(['shot.PNG', 'logo.svg', 'spec.pdf', 'demo.mov', 'jingle.mp3', 'data.zip', 'index.ts'].map(previewOf), ['image', 'image', 'pdf', 'video', 'audio', null, null]);
    assert.equal(previewUrl('s1', 'assets/mon logo#2.png', 3), '/files/s1/assets/mon%20logo%232.png?v=3');
  });

  it('follows a renamed or deleted folder', () => {
    assert.deepEqual(movePaths(['src', 'src/lib', 'srcs', 'docs'], 'src', 'app'), ['app', 'app/lib', 'srcs', 'docs']);
    assert.deepEqual(movePaths(['src', 'src/lib', 'docs'], 'src', null), ['docs']);
  });

  it('keeps the user’s draft over a file read again, and asks when a save meets the session’s change', () => {
    const typed = opened({ draft: 'mine' });
    assert.equal(fileAfter(typed, { path: 'a.ts', text: 'theirs', version: 'v2' }, 'read'), typed);
    const replaced = fileAfter(opened(), { path: 'a.ts', text: 'theirs', version: 'v2' }, 'read');
    assert.equal(replaced?.text, 'theirs');
    assert.equal(replaced?.loaded, 2, 'the editor starts over on the new text');
    const refused = fileAfter(opened({ draft: 'mine', saving: true }), { path: 'a.ts', text: 'theirs', version: 'v2' }, 'conflict');
    assert.equal(refused?.conflict?.text, 'theirs');
    assert.equal(refused?.draft, 'mine');
    const saved = fileAfter(opened({ draft: 'mine', saving: true }), { path: 'a.ts', text: 'mine', version: 'v3' }, 'saved');
    assert.deepEqual([saved?.draft, saved?.version, saved?.saving, saved?.loaded], [null, 'v3', false, 1]);
    assert.equal(fileAfter(opened(), { path: 'b.ts', text: 'x', version: 'v9' }, 'read')?.path, 'a.ts', 'another file’s answer changes nothing');
  });
});
