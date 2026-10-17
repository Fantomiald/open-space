import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { SessionLog } from './session-log.ts';

describe('SessionLog', () => {
  it('reports a write error, then reopens the file on the next append', async () => {
    const base = mkdtempSync(path.join(os.tmpdir(), 'office-log-'));
    const folder = path.join(base, 'logs');
    const errors: Error[] = [];
    const log = new SessionLog(path.join(folder, 's.jsonl'), (error) => errors.push(error));
    log.append(1, { k: 'start', text: 'lost' }); // the folder does not exist yet: the write fails
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(errors.length, 1);
    mkdirSync(folder);
    log.append(2, { k: 'start', text: 'kept' });
    await log.close();
    const lines = readFileSync(path.join(folder, 's.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(lines.map((line) => line.ev.text), ['kept']);
    assert.equal(lines[0].seq, 2);
    rmSync(base, { recursive: true, force: true });
  });
});
