import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { ATTACHMENT_NAME, copyAttachment, sweepAttachments } from './attachments.ts';

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
    assert.equal(await sweepAttachments(path.join(base, 'none'), logs), 0, 'no folder yet');
  });
});
