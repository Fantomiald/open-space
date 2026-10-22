import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { ATTACHMENT_NAME, bundlePage, copyAttachment, readBundle, sweepAttachments } from './attachments.ts';

const base = mkdtempSync(path.join(os.tmpdir(), 'office-attachments-'));
after(() => rmSync(base, { recursive: true, force: true }));

describe('attachments', () => {
  it('keeps a copy of a file a session sent, named by its content, once', () => {
    const source = path.join(base, 'Shot.JPEG');
    writeFileSync(source, 'picture');
    const folder = path.join(base, 'kept');
    const name = copyAttachment(folder, source);
    assert.ok(name && ATTACHMENT_NAME.test(name) && name.endsWith('.jpg'));
    assert.equal(copyAttachment(folder, source), name, 'the same file twice is the same copy');
    writeFileSync(source, 'changed');
    assert.equal(readFileSync(path.join(folder, name), 'utf8'), 'picture', 'the copy stays as it was sent');
    writeFileSync(path.join(base, 'notes'), 'x');
    assert.match(copyAttachment(folder, path.join(base, 'notes')) ?? '', /\.bin$/);
    assert.equal(copyAttachment(folder, path.join(base, 'missing.png')), null);
    assert.equal(copyAttachment(folder, base), null, 'not a folder');
  });

  it('bundles a page with the files it loads, by the path the page names them with', async () => {
    const folder = path.join(base, 'bundled');
    writeFileSync(path.join(base, 'cover.png'), 'cover');
    const bundle = bundlePage(folder, `${'d'.repeat(64)}.html`, { 'img/cover.png': path.join(base, 'cover.png'), '_blob/0a1b': path.join(base, 'missing.jpg') }) ?? '';
    assert.ok(bundle.endsWith('.bundle') && ATTACHMENT_NAME.test(bundle));
    const read = await readBundle(folder, bundle.slice(0, 64));
    assert.equal(read?.page, `${'d'.repeat(64)}.html`);
    assert.deepEqual(Object.keys(read?.files ?? {}), ['img/cover.png'], 'a file that cannot be read is left out');
    assert.equal(readFileSync(path.join(folder, read?.files['img/cover.png'] ?? ''), 'utf8'), 'cover');
    assert.equal(bundlePage(folder, 'page.html', { 'a.png': path.join(base, 'missing.png') }), null, 'no file, no bundle');
    assert.equal(await readBundle(folder, 'e'.repeat(64)), null);
  });

  it('removes the stored files no log names any more, but not the ones just stored', async () => {
    const folder = path.join(base, 'swept');
    const logs = path.join(base, 'logs');
    mkdirSync(folder, { recursive: true });
    mkdirSync(logs, { recursive: true });
    const [kept, forgotten, fresh] = ['a', 'b', 'c'].map((letter) => `${letter.repeat(64)}.png`);
    const hourAgo = (Date.now() - 2 * 60 * 60 * 1000) / 1000;
    for (const name of [kept, forgotten, fresh]) writeFileSync(path.join(folder, name), name);
    for (const name of [kept, forgotten]) utimesSync(path.join(folder, name), hourAgo, hourAgo);
    writeFileSync(path.join(folder, 'notes.txt'), 'not ours');
    utimesSync(path.join(folder, 'notes.txt'), hourAgo, hourAgo);
    writeFileSync(path.join(logs, 's1.jsonl'), `${JSON.stringify({ seq: 1, at: 1, ev: { k: 'start', text: 'look', images: [kept] } })}\n`);
    assert.equal(await sweepAttachments(folder, logs), 1);
    assert.deepEqual([kept, forgotten, fresh, 'notes.txt'].map((name) => existsSync(path.join(folder, name))), [true, false, true, true]);
    writeFileSync(path.join(base, 'shot.png'), 'shot');
    const bundle = bundlePage(folder, kept, { 'shot.png': path.join(base, 'shot.png') }) ?? '';
    const shot = (await readBundle(folder, bundle.slice(0, 64)))?.files['shot.png'] ?? '';
    for (const name of [bundle, shot]) utimesSync(path.join(folder, name), hourAgo, hourAgo);
    writeFileSync(path.join(logs, 's2.jsonl'), `${JSON.stringify({ seq: 1, at: 1, ev: { k: 'artifact', bundle } })}\n`);
    assert.equal(await sweepAttachments(folder, logs), 0, 'the files a kept bundle names are kept');
    assert.equal(await sweepAttachments(path.join(base, 'none'), logs), 0, 'no folder yet');
  });
});
