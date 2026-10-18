import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { noteFileName, noteTitle } from '../shared/journal.ts';
import { listNotes, locateNote, readNote, versionOf, writeNote } from './journal.ts';
import { parseClientMessage } from './messages.ts';
import { parsePreferences } from './settings.ts';

let base: string;
let folder: string;

before(() => {
  base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-journal-')));
  folder = path.join(base, 'Journal');
  mkdirSync(path.join(folder, 'archive'), { recursive: true });
  mkdirSync(path.join(base, 'outside'));
  writeFileSync(path.join(folder, 'atlas.md'), '# Atlas\n');
  writeFileSync(path.join(folder, 'meadow.md'), '# Meadow\n');
  writeFileSync(path.join(folder, 'todo.txt'), 'not a note');
  writeFileSync(path.join(folder, '.hidden.md'), 'hidden');
  writeFileSync(path.join(folder, 'archive', 'old.md'), 'in a sub-folder');
  writeFileSync(path.join(base, 'outside', 'secret.md'), 'secret');
  symlinkSync(path.join(base, 'outside', 'secret.md'), path.join(folder, 'link.md'));
  symlinkSync(path.join(base, 'outside', 'nowhere.md'), path.join(folder, 'dangling.md'));
});

after(() => rmSync(base, { recursive: true, force: true }));

describe('the whiteboard notes', () => {
  it('lists the Markdown files right inside the folder, not hidden ones, sub-folders nor links', async () => {
    assert.deepEqual((await listNotes(folder)).map((file) => file.name), ['atlas.md', 'meadow.md']);
    assert.deepEqual(await listNotes(path.join(base, 'missing')), [], 'no folder yet: no notes');
  });

  it('reads a note with its version, and nothing outside the folder', async () => {
    const note = await readNote(folder, 'atlas.md');
    assert.equal(note.text, '# Atlas\n');
    assert.equal(note.version, versionOf('# Atlas\n'));
    for (const name of ['../outside/secret.md', 'archive/old.md', '.hidden.md', 'link.md', 'todo.txt', 'missing.md']) {
      await assert.rejects(readNote(folder, name), `${name} refused`);
    }
    assert.equal(locateNote(folder, 'dangling.md'), null, 'a link leading nowhere cannot be written through either');
  });

  it('saves a note made from its current version, and refuses one made before a session wrote to it', async () => {
    const { version } = await readNote(folder, 'meadow.md');
    const first = await writeNote(folder, 'meadow.md', '# Meadow\n- one\n', version);
    assert.equal(first.saved, true);
    assert.equal(first.note.version, versionOf('# Meadow\n- one\n'));
    // a session writes to it meanwhile: the page's next save, made from the version it had, is refused with the new text
    writeFileSync(path.join(folder, 'meadow.md'), '# Meadow\n- from Claude\n');
    const late = await writeNote(folder, 'meadow.md', '# Meadow\n- one\n- two\n', first.note.version);
    assert.equal(late.saved, false);
    assert.equal(late.note.text, '# Meadow\n- from Claude\n');
    assert.equal(readFileSync(path.join(folder, 'meadow.md'), 'utf8'), '# Meadow\n- from Claude\n', 'not overwritten');
  });

  it('creates a note and its folder, but never over an existing one', async () => {
    const fresh = path.join(base, 'New Journal');
    const created = await writeNote(fresh, 'sova.md', '# Sova\n', null);
    assert.equal(created.saved, true);
    assert.equal(readFileSync(path.join(fresh, 'sova.md'), 'utf8'), '# Sova\n');
    const again = await writeNote(fresh, 'sova.md', 'other', null);
    assert.equal(again.saved, false);
    assert.equal(again.note.text, '# Sova\n');
    await assert.rejects(writeNote(folder, 'link.md', 'x', null), 'not through a link');
  });

  it('names notes the way the server checks them', () => {
    assert.equal(noteFileName(' meadow '), 'meadow.md');
    assert.equal(noteFileName('Daily Thai.md'), 'Daily Thai.md');
    for (const title of ['', '../x', 'a/b', '.hidden', 'é']) assert.equal(noteFileName(title), null, title);
    assert.equal(noteTitle('atlas.md'), 'atlas');
  });

  it('takes only plain names and a version or null from the page', () => {
    assert.deepEqual(parseClientMessage({ t: 'writeNote', name: 'a.md', text: 'x', version: null }), { t: 'writeNote', name: 'a.md', text: 'x', version: null });
    assert.deepEqual(parseClientMessage({ t: 'readNote', name: 'atlas.md' }), { t: 'readNote', name: 'atlas.md' });
    assert.equal(parseClientMessage({ t: 'readNote', name: '../etc/passwd.md' }), null);
    assert.equal(parseClientMessage({ t: 'readNote', name: 'a/b.md' }), null);
    assert.equal(parseClientMessage({ t: 'writeNote', name: 'a.md', text: 'x' }), null, 'a version is required (null for a new note)');
    assert.equal(parseClientMessage({ t: 'writeNote', name: 'a.md', text: 'x', version: 'nope' }), null);
  });

  it('keeps the journal folder of the settings absolute, "~" being the home', () => {
    assert.deepEqual(parsePreferences({ journalFolder: '~/Journal' }, '/home/someone'), { journalFolder: '/home/someone/Journal' });
    assert.deepEqual(parsePreferences({ journalFolder: '/notes/' }, '/home/someone'), { journalFolder: '/notes' });
    assert.deepEqual(parsePreferences({ journalFolder: 'Journal' }, '/home/someone'), {});
    assert.deepEqual(parsePreferences({ journalFolder: '~other/Journal' }, '/home/someone'), {});
  });
});
