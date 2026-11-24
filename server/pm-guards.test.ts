import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import type { SessionInfo, WorktreeInfo } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import { actsAsPm, workerOptions } from './pm-guards.ts';
import { newSessionInfo } from './session.ts';

const base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-pm-guards-')));
after(() => rmSync(base, { recursive: true, force: true }));
const root = path.join(base, 'root');
const app = path.join(root, 'app');
const other = path.join(root, 'other');
const outside = path.join(base, 'outside');
for (const folder of [app, other, outside]) mkdirSync(folder, { recursive: true });

const info = (fields: Partial<SessionInfo> = {}): SessionInfo => ({
  ...newSessionInfo({ id: 'pm-1', name: 'Lead', cwd: app, model: '', permissionMode: 'plan' }, 1), permissions: [], lastSeq: 1, pm: true, ...fields,
});
const settings = { roots: [root], model: 'sonnet', effort: 'medium' as const };

describe('who gets the pm_* tools', () => {
  it('a PM only, never a trigger\'s run nor a session of a folder not trusted, and only while the setting is on', () => {
    const cases: [SessionInfo | undefined, boolean, boolean][] = [
      [info(), true, true],
      [info(), false, false],
      [info({ pm: undefined }), true, false],
      [info({ trigger: { id: 't1', name: 'Nightly' } }), true, false],
      [info({ untrusted: true }), true, false],
      [undefined, true, false],
    ];
    for (const [session, enabled, expected] of cases) assert.equal(actsAsPm(session, enabled), expected, JSON.stringify([session?.pm, session?.trigger, session?.untrusted, enabled]));
  });
});

describe('what a PM\'s worker starts with', () => {
  it('its PM\'s permission mode, in its PM\'s folder, the main checkout when the PM works on a branch', () => {
    const options = workerOptions(info(), 'pm-1', { brief: 'Fix it.' }, settings);
    assert.deepEqual([options.cwd, options.permissionMode], [app, 'plan']);
    const onBranch = info({ cwd: path.join(app, '.claude', 'worktrees', 'os-lead'), worktree: { home: app } as WorktreeInfo });
    assert.equal(workerOptions(onBranch, 'pm-1', { brief: 'Fix it.' }, settings).cwd, app);
    assert.equal(workerOptions(info(), 'pm-1', { brief: 'Fix it.', cwd: other }, settings).cwd, other);
  });

  it('the model and effort asked, else the settings\'', () => {
    const asked = workerOptions(info(), 'pm-1', { brief: 'Fix it.', model: 'opus', effort: 'high' }, settings);
    assert.deepEqual([asked.model, asked.effort], ['opus', 'high']);
    const unknownEffort = workerOptions(info(), 'pm-1', { brief: 'Fix it.', effort: 'huge' }, settings);
    assert.deepEqual([unknownEffort.model, unknownEffort.effort], ['sonnet', 'medium']);
    const none = workerOptions(info(), 'pm-1', { brief: 'Fix it.' }, { roots: [root], model: '', effort: '' });
    assert.deepEqual([none.model, none.effort], [undefined, undefined], 'Claude Code\'s defaults');
  });

  it('refuses a PM gone, a folder outside the allowed roots, a model that is no model\'s name', () => {
    const refused: [SessionInfo | undefined, Parameters<typeof workerOptions>[2], string][] = [
      [undefined, { brief: 'Fix it.' }, st.triggers.mcp.noSession('pm-1')],
      [info(), { brief: 'Fix it.', cwd: outside }, st.sessions.outsideRoots],
      [info(), { brief: 'Fix it.', cwd: 'relative/app' }, st.sessions.outsideRoots],
      [info(), { brief: 'Fix it.', model: 'opus; rm -rf /' }, st.triggers.errors.model],
    ];
    for (const [lead, ask, message] of refused) assert.throws(() => workerOptions(lead, 'pm-1', ask, settings), { message }, JSON.stringify(ask));
  });
});
