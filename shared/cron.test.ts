import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cronMatches, isCron, nextCronRun, parseCron } from './cron.ts';

const at = (year: number, month: number, day: number, hour = 0, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime();

describe('cron expressions', () => {
  it('reads five fields, and refuses what crontab would', () => {
    for (const good of ['* * * * *', '0 8 * * *', '*/15 9-18 * * 1-5', '0 0 1,15 * *', '5/10 * * * 7']) assert.ok(isCron(good), good);
    for (const bad of ['', '* * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8', '*/0 * * * *', '5-1 * * * *', 'a * * * *', '* * * * * *']) assert.ok(!isCron(bad), bad);
  });

  it('matches the minutes it names, in local time', () => {
    const cron = parseCron('0 8 * * 1-5')!;
    assert.ok(cronMatches(cron, at(2026, 11, 9, 8, 0)), 'a Monday at 8:00');
    assert.ok(!cronMatches(cron, at(2026, 11, 9, 8, 1)));
    assert.ok(!cronMatches(cron, at(2026, 11, 8, 8, 0)), 'a Sunday');
    assert.ok(cronMatches(parseCron('* * * * 7')!, at(2026, 11, 8, 3, 3)), '7 is Sunday too');
  });

  it('runs a day matching either day field when both are restricted (crontab)', () => {
    const cron = parseCron('0 0 13 * 5')!;
    assert.ok(cronMatches(cron, at(2026, 11, 13)), 'the 13th');
    assert.ok(cronMatches(cron, at(2026, 11, 20)), 'a Friday');
    assert.ok(!cronMatches(cron, at(2026, 11, 19)));
  });

  it('finds the next run, and none for a day that never comes', () => {
    assert.equal(nextCronRun(parseCron('0 8 * * *')!, at(2026, 11, 9, 7, 59, )), at(2026, 11, 9, 8, 0));
    assert.equal(nextCronRun(parseCron('0 8 * * *')!, at(2026, 11, 9, 8, 0)), at(2026, 11, 10, 8, 0));
    assert.equal(nextCronRun(parseCron('30 6 1 1 *')!, at(2026, 11, 9)), at(2027, 1, 1, 6, 30));
    assert.equal(nextCronRun(parseCron('*/20 * * * *')!, at(2026, 11, 9, 10, 41)), at(2026, 11, 9, 11, 0));
    assert.equal(nextCronRun(parseCron('0 0 31 2 *')!, at(2026, 11, 9)), null);
  });
});
