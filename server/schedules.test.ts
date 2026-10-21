import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applySchedule, noSchedules, onceAt, pendingSchedules, scheduledUntil } from './schedules.ts';

const now = new Date(2026, 9, 21, 9, 0).getTime();
const minutes = (count: number) => count * 60_000;

describe('planned wake-ups', () => {
  it('holds a /loop wake-up until its time, clamped like Claude Code does, and drops it when the loop stops', () => {
    const planned = applySchedule(noSchedules(), { kind: 'wakeup', seconds: 1200 }, now);
    assert.equal(scheduledUntil(planned, now), now + minutes(20));
    assert.equal(scheduledUntil(applySchedule(noSchedules(), { kind: 'wakeup', seconds: 10 }, now), now), now + minutes(1));
    assert.equal(scheduledUntil(applySchedule(planned, { kind: 'wakeup_stop' }, now), now), 0);
    assert.equal(scheduledUntil(planned, now + minutes(21)), 0, 'its time is past');
  });

  it('holds a one-shot job until its pinned time, a recurring one for the 7 days it lives, and lets the recurring one go first on a delete', () => {
    let planned = applySchedule(noSchedules(), { kind: 'cron', cron: '30 14 21 10 *', recurring: false }, now);
    planned = applySchedule(planned, { kind: 'cron', cron: '*/5 * * * *', recurring: true }, now);
    assert.equal(pendingSchedules(planned, now), 2);
    assert.equal(scheduledUntil(planned, now), now + minutes(7 * 24 * 60));
    planned = applySchedule(planned, { kind: 'cron_delete' }, now);
    assert.equal(scheduledUntil(planned, now), new Date(2026, 9, 21, 14, 30).getTime());
  });

  it('reads the time of a one-shot job, next year when this year\'s is past, and nothing from a repeating expression', () => {
    assert.equal(onceAt('30 14 21 10 *', now), new Date(2026, 9, 21, 14, 30).getTime());
    assert.equal(onceAt('0 8 21 10 *', now), new Date(2027, 9, 21, 8, 0).getTime());
    assert.equal(onceAt('*/5 * * * *', now), null);
  });
});
