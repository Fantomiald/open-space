// The neon signs of the Tokyo street (tokyo.ts): real katakana and pictograms drawn a pixel at a time, painted once on
// the walls and the shop windows, then lit again every frame over the dark (some buzz and stutter now and then).
import { TOKYO_PALETTE as T, type Neon } from '../../design/theme-tokyo.ts';
import { ART_SCALE, fillPolygon } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import { glyphRows, onWallAt, type Context, type Wall } from '../wall-art.ts';

type Rows = readonly string[];

/** Katakana, 7 by 7 ("#" is the tube): enough for ラーメン (ramen), ゲーム (games), カラオケ (karaoke) and ビール (beer). */
const KANA: Readonly<Record<string, Rows>> = {
  ラ: ['.#####.', '.......', '#######', '......#', '.....#.', '...##..', '.##....'],
  ー: ['.......', '.......', '.......', '#######', '.......', '.......', '.......'],
  メ: ['.....#.', '.....#.', '.#..#..', '..##...', '...#...', '..#.#..', '##...#.'],
  ン: ['.......', '##.....', '..#...#', '.....#.', '....#..', '..##...', '##.....'],
  ゲ: ['.#..#.#', '.#.....', '#.#####', '#...#..', '....#..', '...#...', '.##....'],
  ム: ['...#...', '..#....', '..#....', '.#.....', '.#..#..', '#....#.', '#######'],
  カ: ['..#....', '#######', '..#...#', '..#...#', '.#....#', '.#....#', '#...##.'],
  オ: ['....#..', '#######', '....#..', '...##..', '..#.#..', '.#..#..', '#..##..'],
  ケ: ['.#.....', '.#.....', '#.#####', '#...#..', '....#..', '...#...', '.##....'],
  ビ: ['#...#.#', '#....#.', '#..##..', '###....', '#......', '#......', '.#####.'],
  ル: ['.#..#..', '.#..#..', '.#..#..', '.#..#..', '.#..#.#', '#...##.', '#...#..'],
};
/** The long vowel mark of a word written downwards. */
const LONG_DOWN = ['...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...'];

/** Pictograms in the same tubes. */
export const PICTOS = {
  bowl: ['....#.#', '...#.#.', '#######', '#######', '.#####.', '..###..'],
  cocktail: ['#######', '.#...#.', '..#.#..', '...#...', '...#...', '...#...', '.#####.'],
  invader: ['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'],
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  chevron: ['...#', '..##', '.###', '####', '.###', '..##', '...#'],
} as const satisfies Record<string, Rows>;

/** The katakana of a word, one glyph each; written downwards, the long vowel mark turns. */
export const kana = (word: string, down = false): Rows[] => [...word].map((letter) => (down && letter === 'ー' ? LONG_DOWN : KANA[letter] ?? KANA.ー));
/** Capitals in the walls' 3 by 5 font, one glyph each. */
export const letters = (text: string): Rows[] => [...text].map((letter) => glyphRows(letter));

/**
 * Glyphs on a wall, side by side (or one under the other, `down`), the first one at `from` along the wall, the bottom
 * at `bottom` art pixels up. Each glyph stands square to the screen and only their row follows the wall's slant: a
 * glyph slanted with the wall does not read at this size. On the left wall they read from the front of the room to
 * the back, like the back wall from left to right.
 */
export interface Placed { wall: Wall; from: number; bottom: number; glyphs: readonly Rows[]; down?: boolean }

/** A sign: its glyphs in a neon tube, on a dark board or not; a `faulty` tube stutters now and then. */
export interface Sign extends Placed { neon: Neon; faulty?: boolean; board?: boolean }

const GAP = 1;
/** Where along the wall a column (counted from `from`, one art pixel each) is. */
const alongAt = (wall: Wall, from: number, column: number) => (wall === 'back' ? from + column / 8 : from - column / 8);
export const widthOf = (placed: Pick<Placed, 'glyphs' | 'down'>) => (placed.down ? Math.max(...placed.glyphs.map((rows) => rows[0].length)) : placed.glyphs.reduce((sum, rows) => sum + rows[0].length, 0) + GAP * (placed.glyphs.length - 1));
const heightOf = (placed: Pick<Placed, 'glyphs' | 'down'>) => (placed.down ? placed.glyphs.reduce((sum, rows) => sum + rows.length, 0) + GAP * (placed.glyphs.length - 1) : Math.max(...placed.glyphs.map((rows) => rows.length)));

/** What a placed sprite covers: along the wall, both ends, and its lowest and highest art pixels. */
export function boundsOf(placed: Placed) {
  const width = widthOf(placed), start = placed.down ? -width / 2 : 0;
  const ends = [alongAt(placed.wall, placed.from, start), alongAt(placed.wall, placed.from, start + width)];
  return { from: Math.min(...ends), to: Math.max(...ends), low: placed.bottom, high: placed.bottom + heightOf(placed) };
}

interface Pixel { x: number; y: number; letter: string }
const pixelCache = new WeakMap<Placed, Pixel[]>();

