import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';
import { createShellRunner } from './shell.ts';

describe('shell runner', () => {
  const run = createShellRunner({ ...process.env, SHELL: '/bin/sh' });

  it('runs a command in the folder and keeps what it wrote', async () => {
    const result = await run('echo out; echo err >&2; exit 3', tmpdir());
    assert.deepEqual([result.code, result.stdout, result.stderr, result.stopped], [3, 'out', 'err', false]);
  });

  it('stops the command and what it started when asked', async () => {
    const stop = new AbortController();
    const running = run('echo started; sleep 30 & wait', tmpdir(), stop.signal);
    setTimeout(() => stop.abort(), 200);
    const result = await running;
    assert.equal(result.stopped, true);
    assert.equal(result.timedOut, false);
    assert.equal(result.stdout, 'started');
    assert.ok(result.ms < 5000);
  });

  it('kills a command that ignores being asked to stop', async () => {
    const stop = new AbortController();
    const running = run("trap '' TERM; sleep 30", tmpdir(), stop.signal);
    setTimeout(() => stop.abort(), 200);
    const result = await running;
    assert.equal(result.stopped, true);
    assert.ok(result.ms < 8000);
  });
});
