// Tools to paint on the walls at art resolution, on their own slant: small sprites, words in a 3 x 5 pixel font,
// sagging wires and strings of little flags. Used by the festivals' decorations (festivals.ts, halloween.ts).
import { WALL_HEIGHT, toScreen, type Point } from './geometry.ts';
import { ART_SCALE, toArt } from './pixel-art.ts';

export type Context = CanvasRenderingContext2D;
export type Wall = 'back' | 'left';
/** The walls' height in art pixels. */
export const WALL = WALL_HEIGHT / ART_SCALE;

const lift = (point: Point, z: number): Point => ({ x: point.x, y: point.y - z });
/** An art point on a wall: `along` it in tiles, `z` art pixels above the floor. */
export const onWallAt = (wall: Wall, along: number, z: number) => lift(wall === 'back' ? toArt({ x: along, y: 0 }) : toArt({ x: 0, y: along }), z);
/** The same point in room pixels (for what is drawn every frame). */
export const roomPointOnWall = (wall: Wall, along: number, z: number): Point => {
  const point = wall === 'back' ? toScreen({ x: along, y: 0 }) : toScreen({ x: 0, y: along });
  return { x: point.x, y: point.y - z * ART_SCALE };
};

function dot(context: Context, point: Point, colour: string) {
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
}

/**
 * A sprite painted on a wall, one letter a pixel (`paint` gives each letter its colour, others are left out): one column
 * per eighth of a tile along the wall (one art pixel across), one row per art pixel up, its bottom row at `bottom`.
 */
export function onWall(context: Context, rows: readonly string[], paint: Readonly<Record<string, string>>, wall: Wall, from: number, bottom: number) {
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
    const colour = paint[letter];
    if (colour) dot(context, onWallAt(wall, from + column / 8, bottom + (rows.length - 1 - line)), colour);
  });
}

export function line(context: Context, from: Point, to: Point, colour: string) {
  context.fillStyle = colour;
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let step = 0; step <= steps; step++) {
    const t = steps ? step / steps : 0;
    context.fillRect(Math.round(from.x + (to.x - from.x) * t), Math.round(from.y + (to.y - from.y) * t), 1, 1);
  }
}

/** Capitals and digits, 3 pixels wide and 5 high ("#" is ink). */
const FONT: Readonly<Record<string, readonly string[]>> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['#.#', '###', '###', '###', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'], '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'], '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '##.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'], '-': ['...', '...', '###', '...', '...'], ' ': ['...', '...', '...', '...', '...'],
};
const plain = (text: string) => text.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** How many tiles a word takes along a wall (4 art pixels a letter, its gap included). */
export const textLength = (text: string) => (plain(text).length * 4 - 1) / 8;

/** Words in the 3 x 5 font, as five rows of pixels ("#" is ink), one column between letters (the whiteboard writes with it too). */
export function glyphRows(text: string): string[] {
  const letters = [...plain(text)];
  return Array.from({ length: 5 }, (_, line) => letters.map((letter) => (FONT[letter] ?? FONT[' '])[line]).join('.'));
}

/** Words on a wall, their bottom at `bottom`: on a ribbon of `ribbon` one pixel around them when given. */
export function wallText(context: Context, text: string, wall: Wall, from: number, bottom: number, ink: string, ribbon?: string) {
  const rows = glyphRows(text);
  if (ribbon) {
    const width = rows[0].length + 4;
    onWall(context, Array.from({ length: 7 }, () => 'r'.repeat(width)), { r: ribbon }, wall, from - 2 / 8, bottom - 1);
  }
  onWall(context, rows, { '#': ink }, wall, from, bottom);
}

/** A wire hanging between hooks, `sag` art pixels lower between them; returns the points where it is lowest and the hooks. */
export function sagging(context: Context, wall: Wall, from: number, to: number, z: number, step: number, sag: number, colour: string): { along: number; z: number }[] {
  const points: { along: number; z: number }[] = [];
  for (let along = from; along <= to + 1e-6; along += step / 2) points.push({ along, z: z - (points.length % 2 ? sag : 0) });
  points.forEach((point, index) => { if (index) line(context, onWallAt(wall, points[index - 1].along, points[index - 1].z), onWallAt(wall, point.along, point.z), colour); });
  return points;
}

/** A string of little triangular flags along a wall, hanging from a sagging cord. */
export function bunting(context: Context, wall: Wall, from: number, to: number, z: number, colours: readonly string[], cord: string) {
  const flags = Math.floor((to - from) / 0.5);
  for (let index = 0; index < flags; index++) {
    const along = from + index * 0.5;
    const top = z - Math.round(Math.sin(((index + 0.5) / flags) * Math.PI * Math.max(1, Math.round(flags / 6))) ** 2 * 2);
    const colour = colours[index % colours.length];
    line(context, onWallAt(wall, along, top), onWallAt(wall, along + 0.5, top), cord);
    for (let row = 1; row <= 4; row++) for (let column = row - 1; column <= 5 - row; column++) dot(context, onWallAt(wall, along + (column + 0.5) / 8 + 0.06, top - row), colour);
  }
}

/** A filled disc on a wall, `radius` in art pixels (a painted plate, a sun, a heart's lobes). */
export function disc(context: Context, wall: Wall, along: number, z: number, radius: number, colour: string) {
  for (let up = -radius; up <= radius; up++) for (let across = -radius; across <= radius; across++) {
    if (across * across + up * up <= radius * radius + 0.5) dot(context, onWallAt(wall, along + across / 8, z + up), colour);
  }
}
