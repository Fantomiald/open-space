// The rooms' isometric grid: floor tiles to canvas pixels and back (each room's seats and free tiles are in floor.ts).
// Floor positions are in tiles (0 to ROOM.width along x, 0 to ROOM.depth along y); screen positions are pixels of the room (the canvas
// itself has RENDER_SCALE times more).
import { ROOM } from '../../shared/room-layout.ts';

export { ROOM };

export interface Point { x: number; y: number }

export const CANVAS_WIDTH = 640;
/** 80 px more than the room needs, at the top: the band where the speech bubbles go, above everyone's head. */
export const CANVAS_HEIGHT = 480;
/** The canvas has twice as many pixels as the room's coordinates, for crisp pixel art on dense screens. */
export const RENDER_SCALE = 2;
/** A floor tile on screen, in room pixels (64 x 32 canvas pixels, because of RENDER_SCALE). */
export const TILE_WIDTH = 32;
export const TILE_HEIGHT = 16;
export const WALL_HEIGHT = 100;
/** The doorway in the left wall: its width along the wall, in tiles (from the layout's door.y), and its height in room pixels. */
export const DOOR_SIZE = { width: 1.3, height: 60 };
/** Where the far corner of the floor (tile 0, 0) lands on the canvas. */
const ORIGIN: Point = { x: 272, y: 188 };


export function toScreen(tile: Point): Point {
  return { x: ORIGIN.x + (tile.x - tile.y) * TILE_WIDTH / 2, y: ORIGIN.y + (tile.x + tile.y) * TILE_HEIGHT / 2 };
}

export function toTile(screen: Point): Point {
  const across = (screen.x - ORIGIN.x) / (TILE_WIDTH / 2);
  const down = (screen.y - ORIGIN.y) / (TILE_HEIGHT / 2);
  return { x: (across + down) / 2, y: (down - across) / 2 };
}

/** Where a canvas point falls on the plane of the left wall: how far along it (in tiles) and how high (in room pixels). */
export function onLeftWall(screen: Point): { along: number; height: number } {
  const along = (ORIGIN.x - screen.x) / (TILE_WIDTH / 2);
  return { along, height: ORIGIN.y + along * TILE_HEIGHT / 2 - screen.y };
}

/** Draw order of things standing on the floor: the further back, the earlier. */
export const depthOf = (tile: Point) => tile.x + tile.y;

export const tileCenter = (tile: Point): Point => ({ x: Math.floor(tile.x) + 0.5, y: Math.floor(tile.y) + 0.5 });

/** A floor heading for one of the eight directions, 0 to 7 clockwise from the back wall's (2: +x, 4: +y). */
export function facingVector(direction: number): Point {
  const angle = (direction - 2) * Math.PI / 4;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
