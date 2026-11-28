import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PANEL_MARGIN, PANEL_MIN, placePanel, resizePanel } from './panel.ts';

const screen = { width: 1600, height: 1000 };
const box = { left: 300, top: 200, width: 900, height: 600 };

describe('a dialog placed by hand', () => {
  it('stays whole within the window when carried past an edge', () => {
    assert.deepEqual(placePanel({ ...box, left: -400, top: 900 }, screen), { left: PANEL_MARGIN, top: 1000 - PANEL_MARGIN - 600, width: 900, height: 600 });
  });

  it('shrinks to a smaller window, and no further than its smallest size', () => {
    assert.deepEqual(placePanel(box, { width: 700, height: 500 }), { left: PANEL_MARGIN, top: PANEL_MARGIN, width: 700 - 2 * PANEL_MARGIN, height: 500 - 2 * PANEL_MARGIN });
    assert.deepEqual(placePanel({ ...box, width: 100, height: 100 }, screen), { ...box, width: PANEL_MIN.width, height: PANEL_MIN.height });
  });

  it('keeps the opposite corner when a corner is pulled', () => {
    assert.deepEqual(resizePanel(box, 'nw', -100, -50, screen), { left: 200, top: 150, width: 1000, height: 650 });
    assert.deepEqual(resizePanel(box, 'se', 100, 50, screen), { left: 300, top: 200, width: 1000, height: 650 });
  });

  it('stops at its smallest size without moving the side that stays', () => {
    assert.deepEqual(resizePanel(box, 'w', 800, 0, screen), { left: 1200 - PANEL_MIN.width, top: 200, width: PANEL_MIN.width, height: 600 });
  });

  it('stops at the edge of the window', () => {
    assert.deepEqual(resizePanel(box, 'e', 2000, 0, screen), { left: 300, top: 200, width: 1600 - PANEL_MARGIN - 300, height: 600 });
    assert.deepEqual(resizePanel(box, 'n', 0, -900, screen), { left: 300, top: PANEL_MARGIN, width: 900, height: 800 - PANEL_MARGIN });
  });
});
