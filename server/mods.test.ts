import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import type { ModInfo } from '../shared/mods.ts';
import { modKey, Mods } from './mods.ts';

const base = mkdtempSync(path.join(os.tmpdir(), 'office-mods-'));
after(() => rmSync(base, { recursive: true, force: true }));
const kitDir = path.join(base, 'kit');
mkdirSync(kitDir);
writeFileSync(path.join(kitDir, 'GUIDE.md'), '# the rules\n');
writeFileSync(path.join(kitDir, 'starter.html'), '<!doctype html><os-loading></os-loading>\n');

async function prepared(name: string, changes: ModInfo[][] = []) {
  const mods = new Mods({ folder: path.join(base, name, 'mods'), kitDir, seenFile: path.join(base, name, 'seen.json'), secret: 'secret', origin: 'http://127.0.0.1:4848', onChange: (list) => changes.push(list), log: () => {} });
  await mods.prepare();
  after(() => mods.stop());
  return mods;
}

describe('mods folder', () => {
  it('writes the rules as the folder’s CLAUDE.md, and makes a new mod a draft from the starter', async () => {
    const changes: ModInfo[][] = [];
    const mods = await prepared('new', changes);
    const folder = path.join(base, 'new', 'mods');
    assert.equal(readFileSync(path.join(folder, 'CLAUDE.md'), 'utf8'), '# the rules\n');
    const made = mods.create('Mes ventes du jour');
    assert.equal(made.id, 'mes-ventes-jour');
    assert.equal(made.draft, true);
    assert.equal(made.url, `/mods/${modKey('secret', made.id)}/mes-ventes-jour/`);
    assert.match(readFileSync(path.join(made.folder, 'index.html'), 'utf8'), /os-loading/);
    assert.equal(readFileSync(path.join(made.folder, '.address'), 'utf8').trim(), `http://127.0.0.1:4848${made.url}`);
    assert.equal(mods.create('Mes ventes du jour').id, 'mes-ventes-jour-2');
    assert.equal(changes.at(-1)?.length, 2, 'the pages are told');
  });

  it('lists the folders with a manifest, by name', async () => {
    const mods = await prepared('list');
    const folder = path.join(base, 'list', 'mods');
    for (const [id, manifest] of [['zeta', '{"name":"Alpha"}'], ['alpha', '{"name":"Zed"}'], ['broken', '{not json']] as const) {
      mkdirSync(path.join(folder, id));
      writeFileSync(path.join(folder, id, 'mod.json'), manifest);
    }
    mkdirSync(path.join(folder, 'no-manifest'));
    mkdirSync(path.join(folder, 'Not-An-Id'));
    writeFileSync(path.join(folder, 'Not-An-Id', 'mod.json'), '{}');
    assert.deepEqual(mods.list().map((mod) => mod.name), ['Alpha', 'broken', 'Zed']);
  });

  it('serves a mod’s shown files only, never outside its folder', async () => {
    const mods = await prepared('files');
    const made = mods.create('files test');
    writeFileSync(path.join(made.folder, '.env'), 'KEY=1');
    mkdirSync(path.join(made.folder, 'data'));
    writeFileSync(path.join(made.folder, 'data', 'sales.json'), '[]');
    symlinkSync('/etc/hosts', path.join(made.folder, 'hosts'));
    assert.ok(mods.file(made.id, '')?.endsWith('index.html'));
    assert.ok(mods.file(made.id, 'data/sales.json'));
    for (const refused of ['.env', '.address', '../files-test-2/index.html', 'hosts', 'missing.js', 'data']) assert.equal(mods.file(made.id, refused), null, refused);
    assert.equal(mods.file('../x', 'index.html'), null);
  });

  it('has news when its data changes, until the user has it open', async () => {
    const mods = await prepared('seen');
    const made = mods.create('seen test');
    assert.equal(mods.list()[0].unread, false, 'no data yet');
    mkdirSync(path.join(made.folder, 'data'));
    writeFileSync(path.join(made.folder, 'data', 'today.json'), '{}');
    assert.equal(mods.list()[0].unread, true);
    await mods.markSeen(made.id);
    assert.equal(mods.list()[0].unread, false);
    const later = Date.now() / 1000 + 60;
    utimesSync(path.join(made.folder, 'data', 'today.json'), later, later);
    assert.equal(mods.list()[0].unread, true);
    // what was seen is kept across restarts
    await mods.markSeen(made.id);
    const again = await prepared('seen');
    assert.equal(again.list()[0].unread, false);
  });
});
