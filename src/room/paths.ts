// Walking routes, as lists of floor points to reach one after the other: tile by tile, in the eight directions,
// around the furniture and never cutting the corner of a piece, like in the hotel.
import { tileCenter, type Point } from './geometry.ts';

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const key = (x: number, y: number) => `${x},${y}`;

/**
 * The shortest tile route from a point to a tile (breadth-first over the free tiles), as tile centres after the
 * starting tile. Straight to the target when no route exists (it should not happen in these rooms).
 */
export function route(from: Point, to: Point, isFreeTile: (x: number, y: number) => boolean): Point[] {
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) };
  const goal = { x: Math.floor(to.x), y: Math.floor(to.y) };
  const previous = new Map<string, string | null>([[key(start.x, start.y), null]]);
  const queue = [start];
  while (queue.length) {
    const tile = queue.shift()!;
    if (tile.x === goal.x && tile.y === goal.y) break;
    for (const [dx, dy] of STEPS) {
      const x = tile.x + dx;
      const y = tile.y + dy;
      if (previous.has(key(x, y)) || !isFreeTile(x, y)) continue;
      if (dx && dy && !(isFreeTile(tile.x + dx, tile.y) && isFreeTile(tile.x, tile.y + dy))) continue;
      previous.set(key(x, y), key(tile.x, tile.y));
      queue.push({ x, y });
    }
  }
  if (!previous.has(key(goal.x, goal.y))) return [tileCenter(goal)];
  const tiles: Point[] = [];
  for (let at: string | null | undefined = key(goal.x, goal.y); at && at !== key(start.x, start.y); at = previous.get(at)) {
    const [x, y] = at.split(',').map(Number);
    tiles.unshift(tileCenter({ x, y }));
  }
  return tiles.length ? tiles : [tileCenter(goal)];
}

/** Something that walks: where it is, where it looks, and the points still to reach. */
export interface Mover { position: Point; heading: Point; path: Point[] }

/** Moves along the path by `budget` tiles. Returns true when the end of the path was reached during this move. */
export function advanceAlong(mover: Mover, budget: number): boolean {
  while (mover.path.length && budget > 0) {
    const target = mover.path[0];
    const dx = target.x - mover.position.x;
    const dy = target.y - mover.position.y;
    const length = Math.hypot(dx, dy);
    if (length > 0.001) mover.heading = { x: dx, y: dy };
    if (length <= budget) {
      mover.position = { ...target };
      mover.path.shift();
      budget -= length;
      if (!mover.path.length) return true;
    } else {
      mover.position = { x: mover.position.x + dx / length * budget, y: mover.position.y + dy / length * budget };
      budget = 0;
    }
  }
  return false;
}
