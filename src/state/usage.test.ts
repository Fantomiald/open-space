import assert from 'node:assert/strict';
import test from 'node:test';
import { NO_TOKENS, type CostReport } from '../../shared/usage.ts';
import { byModel, byProject, daysAfter, daysUntil, mondayOf, OTHERS, perDay, rewindOf, seriesOf, slotOf, spentOn } from './usage.ts';

const million = (input: number) => ({ ...NO_TOKENS, input: input * 1_000_000 });
const report: CostReport = {
  generatedAt: 0, scanning: false,
  models: [
    { day: '2026-10-19', model: 'claude-opus-5-5', tokens: million(1), turns: 3 },
    { day: '2026-10-20', model: 'claude-opus-5-5', tokens: million(2), turns: 2 },
    { day: '2026-10-20', model: 'claude-fable-5-1', tokens: million(1), turns: 1 },
    { day: '2026-10-12', model: 'claude-haiku-5-5', tokens: million(10), turns: 9 },
  ],
  projects: [
    { day: '2026-10-20', project: '/code/a', model: 'claude-opus-5-5', tokens: million(2) },
    { day: '2026-10-20', project: '/code/b', model: 'claude-fable-5-1', tokens: million(1) },
  ],
  hours: [{ day: '2026-10-19', hour: 13, minutes: 30 }, { day: '2026-10-19', hour: 14, minutes: 20 }, { day: '2026-10-20', hour: 9, minutes: 10 }],
  conversations: [
    { id: 'x', project: '/code/a', start: 0, end: 0, minutes: 50, days: ['2026-10-19', '2026-10-20'] },
    { id: 'y', project: '/code/b', start: 0, end: 0, minutes: 10, days: ['2026-10-20'] },
    { id: 'z', project: '/code/a', start: 0, end: 0, minutes: 5, days: ['2026-10-12'] },
  ],
};

test('days run across month ends, oldest first', () => {
  assert.deepEqual(daysUntil('2026-11-02', 3), ['2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(daysAfter('2026-10-30', 3), ['2026-10-30', '2026-10-31', '2026-11-01']);
  assert.equal(mondayOf('2026-10-25'), '2026-10-19');
  assert.equal(mondayOf('2026-10-19'), '2026-10-19');
});

test('spending is priced per model and added up over the days asked for', () => {
  assert.equal(spentOn(report, ['2026-10-20']).cost, 2 * 4 + 10);
  assert.deepEqual(byModel(report, ['2026-10-19', '2026-10-20']).map((row) => [row.model, row.cost, row.turns]), [['claude-opus-5-5', 12, 5], ['claude-fable-5-1', 10, 1]]);
  assert.deepEqual(byProject(report, ['2026-10-20']).map((row) => [row.project, row.cost]), [['/code/a', 8], ['/code/b', 10]].sort((a, b) => Number(b[1]) - Number(a[1])));
});

test('a model keeps its colour whatever the period: its rank over the whole report', () => {
  const series = seriesOf(report);
  assert.deepEqual(series, ['claude-opus-5-5', 'claude-fable-5-1', 'claude-haiku-5-5']);
  assert.equal(slotOf(['a', 'b', 'c', 'd', 'e'], 'e'), OTHERS);
  const days = perDay(report, ['2026-10-19', '2026-10-20', '2026-10-21'], series);
  assert.equal(days[1].values['claude-fable-5-1'].cost, 10);
  assert.deepEqual(days[2].values, {});
});

test('the rewind tells the week: time, sessions, peak, top project and busiest day', () => {
  const rewind = rewindOf(report, '2026-10-19', seriesOf(report));
  assert.equal(rewind.minutes, 60);
  assert.equal(rewind.sessions, 2);
  assert.deepEqual(rewind.sessionsByDay.slice(0, 3), [1, 2, 0]);
  assert.deepEqual(rewind.peak, { from: 12, minutes: 50 });
  assert.deepEqual(rewind.topProject, { project: '/code/a', sessions: 1 });
  assert.deepEqual(rewind.busiestDay, { day: '2026-10-19', minutes: 50 });
  assert.equal(rewind.heatmap[0][13], 30);
  assert.equal(rewind.cost, 4 + 18);
});
