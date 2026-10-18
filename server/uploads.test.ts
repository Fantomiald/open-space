import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { saveUpload, sweepUploads, UPLOAD_GRACE_MS, uploadName, uploadPath } from './uploads.ts';

const base = mkdtempSync(path.join(os.tmpdir(), 'office-uploads-'));
after(() => rmSync(base, { recursive: true, force: true }));

describe('uploads', () => {
  it('keeps a file under its own name, made safe, in a folder named by its content', () => {
    assert.equal(uploadName('../../etc/passwd'), 'passwd');
    assert.equal(uploadName('C:\\Users\\me\\report.pdf'), 'report.pdf');
    assert.equal(uploadName('..hidden'), 'hidden');
    assert.equal(uploadName(''), 'file');
    const folder = path.join(base, 'kept');
    const id = saveUpload(folder, 'archive.zip', Buffer.from('PK'));
    assert.match(id, /^[0-9a-f]{16}\/archive\.zip$/);
    assert.equal(saveUpload(folder, 'archive.zip', Buffer.from('PK')), id, 'the same file twice is the same copy');
    assert.equal(uploadPath(folder, id), path.join(folder, id));
    for (const forged of ['0123456789abcdef/../secret', '../x', 'ffffffffffffffff/missing.zip', `${id.split('/')[0]}/..`]) assert.equal(uploadPath(folder, forged), null, forged);
  });

  it('removes the uploads no log names any more, but not the ones just sent', async () => {
    const folder = path.join(base, 'swept');
    const logs = path.join(base, 'logs');
    mkdirSync(logs, { recursive: true });
    const [kept, forgotten, fresh] = ['keep.zip', 'old.zip', 'new.zip'].map((name, index) => saveUpload(folder, name, Buffer.from(String(index))));
    const longAgo = (Date.now() - 2 * UPLOAD_GRACE_MS) / 1000;
    for (const id of [kept, forgotten, fresh]) utimesSync(path.join(folder, id.split('/')[0]), longAgo, longAgo);
    // attached again (still waiting in a field): its grace starts over
    saveUpload(folder, 'new.zip', Buffer.from('2'));
    writeFileSync(path.join(logs, 's1.jsonl'), `${JSON.stringify({ seq: 1, at: 1, ev: { k: 'start', text: '', files: [{ id: kept, name: 'keep.zip', size: 1 }] } })}\n`);
    assert.equal(await sweepUploads(folder, logs), 1);
    assert.deepEqual([kept, forgotten, fresh].map((id) => existsSync(path.join(folder, id))), [true, false, true]);
  });
});
