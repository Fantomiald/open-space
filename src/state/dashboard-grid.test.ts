import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDashboards } from '../../shared/dashboards.ts';
import { addTile, compact, gridHeight, moveTile, removeTile, resizeTile, stacked } from './dashboard-grid.ts';

const tile = (mod: string, x: number, y: number, w = 4, h = 4) => ({ mod, x, y, w, h });
const at = (tiles: { mod: string; x: number; y: number }[]) => Object.fromEntries(tiles.map(({ mod, x, y }) => [mod, [x, y]]));

describe('dashboard grid', () => {
  it('lets tiles fall up into the holes above them', () => {
    assert.deepEqual(at(compact([tile('a', 0, 5), tile('b', 0, 20), tile('c', 4, 3)])), { a: [0, 0], b: [0, 4], c: [4, 0] });
  });

  it('pushes the tiles in the way below the one moved', () => {
    const tiles = [tile('a', 0, 0), tile('b', 0, 4)];
    // b carried to the top: a goes under it
    assert.deepEqual(at(moveTile(tiles, 'b', 0, 0)), { a: [0, 4], b: [0, 0] });
    // carried beside a: both on the top row
    assert.deepEqual(at(moveTile(tiles, 'b', 6, 0)), { a: [0, 0], b: [6, 0] });
  });

  it('keeps a moved tile within the grid', () => {
    const [moved] = moveTile([tile('a', 0, 0)], 'a', 11, -3);
    assert.deepEqual([moved?.x, moved?.y], [8, 0]);
  });

  it('pushes down what a resized tile now covers, and keeps it within bounds', () => {
    const tiles = resizeTile([tile('a', 0, 0), tile('b', 4, 0)], 'a', 6, 2);
    assert.deepEqual(tiles.find((each) => each.mod === 'a'), tile('a', 0, 0, 6, 3));
    assert.deepEqual(at(tiles).b, [4, 3]);
    assert.equal(resizeTile([tile('a', 8, 0)], 'a', 12, 4)[0]?.w, 4);
  });

  it('puts a new tile in the first free spot', () => {
    const tiles = [tile('a', 0, 0), tile('b', 8, 0)];
    assert.deepEqual(addTile(tiles, 'c', 4, 4).at(-1), tile('c', 4, 0));
    assert.deepEqual(addTile(tiles, 'd', 6, 4).at(-1), tile('d', 0, 4, 6, 4));
  });

  it('closes the gap of a tile taken off', () => {
    assert.deepEqual(at(removeTile([tile('a', 0, 0), tile('b', 0, 4)], 'a')), { b: [0, 0] });
  });

  it('stacks the tiles in reading order on a narrow page', () => {
    assert.deepEqual(stacked([tile('b', 6, 0, 6, 3), tile('a', 0, 0, 6, 5)]), [tile('b', 0, 5, 12, 3), tile('a', 0, 0, 12, 5)]);
  });

  it('measures the grid down to its lowest tile', () => {
    assert.equal(gridHeight([]), 0);
    assert.equal(gridHeight([tile('a', 0, 0, 4, 2)]), 2 * 32 + 12);
  });
});

describe('dashboards in the settings', () => {
  it('keeps what is valid, each mod once per dashboard', () => {
    assert.equal(parseDashboards('nope'), null);
    assert.deepEqual(parseDashboards([
      { id: 'main', name: '  Mes   apps ', tiles: [tile('chiffres', 10, 0, 4, 1), tile('chiffres', 0, 9), { mod: '../x', x: 0, y: 0, w: 4, h: 4 }] },
      { id: 'main', name: 'twin', tiles: [] },
      { id: 'bad id!', name: 'x', tiles: [] },
    ]), [{ id: 'main', name: 'Mes apps', tiles: [tile('chiffres', 8, 0, 4, 3)] }]);
  });
});
