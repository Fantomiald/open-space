import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SessionInfo } from '../../shared/protocol.ts';
import { listGroups } from './list-groups.ts';

const session = (id: string, cwd: string, extra: Partial<SessionInfo> = {}) =>
  ({ id, name: id, cwd, state: 'wait', turns: 1, permissions: [], subagents: [], createdAt: 0, stateSince: 0, lastSeq: 1, ...extra }) as unknown as SessionInfo;

const keys = (groups: ReturnType<typeof listGroups>) => groups.map((group) => [group.key, group.sessions.map((each) => each.id)]);

describe('the list in groups', () => {
  const unseen = session('a', '/code/app', { tags: ['pipou'] });
  const read = session('b', '/code/app', { tags: ['pipou'], stateSince: 5 });
  const other = session('c', '/code/site', { tags: ['blog'] });
  const resting = session('d', '/code/site', { resting: true } as Partial<SessionInfo>);
  const seen = { b: 1, c: 1, d: 1 };

  it('by state: what waits for the user, then who is ready, then who rests', () => {
    assert.deepEqual(keys(listGroups([unseen, read, other, resting], seen, 'state')), [['waiting', ['a']], ['ready', ['b', 'c']], ['resting', ['d']]]);
  });

  it('by project: what waits first, the states in order inside', () => {
    const byProject = listGroups([unseen, read, other, resting], seen, 'project');
    assert.deepEqual(keys(byProject), [['project:/code/app', ['a', 'b']], ['project:/code/site', ['c', 'd']]]);
    assert.deepEqual(byProject.map((group) => group.waiting), [1, 0]);
    assert.deepEqual(byProject.map((group) => group.folder), ['/code/app', '/code/site']);
  });

  it('keeps the session just opened where it was, until another is opened', () => {
    const first = session('e', '/code/app');
    const opened = { ...unseen, stateSince: 9 };
    // seen now: it would move to the ready ones
    assert.deepEqual(keys(listGroups([first, opened], { a: 1 }, 'state'))[0], ['waiting', ['e']]);
    assert.deepEqual(keys(listGroups([first, opened], { a: 1 }, 'state', { id: 'a', index: 0 })), [['waiting', ['a', 'e']]]);
  });
});
