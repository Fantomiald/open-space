import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_TOKENS } from '../../shared/usage.ts';
import { costsForMods, isModData, MOD_HEAD, modBox, NOT_PLACED, openingSpots, resizeMod } from './mods.ts';

const page = { width: 1440, height: 900 };

describe('mod windows', () => {
  it('opens at its own size under the header, the next ones beside it, then on a new row', () => {
    const spots = openingSpots([{ width: 380, height: 320 }, { width: 420, height: 200 }, { width: 380, height: 300 }, { width: 380, height: 300 }], page);
    assert.deepEqual(spots.slice(0, 3), [{ left: 12, top: 72 }, { left: 404, top: 72 }, { left: 836, top: 72 }]);
    assert.deepEqual(spots[3], { left: 12, top: 72 + 320 + MOD_HEAD + 12 }, 'below the tallest of the row');
    assert.deepEqual(modBox({ width: 380, height: 320 }, NOT_PLACED, spots[0], page), { left: 12, top: 72, width: 380, height: 320 + MOD_HEAD });
    const huge = modBox({ width: 960, height: 900 }, NOT_PLACED, { left: 12, top: 72 }, { width: 500, height: 400 });
    assert.ok(huge.width <= 500 && huge.height <= 400 && huge.left >= 0 && huge.top >= 0);
  });

  it('stays where the user left it, at the size they gave it', () => {
    const box = modBox({ width: 380, height: 320 }, { left: 600, top: 300, size: { width: 500, height: 200 }, folded: false }, { left: 12, top: 72 }, page);
    assert.deepEqual(box, { left: 600, top: 300, width: 500, height: 200 + MOD_HEAD });
  });

  it('is never taller than its content, even at the size the user gave it or pulled to', () => {
    const placed = { left: 600, top: 300, size: { width: 500, height: 400 }, folded: false };
    assert.equal(modBox({ width: 380, height: 320 }, NOT_PLACED, { left: 12, top: 72 }, page, 180).height, 180 + MOD_HEAD);
    assert.equal(modBox({ width: 380, height: 320 }, placed, { left: 12, top: 72 }, page, 250).height, 250 + MOD_HEAD);
    assert.equal(modBox({ width: 380, height: 320 }, NOT_PLACED, { left: 12, top: 72 }, page, 60).height, 60 + MOD_HEAD, 'below the smallest size');
    assert.equal(resizeMod({ left: 100, top: 100, width: 400, height: 300 }, 's', 0, 200, page, 280).height, 280 + MOD_HEAD);
  });

  it('is resized from any side, the opposite one staying, never below its smallest size', () => {
    const start = { left: 100, top: 100, width: 400, height: 300 };
    assert.deepEqual(resizeMod(start, 'se', 50, 40, page), { left: 100, top: 100, width: 450, height: 340 });
    const fromLeft = resizeMod(start, 'w', -60, 0, page);
    assert.equal(fromLeft.left + fromLeft.width, 500, 'its right side stays');
    const tiny = resizeMod(start, 'nw', 1000, 1000, page);
    assert.ok(tiny.width >= 240 && tiny.height >= 120 + MOD_HEAD);
    assert.equal(tiny.left + tiny.width, 500);
    assert.equal(tiny.top + tiny.height, 400);
  });

  it('only gives a mod what it may ask for', () => {
    for (const name of ['sessions', 'quota', 'costs']) assert.ok(isModData(name));
    for (const name of ['secrets', 'preferences', '__proto__', 1]) assert.ok(!isModData(name));
  });

  it('adds up the costs by day, model and project, every day there even an empty one', () => {
    const now = new Date(2026, 10, 10, 12).getTime();
    const tokens = { ...NO_TOKENS, output: 1_000_000 };
    const report = {
      generatedAt: now, scanning: false, hours: [], conversations: [],
      models: [{ day: '2026-11-10', model: 'claude-opus-5-5', tokens, turns: 3 }, { day: '2026-11-09', model: 'claude-haiku-5-5', tokens, turns: 1 }, { day: '2026-01-01', model: 'claude-opus-5-5', tokens, turns: 9 }],
      projects: [{ day: '2026-11-10', project: '/Users/me/Futur/office', model: 'claude-opus-5-5', tokens }, { day: '2026-11-09', project: '/Users/me/Futur/shop', model: 'claude-haiku-5-5', tokens }],
    };
    const costs = costsForMods(report, now, 7);
    assert.ok(costs);
    assert.equal(costs.days.length, 7);
    assert.equal(costs.days.at(-1)?.day, '2026-11-10');
    assert.equal(costs.today, 20);
    assert.equal(costs.total, 20.5, 'the day of January is not among the last 7');
    assert.deepEqual(costs.projects, [{ name: 'office', usd: 20 }, { name: 'shop', usd: 0.5 }]);
    assert.equal(costs.models[0].usd, 20);
    assert.equal(costsForMods(null, now), null);
  });
});
