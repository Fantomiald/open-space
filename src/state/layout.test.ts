import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startsDrag } from '../lib/drag.ts';
import { dropAt, FOCUS_TILING, moveIn, ROOM_TILING } from './stack.ts';
import { cascade, clampBox, GAP, gridBoxes, keepSizes, resizeBox, resizeTrack, snapMove, sanitizeWindows, snapResize, tidy, withoutWindow, zoneAt, zoneBox } from './windows.ts';
import { clampRoom, DEFAULT_ROOM_FRAME, MIN_ROOM_SCALE, panRoom, roomBox, sanitizeRoomFrames, zoomRoom } from './room-frame.ts';

describe('room frame', () => {
  const home = { left: 0, top: 50, width: 800, height: 600 }, bounds = { left: 0, top: 50, width: 1400, height: 600 };
  it('keeps the room inside the bounds', () => {
    assert.deepEqual(roomBox(home, clampRoom({ x: 2, y: -1, scale: 1 }, home, bounds)), { left: 600, top: 50, width: 800, height: 600 });
  });
  it('bounds the scale', () => {
    assert.equal(clampRoom({ x: 0, y: 0, scale: 3 }, home, bounds).scale, 1);
    assert.equal(clampRoom({ x: 0, y: 0, scale: 0.1 }, home, bounds).scale, MIN_ROOM_SCALE);
  });
  it('zooms around the pointer', () => {
    const frame = zoomRoom(DEFAULT_ROOM_FRAME, home, bounds, { x: 400, y: 350 }, 0.75);
    const box = roomBox(home, frame);
    assert.deepEqual([box.left + box.width / 2, box.top + box.height / 2, box.width], [400, 350, 600]);
  });
  it('pans and stops at the edge', () => {
    assert.equal(roomBox(home, panRoom(DEFAULT_ROOM_FRAME, home, bounds, 900, 0)).left, 600);
  });
  it('a smaller window brings a saved room back in view', () => {
    const small = { left: 0, top: 50, width: 900, height: 600 };
    assert.equal(roomBox(home, clampRoom({ x: 0.75, y: 0, scale: 1 }, home, small)).left, 100);
  });
  it('drops saved frames that are not numbers', () => {
    assert.deepEqual(sanitizeRoomFrames({ office: { x: 0.1, y: 0, scale: 0.5 }, lounge: { x: 'a' } }), { office: { x: 0.1, y: 0, scale: 0.5 } });
    assert.deepEqual(sanitizeRoomFrames(null), {});
  });
});

describe('drag threshold', () => {
  it('a small slip is still a click', () => assert.equal(startsDrag({ x: 0, y: 0 }, { x: 3, y: 2 }), false));
  it('past four pixels it is a drag', () => assert.equal(startsDrag({ x: 0, y: 0 }, { x: 4, y: 3 }), true));
});

describe('moving a window in the grid', () => {
  it('moves into another column', () => assert.deepEqual(moveIn([['a', 'b'], ['c']], 'b', { column: 1, row: 0 }, 2, ROOM_TILING), [['a'], ['b', 'c']]));
  it('swaps with a full column', () => assert.deepEqual(moveIn([['a', 'b', 'c'], ['d']], 'd', { column: 0, row: 1 }, 2, ROOM_TILING), [['a', 'd', 'c'], ['b']]));
  it('opens a new column when there is room', () => assert.deepEqual(moveIn([['a', 'b']], 'b', { column: 1, row: 0 }, 2, ROOM_TILING), [['a'], ['b']]));
  it('stays in its column when no other column fits', () => assert.deepEqual(moveIn([['a', 'b'], ['c']], 'b', { column: 2, row: 0 }, 2, ROOM_TILING), [['a', 'b'], ['c']]));
  it('moves down its own column', () => assert.deepEqual(moveIn([['a', 'b', 'c']], 'a', { column: 0, row: 3 }, 2, ROOM_TILING), [['b', 'c', 'a']]));
  it('in focus mode, takes the place of the window it was dropped on, rightwards too', () => {
    assert.deepEqual(moveIn([['a', 'b'], ['c'], ['d']], 'a', { column: 2, row: 0 }, 3, FOCUS_TILING), [['b'], ['c'], ['a', 'd']]);
    assert.deepEqual(moveIn([['a', 'b'], ['c'], ['d']], 'd', { column: 0, row: 0 }, 3, FOCUS_TILING), [['d', 'b'], ['c'], ['a']]);
  });
  it('takes a column of its own on the side of a column', () => {
    assert.deepEqual(moveIn([['a', 'b'], ['c'], ['d']], 'c', { column: 0, row: 0, side: 'before' }, 3, FOCUS_TILING), [['c'], ['a', 'b'], ['d']]);
    assert.deepEqual(moveIn([['a', 'b'], ['c']], 'a', { column: 1, row: 0, side: 'after' }, 3, FOCUS_TILING), [['b'], ['c'], ['a']]);
  });
  it('joins the column instead when no other column fits', () => {
    assert.deepEqual(moveIn([['a', 'b'], ['c'], ['d']], 'a', { column: 2, row: 1, side: 'after' }, 3, FOCUS_TILING), [['b'], ['c'], ['d', 'a']]);
  });
  it('ignores a session that left', () => assert.deepEqual(moveIn([['a']], 'z', { column: 0, row: 0 }, 2, ROOM_TILING), [['a']]));
});

