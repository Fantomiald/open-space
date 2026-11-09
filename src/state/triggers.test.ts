import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TriggerRun } from '../../shared/triggers.ts';
import { claudeMcpCommand, cronOf, externalMcpConfig, folderChoices, nextStart, runsOf, scheduleOf } from './triggers.ts';

describe('the triggers in the Automates panel', () => {
  it('says when a cron trigger starts next, and nothing for a webhook or a bad schedule', () => {
    const now = new Date(2026, 10, 9, 7, 30).getTime();
    assert.equal(nextStart({ kind: 'cron', cron: '0 8 * * *' }, now), new Date(2026, 10, 9, 8, 0).getTime());
    assert.equal(nextStart({ kind: 'cron', cron: '0 0 31 2 *' }, now), null);
    assert.equal(nextStart({ kind: 'cron', cron: 'nope' }, now), undefined);
    assert.equal(nextStart({ kind: 'webhook', cron: '' }, now), undefined);
  });

  it('turns a schedule picked from the list into cron and back, anything else staying a cron of its own', () => {
    assert.deepEqual(scheduleOf('0 * * * *'), { kind: 'hours', every: 1, minute: 0 });
    assert.deepEqual(scheduleOf('15 */3 * * *'), { kind: 'hours', every: 3, minute: 15 });
    assert.deepEqual(scheduleOf('0 8 * * 1-5'), { kind: 'days', days: [1, 2, 3, 4, 5], hour: 8, minute: 0 });
    assert.deepEqual(scheduleOf('30 9 * * *'), { kind: 'days', days: [0, 1, 2, 3, 4, 5, 6], hour: 9, minute: 30 });
    assert.deepEqual(scheduleOf('0 18 * * 1,3,7'), { kind: 'days', days: [0, 1, 3], hour: 18, minute: 0 });
    for (const cron of ['*/5 * * * *', '0 8 1 * *', '0 */2 * * *', '0 8-18 * * *', 'nope']) assert.deepEqual(scheduleOf(cron), { kind: 'custom' }, cron);
    assert.equal(cronOf({ kind: 'hours', every: 6, minute: 0 }), '0 */6 * * *');
    assert.equal(cronOf({ kind: 'days', days: [5, 1, 2, 3, 4], hour: 8, minute: 0 }), '0 8 * * 1-5');
    assert.equal(cronOf({ kind: 'days', days: [0, 1, 3], hour: 18, minute: 5 }), '5 18 * * 0,1,3');
    assert.equal(cronOf({ kind: 'days', days: [0, 1, 2, 3, 4, 5, 6], hour: 7, minute: 0 }), '0 7 * * *');
  });

  it('lists a trigger\'s runs, the folders to pick, and what another program pastes', () => {
    const runs: TriggerRun[] = [
      { triggerId: 'a', at: 3, source: 'cron', outcome: 'started', sessionId: 's3' },
      { triggerId: 'b', at: 2, source: 'manual', outcome: 'failed', error: 'x' },
      { triggerId: 'a', at: 1, source: 'webhook', outcome: 'skipped' },
    ];
    assert.deepEqual(runsOf(runs, 'a').map((run) => run.at), [3, 1]);
    assert.deepEqual(folderChoices([{ cwd: '/p/app' }, { cwd: '/p/app' }, { cwd: '/p/wt', worktree: {} as never }], ['/p']), ['/p', '/p/app']);
    assert.deepEqual(JSON.parse(externalMcpConfig('http://127.0.0.1:1/mcp/external/k')).mcpServers['open-space'].type, 'http');
    assert.equal(claudeMcpCommand('http://u'), 'claude mcp add --transport http open-space http://u');
  });
});
