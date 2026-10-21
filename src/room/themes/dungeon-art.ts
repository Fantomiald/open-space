// Small tools shared by the dungeon's pieces (themes/dungeon*.ts): smooth noise for stone and moss, and where the
// torches hang, which the walls, the lights and the flames all need.
import type { Layout, PieceKind } from '../../../shared/room-layout.ts';
import type { Point } from '../geometry.ts';
import { pick } from '../sky.ts';
import type { Context, Wall } from '../wall-art.ts';

/** Smooth noise from 0 to 1: random values on a grid of `size` pixels, blended between them. */
export function noise(key: string, x: number, y: number, size: number): number {
  const gx = Math.floor(x / size), gy = Math.floor(y / size), fx = x / size - gx, fy = y / size - gy;
  const at = (i: number, j: number) => pick(`${key}${gx + i},${gy + j}`, 1000) / 1000;
  const ease = (t: number) => t * t * (3 - 2 * t);
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * ease(fx), bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * ease(fx);
  return top + (bottom - top) * ease(fy);
}

export function dot(context: Context, point: Point, colour: string) {
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
}

/** Something hung on a wall, `along` it in tiles. */
export interface WallSpot { wall: Wall; along: number }

/** Pieces tall enough to hide what hangs on the wall behind them. */
const TALL: readonly PieceKind[] = ['bigPlant', 'whiteboard', 'bookshelf', 'metricsTv', 'ticker'];

/** True when nothing stands or hangs in front of a spot of the wall, `half` tiles each side of it. */
export function wallIsFree(layout: Layout, { wall, along }: WallSpot, half: number): boolean {
  if (wall === 'back' && layout.wallItems.some((item) => along + half > item.fromX - 0.2 && along - half < item.fromX + item.width + 0.2)) return false;
  return !layout.furniture.some((piece) => {
    if (!TALL.includes(piece.kind)) return false;
    const near = wall === 'back' ? piece.y < 1 : piece.x < 1;
    const from = wall === 'back' ? piece.x - piece.y : piece.y - piece.x;
    const size = wall === 'back' ? piece.width : piece.depth;
    return near && along + half > from - 0.4 && along - half < from + size + 0.4;
  });
}

const TORCHES: readonly WallSpot[] = [
  ...[0.6, 6.2, 13.95, 19.4].map((along): WallSpot => ({ wall: 'back', along })),
  ...[1.2, 4.9, 8.45, 10.85].map((along): WallSpot => ({ wall: 'left', along })),
];

/** The torches on the walls of a room: wherever nothing hides them. */
export const torchesOf = (layout: Layout): WallSpot[] => TORCHES.filter((spot) => wallIsFree(layout, spot, 0.3));

const BANNERS: readonly WallSpot[] = [
  { wall: 'back', along: 11.95 },
  ...[3.05, 6.75, 12.55].map((along): WallSpot => ({ wall: 'left', along })),
];

/** The banners: wherever nothing hides them, nor a torch. */
export const bannersOf = (layout: Layout): WallSpot[] => {
  const torches = torchesOf(layout);
  return BANNERS.filter((spot) => wallIsFree(layout, spot, 0.45) && !torches.some((torch) => torch.wall === spot.wall && Math.abs(torch.along - spot.along) < 1));
};