/** Every pixel of a placed sprite, in art pixels of the room, with its letter. */
function pixelsOf(placed: Placed): Pixel[] {
  let pixels = pixelCache.get(placed);
  if (pixels) return pixels;
  pixels = [];
  const height = heightOf(placed);
  let cursor = 0;
  for (const rows of placed.glyphs) {
    const width = rows[0].length;
    // the glyph's foot, on the wall under its middle; its rows straight up from there
    const middle = placed.down ? 0 : cursor + width / 2;
    const raise = placed.down ? height - cursor - rows.length : Math.floor((height - rows.length) / 2);
    const foot = onWallAt(placed.wall, alongAt(placed.wall, placed.from, middle), placed.bottom + raise);
    const left = Math.round(foot.x - width / 2), bottom = Math.round(foot.y);
    for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
      if (letter !== '.') pixels!.push({ x: left + column, y: bottom - (rows.length - 1 - line), letter });
    });
    cursor += (placed.down ? rows.length : width) + GAP;
  }
  pixelCache.set(placed, pixels);
  return pixels;
}

/** A placed sprite painted once, at art resolution; `paint` gives each letter its colour. */
export function paintPlaced(context: Context, placed: Placed, paint: Readonly<Record<string, string>>) {
  for (const { x, y, letter } of pixelsOf(placed)) {
    const colour = paint[letter];
    if (!colour) continue;
    context.fillStyle = colour;
    context.fillRect(x, y, 1, 1);
  }
}

/** A placed sprite shining over the dark, every frame, in room pixels: its lit letters, and a halo one art pixel around them. */
export function glowPlaced(context: Context, placed: Placed, paint: Readonly<Record<string, string>>, halo?: string) {
  const pixels = pixelsOf(placed).filter(({ letter }) => paint[letter]);
  if (halo) {
    const lit = new Set(pixels.map(({ x, y }) => `${x},${y}`));
    const around = new Set<string>();
    for (const { x, y } of pixels) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!lit.has(`${x + dx},${y + dy}`)) around.add(`${x + dx},${y + dy}`);
    context.globalAlpha = 0.38;
    context.fillStyle = halo;
    for (const key of around) {
      const [x, y] = key.split(',').map(Number);
      context.fillRect(x * ART_SCALE, y * ART_SCALE, ART_SCALE, ART_SCALE);
    }
    context.globalAlpha = 1;
  }
  for (const { x, y, letter } of pixels) {
    context.fillStyle = paint[letter];
    context.fillRect(x * ART_SCALE, y * ART_SCALE, ART_SCALE, ART_SCALE);
  }
}

/** The sign as it hangs on the wall, painted once: its board, and its tubes lit. */
export function paintSign(context: Context, sign: Sign) {
  if (sign.board) {
    const { from, to, low, high } = boundsOf(sign);
    const quad = (fromAlong: number, toAlong: number, fromZ: number, toZ: number, colour: string) =>
      fillPolygon(context, [onWallAt(sign.wall, fromAlong, fromZ), onWallAt(sign.wall, toAlong, fromZ), onWallAt(sign.wall, toAlong, toZ), onWallAt(sign.wall, fromAlong, toZ)], colour);
    quad(from - 3 / 8, to + 3 / 8, low - 3, high + 2, T.signRim);
    quad(from - 2 / 8, to + 2 / 8, low - 2, high + 1, T.signBoard);
  }
  paintPlaced(context, sign, { '#': sign.neon.colour });
}

/** Whether a faulty tube is lit at `time` (ms): every few seconds it stutters for a moment. */
export function isLit(seed: string, time: number): boolean {
  if (!time) return true;
  const cycle = Math.floor(time / 3600);
  const frame = Math.floor((time % 3600) / 70);
  const start = pick(`${seed}:${cycle}`, 44);
  if (frame < start || frame > start + 7) return true;
  return pick(`${seed}:${Math.floor(time / 70)}`, 3) > 0;
}

/** The sign lit over the dark, or its dead glass while a faulty tube stutters. */
export function glowSign(context: Context, sign: Sign, time: number) {
  if (sign.faulty && !isLit(`${sign.wall}${sign.from}`, time)) glowPlaced(context, sign, { '#': sign.neon.off });
  else glowPlaced(context, sign, { '#': sign.neon.colour }, sign.neon.halo);
}

/** Rows on a wall, slanted with it, one letter a pixel (the walls' 3 by 5 font reads well slanted); `paint` gives each letter its colour. */
export function onWallRows(context: Context, rows: Rows, paint: Readonly<Record<string, string>>, wall: Wall, from: number, bottom: number) {
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
    const colour = paint[letter];
    if (!colour) return;
    const point = onWallAt(wall, alongAt(wall, from, column), bottom + rows.length - 1 - line);
    context.fillStyle = colour;
    context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
  });
}

/** The same rows lit every frame over the dark, in room pixels. */
export function glowRows(context: Context, rows: Rows, paint: Readonly<Record<string, string>>, wall: Wall, from: number, bottom: number) {
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
    const colour = paint[letter];
    if (!colour) return;
    const point = onWallAt(wall, alongAt(wall, from, column), bottom + rows.length - 1 - line);
    context.fillStyle = colour;
    context.fillRect(Math.round(point.x) * ART_SCALE, Math.round(point.y) * ART_SCALE, ART_SCALE, ART_SCALE);
  });
}
