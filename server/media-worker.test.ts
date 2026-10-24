import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { MediaWorker } from './media-worker.ts';

const ECHO = `
  const rl = require('node:readline').createInterface({ input: process.stdin });
  let count = 0;
  rl.on('line', line => {
    const input = JSON.parse(line);
    if (input === 'crash') return process.exit(1);
    if (input === 'hang') return;
    if (input === 'invalid') return console.log('oops');
    setTimeout(() => console.log(JSON.stringify({ ok: input !== 'denied', value: { input, count: ++count } })), 10);
  });
`;

test('media requests reuse a process and preserve rapid command order and Unicode', async () => {
  let starts = 0;
  const worker = new MediaWorker(() => { starts++; return spawn(process.execPath, ['-e', ECHO]); });
  try {
    const inputs = ['Été "quoted"\nline', 'toggle', 'next', 'previous'];
    const values = await Promise.all(inputs.map((input) => worker.request(input)));
    assert.equal(starts, 1);
    assert.deepEqual(values, inputs.map((input, index) => ({ input, count: index + 1 })));
    await assert.rejects(worker.request('denied'), /request failed/);
    assert.deepEqual(await worker.request('read'), { input: 'read', count: 6 });
    assert.equal(starts, 1, 'a refused command does not restart the worker');
  } finally { worker.close(); }
});

test('crashes reject queued commands without replay, and the next request restarts', async () => {
  let starts = 0;
  const worker = new MediaWorker(() => { starts++; return spawn(process.execPath, ['-e', ECHO]); });
  try {
    const results = await Promise.allSettled([worker.request('crash'), worker.request('toggle')]);
    assert.ok(results.every((result) => result.status === 'rejected'));
    assert.deepEqual(await worker.request('read'), { input: 'read', count: 1 });
    assert.equal(starts, 2);
    await assert.rejects(worker.request('invalid'), /Invalid media response/);
    assert.deepEqual(await worker.request('read'), { input: 'read', count: 1 });
  } finally { worker.close(); }
});

test('a hung request times out; queued work is bounded and never replayed', async () => {
  const worker = new MediaWorker(() => spawn(process.execPath, ['-e', ECHO]), 500);
  try {
    const results = await Promise.allSettled(Array.from({ length: 11 }, (_, index) => worker.request(index === 0 ? 'hang' : 'toggle')));
    assert.ok(results.every((result) => result.status === 'rejected'));
    assert.ok(results.some((result) => result.status === 'rejected' && /busy/.test(result.reason.message)));
    assert.deepEqual(await worker.request('read'), { input: 'read', count: 1 });
  } finally { worker.close(); }
});

test('idle workers stop and restart lazily', async () => {
  let starts = 0;
  const worker = new MediaWorker(() => { starts++; return spawn(process.execPath, ['-e', ECHO]); }, 2000, 30);
  try {
    await worker.request('read');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(await worker.request('read'), { input: 'read', count: 1 });
    assert.equal(starts, 2);
  } finally { worker.close(); }
});
