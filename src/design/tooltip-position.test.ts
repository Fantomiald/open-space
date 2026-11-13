import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeTooltip } from './tooltip-position.ts';

const screen = { width: 1000, height: 800 };
const bubble = { width: 100, height: 30 };

test('a tooltip goes under its anchor, centred on it', () => {
  assert.deepEqual(placeTooltip({ left: 400, top: 10, width: 40, height: 30 }, bubble, screen, 6, 8), { left: 370, top: 46, side: 'below' });
});

test('a tooltip goes above its anchor when there is no room below', () => {
  assert.deepEqual(placeTooltip({ left: 400, top: 750, width: 40, height: 30 }, bubble, screen, 6, 8), { left: 370, top: 714, side: 'above' });
});

test('a tooltip that only just fits below stays below', () => {
  assert.deepEqual(placeTooltip({ left: 400, top: 726, width: 40, height: 30 }, bubble, screen, 6, 8), { left: 370, top: 762, side: 'below' });
  assert.equal(placeTooltip({ left: 400, top: 727, width: 40, height: 30 }, bubble, screen, 6, 8).side, 'above');
});

test('a tooltip is pushed back inside the window at its left and right edges', () => {
  assert.equal(placeTooltip({ left: 0, top: 10, width: 20, height: 20 }, bubble, screen, 6, 8).left, 8);
  assert.equal(placeTooltip({ left: 980, top: 10, width: 20, height: 20 }, bubble, screen, 6, 8).left, 892);
});

test('a tooltip wider than the window starts at its margin', () => {
  assert.equal(placeTooltip({ left: 50, top: 10, width: 20, height: 20 }, { width: 400, height: 30 }, { width: 300, height: 800 }, 6, 8).left, 8);
});

test('with room on neither side, a tooltip takes the roomier one and stays inside the window', () => {
  const tall = { width: 100, height: 500 };
  assert.deepEqual(placeTooltip({ left: 400, top: 380, width: 40, height: 30 }, tall, screen, 6, 8), { left: 370, top: 292, side: 'below' });
  assert.deepEqual(placeTooltip({ left: 400, top: 420, width: 40, height: 30 }, tall, screen, 6, 8), { left: 370, top: 8, side: 'above' });
  const taller = placeTooltip({ left: 400, top: 380, width: 40, height: 30 }, { width: 100, height: 900 }, screen, 6, 8);
  assert.equal(taller.top, 8);
});