describe('where a dragged window lands', () => {
  const columns = [['a'], ['b', 'c']];
  const slots = [
    { id: 'a', column: 0, row: 0, box: { left: 506, top: 0, width: 494, height: 192 } },
    { id: 'b', column: 1, row: 0, box: { left: 0, top: 0, width: 494, height: 192 } },
    { id: 'c', column: 1, row: 1, box: { left: 0, top: 204, width: 494, height: 192 } },
  ];
  it('the lower half of a window is after it', () => assert.deepEqual(dropAt(slots, { x: 700, y: 150 }, columns, ROOM_TILING), { column: 0, row: 1 }));
  it('the upper half of a window is before it', () => assert.deepEqual(dropAt(slots, { x: 100, y: 50 }, columns, ROOM_TILING), { column: 1, row: 0 }));
  it('beyond the last column is a new one', () => assert.deepEqual(dropAt(slots, { x: -50, y: 50 }, columns, ROOM_TILING), { column: 2, row: 0 }));
  it('near the side of a column is a column of its own', () => {
    assert.deepEqual(dropAt(slots, { x: 20, y: 50 }, columns, ROOM_TILING), { column: 1, row: 0, side: 'after' });
    assert.deepEqual(dropAt(slots, { x: 980, y: 150 }, columns, ROOM_TILING), { column: 0, row: 1, side: 'before' });
  });
  it('the other side is nowhere', () => assert.equal(dropAt(slots, { x: 1100, y: 50 }, columns, ROOM_TILING), null));
});

describe('the grid as boxes', () => {
  const area = { width: 1000, height: 600 };
  it('lays the room out from the right, each column sharing its height', () => {
    const boxes = gridBoxes([['a'], ['b', 'c']], null, area, ROOM_TILING);
    assert.deepEqual(boxes.a, { left: 506, top: 0, width: 494, height: 600 });
    assert.deepEqual(boxes.c, { left: 0, top: 306, width: 494, height: 294 });
  });
  it('two windows in two columns are both whole', () => {
    const boxes = gridBoxes([['a'], ['b']], null, area, ROOM_TILING);
    assert.equal(boxes.a.height, 600);
    assert.equal(boxes.b.height, 600);
  });
  it('a window alone in its focus column takes its height', () => {
    assert.deepEqual(gridBoxes([['a', 'b'], ['c']], null, area, FOCUS_TILING).c, { left: 506, top: 0, width: 494, height: 600 });
  });
  it('follows the sizes set by hand', () => {
    assert.equal(gridBoxes([['a'], ['b']], { columns: [0.75, 0.25], rows: [[1], [1]] }, area, ROOM_TILING).a.width, 741);
  });
  it('sizes that no longer fit the grid are dropped', () => {
    assert.equal(gridBoxes([['a'], ['b'], ['c']], { columns: [0.5, 0.5], rows: [[1], [1]] }, { width: 1024, height: 600 }, { ...ROOM_TILING, maxColumns: 3 }).a.width, 1000 / 3);
  });
});

