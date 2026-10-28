import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { changeFiles, listFolder, readSessionFile, writeSessionFile } from './files.ts';
import { versionOf } from './journal.ts';
import { parseClientMessage } from './messages.ts';

describe('a session’s file explorer', () => {
  let base: string, root: string, trash: string;
  before(() => {
    base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'files-')));
    root = path.join(base, 'project');
    trash = path.join(base, 'Trash');
    mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
    mkdirSync(path.join(root, '.git'));
    mkdirSync(trash);
    mkdirSync(path.join(base, 'outside'));
    writeFileSync(path.join(base, 'outside', 'secret.txt'), 'secret');
    writeFileSync(path.join(root, 'README.md'), '# Hello\n');
    writeFileSync(path.join(root, 'file10.ts'), '');
    writeFileSync(path.join(root, 'file2.ts'), '');
    writeFileSync(path.join(root, 'logo.png'), Buffer.from([137, 80, 78, 71, 0, 1]));
    symlinkSync(path.join(base, 'outside', 'secret.txt'), path.join(root, 'leak.txt'));
    symlinkSync(path.join(base, 'outside'), path.join(root, 'leak'));
    symlinkSync(path.join(root, 'src'), path.join(root, 'sources'));
  });
  after(() => rmSync(base, { recursive: true, force: true }));

  it('lists folders first, then files in a person’s order, without .git or links leading out', async () => {
    assert.deepEqual(await listFolder(root, ''), [
      { name: 'sources', folder: true }, { name: 'src', folder: true },
      { name: 'file2.ts', folder: false }, { name: 'file10.ts', folder: false }, { name: 'logo.png', folder: false }, { name: 'README.md', folder: false },
    ]);
    assert.deepEqual(await listFolder(root, 'src'), [{ name: 'lib', folder: true }]);
    assert.equal(await listFolder(root, 'leak'), null);
    assert.equal(await listFolder(root, 'gone'), null);
  });

  it('reads text, and says why it does not show a binary file', async () => {
    assert.deepEqual(await readSessionFile(root, 'README.md'), { path: 'README.md', text: '# Hello\n', version: versionOf('# Hello\n') });
    assert.equal((await readSessionFile(root, 'logo.png')).unreadable, 'binary');
    assert.equal((await readSessionFile(root, 'leak.txt')).unreadable, 'missing');
    assert.equal((await readSessionFile(root, 'src')).unreadable, 'missing');
  });

  it('saves from the version read, and gives the file back when it changed meanwhile', async () => {
    const read = await readSessionFile(root, 'README.md');
    const saved = await writeSessionFile(root, 'README.md', '# Mine\n', read.version);
    assert.equal(saved.saved, true);
    writeFileSync(path.join(root, 'README.md'), '# The session’s\n');
    const refused = await writeSessionFile(root, 'README.md', '# Mine again\n', saved.file.version);
    assert.equal(refused.saved, false);
    assert.equal(refused.file.text, '# The session’s\n');
    assert.equal(readFileSync(path.join(root, 'README.md'), 'utf8'), '# The session’s\n');
    rmSync(path.join(root, 'README.md'));
    assert.equal((await writeSessionFile(root, 'README.md', '# Back\n', refused.file.version)).saved, true, 'a file deleted meanwhile is written again');
    await assert.rejects(writeSessionFile(root, 'leak.txt', 'x', versionOf('secret')));
    assert.equal(readFileSync(path.join(base, 'outside', 'secret.txt'), 'utf8'), 'secret');
  });

  it('makes, renames and puts in the Trash files and folders, and never what is taken or outside', async () => {
    assert.deepEqual(await changeFiles(root, { kind: 'newFile', folder: 'src', name: 'index.ts' }, trash), ['src']);
    assert.equal(readFileSync(path.join(root, 'src', 'index.ts'), 'utf8'), '');
    await changeFiles(root, { kind: 'newFolder', folder: '', name: 'docs' }, trash);
    await assert.rejects(changeFiles(root, { kind: 'newFile', folder: '', name: 'docs' }, trash), /docs/);
    await assert.rejects(changeFiles(root, { kind: 'newFile', folder: 'leak', name: 'x' }, trash));
    await changeFiles(root, { kind: 'rename', path: 'src/index.ts', name: 'main.ts' }, trash);
    assert.ok(existsSync(path.join(root, 'src', 'main.ts')));
    await assert.rejects(changeFiles(root, { kind: 'rename', path: 'file2.ts', name: 'file10.ts' }, trash), /file10/);
    assert.deepEqual(await changeFiles(root, { kind: 'delete', path: 'docs' }, trash), ['']);
    assert.ok(existsSync(path.join(trash, 'docs')));
    await changeFiles(root, { kind: 'delete', path: 'leak' }, trash);
    assert.ok(existsSync(path.join(base, 'outside', 'secret.txt')), 'a link is deleted, not what it leads to');
    await assert.rejects(changeFiles(root, { kind: 'delete', path: '' }, trash));
  });

  it('takes only paths from the session’s folder', () => {
    assert.deepEqual(parseClientMessage({ t: 'listFolder', sessionId: 's1', folder: '' }), { t: 'listFolder', sessionId: 's1', folder: '' });
    assert.deepEqual(parseClientMessage({ t: 'readFile', sessionId: 's1', path: 'src/a.ts' }), { t: 'readFile', sessionId: 's1', path: 'src/a.ts' });
    for (const bad of ['../a', 'src/../../a', '/etc/passwd', 'a\\b', '']) assert.equal(parseClientMessage({ t: 'readFile', sessionId: 's1', path: bad }), null, bad);
    assert.equal(parseClientMessage({ t: 'fileAction', sessionId: 's1', action: { kind: 'rename', path: 'a', name: '../b' } }), null);
    assert.equal(parseClientMessage({ t: 'writeFile', sessionId: 's1', path: 'a', text: 'x', version: 'nope' }), null);
  });
});
