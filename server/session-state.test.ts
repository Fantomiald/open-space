import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SessionState } from '../shared/protocol.ts';
import { initialContext, reduce, type MachineContext, type MachineInput } from './session-state.ts';

const states = (inputs: MachineInput[], start: MachineContext = initialContext()) => {
  const seen: SessionState[] = [];
  inputs.reduce((context, input) => { const next = reduce(context, input); seen.push(next.state); return next; }, start);
  return seen;
};
const run = (inputs: MachineInput[], start: MachineContext = initialContext()) => inputs.reduce(reduce, start);

describe('session state machine', () => {
  it('follows the nominal path: starting, work, wait', () => {
    assert.deepEqual(states([{ type: 'spawn' }, { type: 'init' }, { type: 'turn_result' }]), ['starting', 'work', 'wait']);
  });

  it('goes work -> perm -> work -> wait around a permission', () => {
    assert.deepEqual(
      states([{ type: 'permission_requested' }, { type: 'permission_resolved', remaining: 0 }, { type: 'turn_result' }], run([{ type: 'spawn' }, { type: 'init' }])),
      ['perm', 'work', 'wait'],
    );
  });

  it('stays in perm while other requests remain', () => {
    const asked = run([{ type: 'spawn' }, { type: 'init' }, { type: 'permission_requested' }, { type: 'permission_requested' }]);
    assert.equal(reduce(asked, { type: 'permission_resolved', remaining: 1 }).state, 'perm');
    assert.equal(reduce(asked, { type: 'permission_resolved', remaining: 0 }).state, 'work');
  });

  it('a turn result always means waiting, even with a message queued (its first output wakes the session up again)', () => {
    const working = run([{ type: 'spawn' }, { type: 'init' }, { type: 'send' }]);
    assert.deepEqual(states([{ type: 'turn_result' }, { type: 'activity' }, { type: 'turn_result' }], working), ['wait', 'work', 'wait']);
  });

  it('a turn result leaves perm too (requests never answered: interrupt, cancel)', () => {
    assert.equal(run([{ type: 'spawn' }, { type: 'init' }, { type: 'permission_requested' }, { type: 'turn_result' }]).state, 'wait');
  });

  it('a message to a waiting session with a live process starts work directly', () => {
    assert.equal(run([{ type: 'send' }]).state, 'work');
  });

  it('ignores inputs that make no sense in the current state', () => {
    const waiting = initialContext();
    assert.equal(reduce(waiting, { type: 'permission_requested' }), waiting);
    assert.equal(reduce(waiting, { type: 'permission_resolved', remaining: 0 }), waiting);
    assert.equal(reduce(waiting, { type: 'turn_result' }), waiting);
    assert.equal(reduce(waiting, { type: 'init' }), waiting);
    const working = run([{ type: 'spawn' }, { type: 'init' }]);
    assert.equal(reduce(working, { type: 'spawn' }), working);
    assert.equal(reduce(working, { type: 'activity' }), working);
  });

  it('maps the end of the process to closed, done or error', () => {
    const asking = run([{ type: 'spawn' }, { type: 'init' }, { type: 'permission_requested' }]);
    assert.equal(reduce(asking, { type: 'exit', reason: 'closed' }).state, 'closed');
    assert.equal(reduce(asking, { type: 'exit', reason: 'clean' }).state, 'done');
    assert.equal(reduce(asking, { type: 'exit', reason: 'failed' }).state, 'error');
  });

  it('an idle stop keeps a waiting session waiting', () => {
    const waiting = run([{ type: 'spawn' }, { type: 'init' }, { type: 'turn_result' }]);
    assert.equal(reduce(waiting, { type: 'exit', reason: 'idle' }), waiting);
  });

  it('can be restarted from done, closed and error', () => {
    for (const state of ['done', 'closed', 'error'] as const) assert.equal(reduce(initialContext(state), { type: 'spawn' }).state, 'starting');
  });

  it('closing twice changes nothing', () => {
    const closed = initialContext('closed');
    assert.equal(reduce(closed, { type: 'exit', reason: 'closed' }), closed);
  });
});