describe('a gutter pulled by hand', () => {
  it('moves the line between two tracks', () => assert.deepEqual(resizeTrack([0.5, 0.5], 0, 100, 1000, 320), [0.6, 0.4]));
  it('stops at the smallest size', () => assert.deepEqual(resizeTrack([0.5, 0.5], 0, 400, 1000, 320), [0.68, 0.32]));
});

describe('sizes set by hand, when the windows change', () => {
  const sizes = { columns: [0.6, 0.4], rows: [[0.5, 0.3, 0.2], [0.2, 0.3, 0.5]] };
  it('a column that gained a window is shared out again', () => {
    assert.deepEqual(keepSizes([['a', 'b'], ['c']], [['a', 'b', 'd'], ['c']], sizes), { columns: [0.6, 0.4], rows: [[], [0.2, 0.3, 0.5]] });
  });
  it('another number of columns starts over', () => assert.equal(keepSizes([['a'], ['b']], [['a'], ['b'], ['c']], sizes), null));
  it('a column that lost its sizes is shared out alone', () => {
    const boxes = gridBoxes([['a'], ['b', 'c']], { columns: [0.5, 0.5], rows: [[], [0.6, 0.4]] }, { width: 1000, height: 600 }, ROOM_TILING);
    assert.equal(boxes.a.height, 600);
    assert.equal(Math.round(boxes.b.height * 10) / 10, 352.8);
  });
});

describe('a window placed by hand', () => {
  const surface = { width: 1000, height: 700 };
  it('stays reachable and no bigger than the screen', () => {
    assert.deepEqual(clampBox({ left: 1500, top: 900, width: 2000, height: 300 }, surface), { left: 880, top: 644, width: 1000, height: 300 });
  });
  it('is never smaller than a readable window', () => {
    assert.deepEqual(clampBox({ left: 0, top: 0, width: 100, height: 50 }, surface), { left: 0, top: 0, width: 320, height: 192 });
  });
  it('grows from the corner it is pulled by', () => {
    assert.deepEqual(resizeBox({ left: 100, top: 100, width: 400, height: 300 }, 'nw', -50, -50), { left: 50, top: 50, width: 450, height: 350 });
  });
  it('shrinks no further than a readable window, its other corner still', () => {
    assert.deepEqual(resizeBox({ left: 100, top: 100, width: 400, height: 300 }, 'nw', 200, 200), { left: 180, top: 208, width: 320, height: 192 });
  });
});

describe('the magnets', () => {
  const surface = { width: 1000, height: 700 };
  it('a window near the edge sticks to it, with a guide', () => {
    const { box, guides } = snapMove({ left: 17, top: 100, width: 300, height: 300 }, [], surface);
    assert.equal(box.left, GAP);
    assert.deepEqual(guides, [{ axis: 'x', at: GAP, from: 0, to: 700 }]);
  });
  it('a window near another sits beside it, a gutter apart', () => {
    const other = { left: 600, top: 0, width: 300, height: 300 };
    assert.equal(snapMove({ left: 283, top: 100, width: 300, height: 300 }, [other], surface).box.left, 288);
  });
  it('far from everything nothing moves', () => {
    const result = snapMove({ left: 32, top: 100, width: 300, height: 300 }, [], surface);
    assert.deepEqual([result.box.left, result.guides.length], [32, 0]);
  });
  it('only the edge being pulled sticks', () => {
    const other = { left: 517, top: 0, width: 300, height: 300 };
    assert.deepEqual(snapResize({ left: 100, top: 100, width: 400, height: 300 }, 'e', [other], surface).box, { left: 100, top: 100, width: 405, height: 300 });
  });
});

