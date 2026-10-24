import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SessionInfo } from '../../shared/protocol.ts';
import { activeProject, inProject, projectOf, projectsOf } from './projects.ts';

const session = (id: string, cwd: string, extra: Partial<SessionInfo> = {}) => ({ id, cwd, state: 'wait', turns: 0, permissions: [], ...extra }) as unknown as SessionInfo;

describe('projects', () => {
  it('counts a session on a branch of its own in the folder it was asked for', () => {
    const branch = session('b', '/code/app/.claude/worktrees/x', { worktree: { home: '/code/app' } as SessionInfo['worktree'] });
    assert.equal(projectOf(branch), '/code/app');
    assert.deepEqual(projectsOf([session('a', '/code/app'), branch], {}).map(({ name, count }) => [name, count]), [['app', 2]]);
  });

  it('sorts by name, tells same-named folders apart and flags the one waiting for the user', () => {
    const projects = projectsOf([session('a', '/web/app'), session('b', '/mobile/app', { state: 'perm', permissions: [{}] } as unknown as Partial<SessionInfo>), session('c', '/code/blog')], {});
    assert.deepEqual(projects.map(({ name, waiting }) => [name, waiting]), [['blog', false], ['mobile/app', true], ['web/app', false]]);
  });

  it('keeps every session in sight with no project picked, or only one project there', () => {
    const projects = projectsOf([session('a', '/code/app')], {});
    assert.equal(activeProject(projects, '/code/app'), '');
    assert.equal(activeProject(projectsOf([session('a', '/code/app'), session('b', '/code/blog')], {}), '/code/gone'), '');
    assert.equal(inProject(session('a', '/code/app'), ''), true);
    assert.equal(inProject(session('a', '/code/app'), '/code/blog'), false);
  });
});
