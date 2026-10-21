import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SessionInfo } from './protocol.ts';
import { busySessions } from './app-update.ts';

const session = (extra: Partial<SessionInfo>): SessionInfo => ({
  id: 's', name: 'Lina', cwd: '/w', model: '', activeModel: '', permissionMode: 'auto', state: 'wait', stateSince: 0, createdAt: 0, turns: 1,
  permissions: [], subagents: [], command: '', lastMessage: '', resumable: true, lastSeq: 1, ...extra,
});

describe('restarting the app on a new Open Space', () => {
  it('finds the sessions with a turn under way', () => {
    assert.deepEqual(busySessions([session({}), session({ state: 'closed' }), session({ state: 'error' })]), []);
    for (const state of ['starting', 'work', 'perm'] as const) assert.deepEqual(busySessions([session({}), session({ id: 'b', state })]).map((one) => one.id), ['b'], state);
  });

  it('counts the sub-agents, the background commands and the planned wake-ups as work too', () => {
    assert.equal(busySessions([session({ subagents: [{ id: 't1', name: 'Bob', type: 'Explore' }] })]).length, 1);
    assert.equal(busySessions([session({ background: [{ id: 'b1', description: 'npm run dev' }] })]).length, 1);
    assert.equal(busySessions([session({ scheduled: 1 })]).length, 1);
  });
});