describe('the edges of the screen', () => {
  const surface = { width: 1200, height: 800 };
  it('the side is a half', () => assert.equal(zoneAt({ x: 2, y: 400 }, surface), 'left'));
  it('the corner is a quarter', () => assert.equal(zoneAt({ x: 2, y: 5 }, surface), 'top-left'));
  it('the top is the whole screen', () => assert.equal(zoneAt({ x: 600, y: 2 }, surface), 'full'));
  it('the middle is nothing', () => assert.equal(zoneAt({ x: 600, y: 400 }, surface), null));
  it('a half leaves the gutters', () => assert.deepEqual(zoneBox('right', surface), { left: 606, top: 12, width: 582, height: 776 }));
  it('a quarter leaves the gutters', () => assert.deepEqual(zoneBox('bottom-left', surface), { left: 12, top: 406, width: 582, height: 382 }));
});

describe('new windows placed by hand', () => {
  const surface = { width: 1000, height: 700 }, size = { width: 400, height: 300 };
  it('the first one goes to the corner', () => assert.deepEqual(cascade(null, size, surface), { left: 12, top: 12, width: 400, height: 300 }));
  it('the next ones step down and right', () => assert.deepEqual(cascade({ left: 12, top: 12, width: 400, height: 300 }, size, surface), { left: 44, top: 44, width: 400, height: 300 }));
  it('back to the corner rather than out of the screen', () => assert.deepEqual(cascade({ left: 580, top: 380, width: 400, height: 300 }, size, surface), { left: 12, top: 12, width: 400, height: 300 }));
});

describe('tidying windows placed by hand', () => {
  const area = { width: 1000, height: 600 };
  it('each window takes the place of the grid nearest to it', () => {
    const boxes = { a: { left: 0, top: 0, width: 494, height: 192 }, b: { left: 506, top: 0, width: 494, height: 192 } };
    assert.deepEqual(tidy([['a'], ['b']], boxes, area, ROOM_TILING, null), [['b'], ['a']]);
  });
  it('a window never placed keeps its place', () => {
    const boxes = { a: { left: 0, top: 0, width: 494, height: 192 }, b: { left: 506, top: 0, width: 494, height: 192 } };
    assert.deepEqual(tidy([['a'], ['b', 'c']], boxes, area, ROOM_TILING, null), [['b'], ['a', 'c']]);
  });
});

describe('how the windows were arranged, read back', () => {
  it('nothing saved is the grid everywhere', () => {
    assert.deepEqual(sanitizeWindows(undefined), {
      mode: { room: 'grid', focus: 'grid' }, free: { room: { boxes: {}, order: [] }, focus: { boxes: {}, order: [] } }, sizes: { room: null, focus: null }, stackWidth: null,
    });
  });
  it('keeps what is sound and drops the rest', () => {
    const read = sanitizeWindows({ mode: { room: 'free', focus: 'other' }, free: { room: { boxes: { a: { left: Number.NaN }, b: { left: 0.1, top: 0.2, width: 0.3, height: 0.4 } }, order: ['b', 7] } }, stackWidth: 'wide' });
    assert.deepEqual(read.mode, { room: 'free', focus: 'grid' });
    assert.deepEqual(read.free.room, { boxes: { b: { left: 0.1, top: 0.2, width: 0.3, height: 0.4 } }, order: ['b'] });
    assert.equal(read.stackWidth, null);
  });
  it('keeps sizes that are fractions', () => {
    assert.deepEqual(sanitizeWindows({ sizes: { room: { columns: [0.5, 0.5], rows: [[1], [1]] }, focus: { columns: 'x' } } }).sizes, { room: { columns: [0.5, 0.5], rows: [[1], [1]] }, focus: null });
  });
  it('drops sizes that are not shares of the whole', () => {
    assert.deepEqual(sanitizeWindows({ sizes: { room: { columns: [1.5, -0.5], rows: [] }, focus: { columns: [0.5, 0.5], rows: [[0, 1], [0.5, 0.5]] } } }).sizes, { room: null, focus: { columns: [0.5, 0.5], rows: [[], [0.5, 0.5]] } });
  });
  it('a session forgotten leaves the windows placed by hand', () => {
    const free = { room: { boxes: { a: { left: 0, top: 0, width: 0.5, height: 0.5 } }, order: ['a'] }, focus: { boxes: {}, order: [] } };
    assert.deepEqual(withoutWindow(free, 'a'), { room: { boxes: {}, order: [] }, focus: { boxes: {}, order: [] } });
  });
});
