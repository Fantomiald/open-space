import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dock, dockAt, float, modOfSlot, modSlot, modsIn, modsOnly, openSessions, sessionsIn, switchArrangement, tidyAll, unfloat, within } from './docking.ts';
import { FOCUS_TILING, ROOM_TILING } from './stack.ts';

const box = { left: 0.1, top: 0.1, width: 0.3, height: 0.4 };
const none = { boxes: {}, order: [] };

describe('mods in the grid', () => {
  it('a mod takes a slot of its own name', () => {
    assert.equal(modSlot('chiffres'), 'mod:chiffres');
    assert.equal(modOfSlot('mod:chiffres'), 'chiffres');
    assert.equal(modOfSlot('s1'), null);
  });
  it('tells the sessions from the mods', () => {
    const columns = [['s1', 'mod:a'], ['s2']];
    assert.deepEqual(sessionsIn(columns), ['s1', 's2']);
    assert.deepEqual(modsIn(columns), ['a']);
    assert.deepEqual(modsOnly(columns), [['mod:a']]);
  });
});

describe('the sessions open', () => {
  it('the docked ones, then the floating ones from back to front', () => {
    assert.deepEqual(openSessions([['s1', 'mod:a']], { boxes: { s3: box, s2: box }, order: ['s2', 's3'] }), ['s1', 's2', 's3']);
  });
  it('a box without an order still counts', () => assert.deepEqual(openSessions([], { boxes: { s2: box }, order: [] }), ['s2']));
});

describe('docking a window', () => {
  it('takes the first place with room when not told where', () => {
    assert.deepEqual(dock([['a']], 'b', null, 2, ROOM_TILING), [['a', 'b']]);
    assert.deepEqual(dock([], 'b', null, 2, ROOM_TILING), [['b']]);
  });
  it('goes where it was dropped', () => {
    assert.deepEqual(dock([['a', 'b'], ['c']], 'd', { column: 0, row: 1 }, 2, ROOM_TILING), [['a', 'd', 'b'], ['c']]);
    assert.deepEqual(dock([['a'], ['c']], 'mod:m', { column: 1, row: 0 }, 2, ROOM_TILING), [['a'], ['mod:m', 'c']]);
  });
  it('takes a column of its own on the side of a column while the columns fit', () => {
    assert.deepEqual(dock([['a'], ['b']], 'c', { column: 0, row: 0, side: 'after' }, 3, FOCUS_TILING), [['a'], ['c'], ['b']]);
    assert.deepEqual(dock([['a'], ['b']], 'c', { column: 0, row: 0, side: 'after' }, 2, ROOM_TILING), [['c', 'a'], ['b']]);
  });
  it('a full column sends it to the first place with room', () => {
    assert.deepEqual(dock([['a', 'b', 'c'], ['d']], 'e', { column: 0, row: 1 }, 2, ROOM_TILING), [['a', 'b', 'c'], ['d', 'e']]);
  });
  it('a new column beyond the last one', () => assert.deepEqual(dock([['a']], 'b', { column: 1, row: 0 }, 2, ROOM_TILING), [['a'], ['b']]));
  it('refuses when the grid is full', () => {
    assert.equal(dock([['a', 'b', 'c'], ['d', 'e', 'f']], 'g', { column: 0, row: 0 }, 2, ROOM_TILING), null);
  });
  it('a window already docked moves there', () => assert.deepEqual(dock([['a', 'b']], 'b', { column: 1, row: 0 }, 2, ROOM_TILING), [['a'], ['b']]));
});

describe('floating a window', () => {
  it('leaves the grid and comes to the front', () => {
    const placed = float([['a', 'b'], ['c']], { boxes: { z: box }, order: ['z'] }, 'b', box, ROOM_TILING);
    assert.deepEqual(placed.columns, [['a'], ['c']]);
    assert.deepEqual(placed.free, { boxes: { z: box, b: box }, order: ['z', 'b'] });
  });
  it('a floating one moved comes to the front', () => {
    const placed = float([['a']], { boxes: { b: box, c: box }, order: ['b', 'c'] }, 'b', { ...box, left: 0.5 }, ROOM_TILING);
    assert.deepEqual(placed.columns, [['a']]);
    assert.deepEqual(placed.free.order, ['c', 'b']);
    assert.equal(placed.free.boxes.b.left, 0.5);
  });
  it('docked again, it floats no more', () => assert.deepEqual(unfloat({ boxes: { b: box }, order: ['b'] }, 'b'), none));
});

describe('tidying the windows', () => {
  it('docks every floating window, the mods after the sessions', () => {
    const tidied = tidyAll([['a']], { boxes: { c: box, b: box }, order: ['b', 'c'] }, ['mod:m'], 2, ROOM_TILING);
    assert.deepEqual(tidied.columns, [['a', 'b', 'c'], ['mod:m']]);
    assert.deepEqual(tidied.free, none);
  });
  it('the ones with no room left keep floating', () => {
    const tidied = tidyAll([['a', 'b', 'c'], ['d', 'e']], { boxes: { f: box, g: box }, order: ['f', 'g'] }, [], 2, ROOM_TILING);
    assert.deepEqual(tidied.columns, [['a', 'b', 'c'], ['d', 'e', 'f']]);
    assert.deepEqual(tidied.free, { boxes: { g: box }, order: ['g'] });
  });
});

describe('the other arrangement', () => {
  it('docks there what floats here, and keeps out of its grid what floats there', () => {
    const columns = switchArrangement([['a'], ['b']], { boxes: { c: box }, order: ['c'] }, { boxes: { b: box }, order: ['b'] }, 3, FOCUS_TILING);
    assert.deepEqual(columns.flat().toSorted(), ['a', 'c']);
  });
  it('docked mods follow', () => {
    assert.deepEqual(switchArrangement([['mod:m', 'a']], none, none, 2, ROOM_TILING).flat().toSorted(), ['a', 'mod:m']);
  });
});

describe('docking in focus mode', () => {
  const slots = [
    { id: 'a', column: 0, row: 0, box: { left: 0, top: 0, width: 400, height: 600 } },
    { id: 'b', column: 1, row: 0, box: { left: 412, top: 0, width: 400, height: 600 } },
  ];
  const columns = [['a'], ['b']];
  it('over the title of a window, before it', () => assert.deepEqual(dockAt(slots, { x: 200, y: 20 }, columns, FOCUS_TILING), { column: 0, row: 0 }));
  it('over its bottom, after it', () => assert.deepEqual(dockAt(slots, { x: 600, y: 590 }, columns, FOCUS_TILING), { column: 1, row: 1 }));
  it('on the side of a column, a column of its own', () => assert.deepEqual(dockAt(slots, { x: 10, y: 300 }, columns, FOCUS_TILING), { column: 0, row: 0, side: 'before' }));
  it('in the middle of a window, it floats', () => assert.equal(dockAt(slots, { x: 200, y: 300 }, columns, FOCUS_TILING), null));
});

describe('over an area', () => {
  const area = { left: 100, top: 0, width: 200, height: 100 };
  it('inside', () => assert.equal(within(area, { x: 150, y: 50 }), true));
  it('a little away, within the margin', () => assert.equal(within(area, { x: 70, y: 50 }, 48), true));
  it('far away', () => assert.equal(within(area, { x: 20, y: 50 }, 48), false));
});
