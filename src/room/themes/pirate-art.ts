// Small tools shared by the galleon's files (pirate.ts and its neighbours): a pixel at art resolution, a quad on a wall,
// a sprite in letters on a wall, and the dressing hung on the walls, whose places the effects and the lights need too.
import { PIRATE_PALETTE as P } from '../../design/theme-pirate.ts';
import type { Point } from '../geometry.ts';
import { fillPolygon } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import { onWallAt, type Context, type Wall } from '../wall-art.ts';

export function dot(context: Context, point: Point, colour: string) {
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
}

/** A pixel of a wall: `column` eighths of a tile along it, `z` art pixels up. */
export const wallDot = (context: Context, wall: Wall, column: number, z: number, colour: string) => dot(context, onWallAt(wall, column / 8, z), colour);

export function wallQuad(context: Context, wall: Wall, from: number, to: number, low: number, high: number, colour: string) {
  fillPolygon(context, [onWallAt(wall, from, low), onWallAt(wall, to, low), onWallAt(wall, to, high), onWallAt(wall, from, high)], colour);
}

/**
 * A sprite in letters on a wall, its bottom row at `bottom`, centred on `along`: one column an eighth of a tile. On the
 * left wall the columns run the other way, so it reads as drawn (the wall's tiles go towards the viewer, on the left).
 */
export function wallSprite(context: Context, wall: Wall, rows: readonly string[], colours: Readonly<Record<string, string>>, along: number, bottom: number) {
  const half = Math.floor(rows[0].length / 2);
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
    const colour = colours[letter];
    const across = wall === 'left' ? half - column : column - half;
    if (colour) wallDot(context, wall, Math.round(along * 8) + across, bottom + rows.length - 1 - line, colour);
  });
}

/** Where the dressing hangs, the same in both rooms (clear of their windows, the clock, the screen and the door). */
export interface WallSpot { wall: Wall; along: number }
/** The lanterns, by the bottom of their glass. */
export const LANTERNS: readonly (WallSpot & { z: number })[] = [
  { wall: 'back', along: 6.2, z: 33 },
  { wall: 'back', along: 13.9, z: 33 },
  { wall: 'left', along: 8.1, z: 33 },
];
/** The flag on the left wall: its middle, its top and size in art pixels. */
export const FLAG = { along: 6, top: 46, rows: 18, columns: 19 };

const SKULL = [
  'fffffffffffffffffff',
  'fffffffffffffffffff',
  'fffffffbbbbbfffffff',
  'ffffffbbbbbbbffffff',
  'fffffbbbbbbbbbfffff',
  'fffffbffbbbffbfffff',
  'fffffbffbbbffbfffff',
  'fffffbbbbfbbbbfffff',
  'ffffffbbbbbbbffffff',
  'fffffffbfbfbfffffff',
  'fbbfffffffffffffbbf',
  'fbbbbfffffffffbbbbf',
  'ffffbbbfffffbbbffff',
  'fffffffbbbbbfffffff',
  'ffffbbbfffffbbbffff',
  'fbbbbfffffffffbbbbf',
  'fbbfffffffffffffbbf',
  'ffffffffffffffffffs',
];

/** The black flag nailed to the left wall: skull and crossed bones, a frayed bottom edge (it ripples, see pirate-effects.ts). */
export const FLAG_ROWS = SKULL.map((row, line) => (line === SKULL.length - 1 ? [...row].map((letter, column) => (pick(`fray${column}`, 3) === 0 ? '.' : letter)).join('') : row));
export const FLAG_COLOURS: Readonly<Record<string, string>> = { f: P.flag, s: P.flagShade, b: P.bone };

/** The lounge's great map, in art pixels up the back wall. */
export const MAP = { low: 14, high: 40 };

/** The route on the map, from the first island to the cross, in map pixels (the ship sails along it, see pirate-effects.ts). */
export function mapRoute(width: number, height: number): Point[] {
  const route: Point[] = [];
  for (let step = 0; step <= 40; step++) {
    const share = step / 40;
    route.push({ x: width * (0.28 + share * 0.55), y: height * (0.55 + Math.sin(share * Math.PI * 1.6) * 0.18 + share * 0.05) });
  }
  return route;
}

