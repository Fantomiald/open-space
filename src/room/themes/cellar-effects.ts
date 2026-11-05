// What moves and glows in the cellar, every frame after the light of the hour (so it shines in the dark), in room
// pixels, each effect behind whoever stands in front of it: the text on the wall of screens and on the big terminal,
// the blinking LEDs of the racks and routers, the oscilloscope's trace, the bulbs that flicker, water dripping down the
// walls, the coffee's steam. And the lights of it all.
import { CELLAR_PALETTE as K } from '../../design/theme-cellar.ts';
import type { FurniturePiece, Layout, WallItem } from '../../../shared/room-layout.ts';
import { toScreen, type Point } from '../geometry.ts';
import type { Lighting } from '../lighting.ts';
import { ART_SCALE } from '../pixel-art.ts';
import { furnitureDepth } from '../pixel-furniture.ts';
import { pick } from '../sky.ts';
import { glyphRows, roomPointOnWall, type Context } from '../wall-art.ts';
import { WALL_EFFECT, type ThemeEffect, type ThemeLight } from './kit.ts';
import { torchesOf } from './dungeon-art.ts';
import { DESK_LED, LAMP, LEDS, RACK_LEDS, SCOPE, STEAM, WORK_LAMP, type PieceSpot } from './cellar-furniture.ts';

/** The art pixels of a bulb's middle, up the wall (see CAGED_BULB in cellar.ts). */
const BULB_Z = 29;

export interface Screen { column: number; row: number; dead: boolean; kind: 'green' | 'amber' | 'alert' }

/** The screens of a wall of them: `column` from the item's left, `row` up the wall, in art pixels; both rows of a shelf. */
export function screensOf(item: WallItem): Screen[] {
  const { low, cell, rows } = screensOf.grid;
  const across = Math.floor(item.width * 8);
  const columns = Math.floor(across / cell);
  const start = Math.floor((across - columns * cell) / 2);
  const screens: Screen[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const seed = `${item.fromX}:${row}:${column}`;
    const roll = pick(`screen${seed}`, 14);
    screens.push({ column: start + column * cell, row: low + row * cell, dead: roll === 0, kind: roll === 1 ? 'alert' : roll <= 3 ? 'amber' : 'green' });
  }
  return screens;
}
screensOf.grid = { low: 15, high: 41, cell: 12, rows: 2 };

export const TV_SCREEN = { low: 13, high: 41 };

function px(context: Context, x: number, y: number, colour: string, size = ART_SCALE) {
  context.fillStyle = colour;
  context.fillRect(Math.round(x), Math.round(y), size, size);
}

const phosphorOf = (kind: Screen['kind']) => (kind === 'alert' ? K.alert : kind === 'amber' ? K.amber : K.phosphor);

/** Lines of text on a screen (`width` by `height` art pixels, from `at`, its bottom left): they move up a line every beat; a cursor blinks on the last. */
function typing(context: Context, wallAt: (column: number, z: number) => Point, width: number, height: number, time: number, seed: string, colour: string) {
  const beat = 500 + pick(`beat${seed}`, 900);
  const step = Math.floor(time / beat);
  for (let row = 0; row < height; row += 2) {
    const line = step + Math.floor((height - row) / 2);
    if (pick(`gap${seed}${line}`, 7) === 0) continue;
    const indent = pick(`indent${seed}${line}`, 3);
    const length = 2 + pick(`length${seed}${line}`, Math.max(1, width - 2 - indent));
    for (let column = indent; column < Math.min(width, indent + length); column++) {
      if (pick(`space${seed}${line},${column}`, 5) === 0) continue;
      const at = wallAt(column, row);
      px(context, at.x, at.y, row === 0 ? K.phosphorBright : colour);
    }
    if (row === 0 && Math.floor(time / 450) % 2) { const at = wallAt(indent + length, row); px(context, at.x, at.y, K.phosphorBright); }
  }
}

function screenWall(context: Context, item: WallItem, time: number) {
  const { cell } = screensOf.grid;
  for (const screen of screensOf(item)) {
    if (screen.dead) continue;
    const seed = `${item.fromX}:${screen.column}:${screen.row}`;
    const wallAt = (column: number, z: number) => roomPointOnWall('back', item.fromX + (screen.column + 2 + column) / 8, screen.row + 3 + z);
    typing(context, wallAt, cell - 4, cell - 5, time, seed, phosphorOf(screen.kind));
  }
}

const TV_LINES = ['$ ./RUN.SH', 'NET ... OK', 'AGENTS OK', '', '', ''];

/** The big terminal: its log typed out line by line, then a bar that fills, over and over. */
function bigTerminal(context: Context, item: WallItem, time: number) {
  const { high } = TV_SCREEN;
  const across = Math.floor(item.width * 8);
  const write = (text: string, column: number, z: number, colour: string) => {
    for (const [row, pixels] of glyphRows(text).entries()) [...pixels].forEach((pixel, index) => {
      if (pixel !== '#' || column + index >= across - 2) return;
      const at = roomPointOnWall('back', item.fromX + (column + index) / 8, z - row);
      px(context, at.x, at.y, colour);
    });
  };
  const beat = (time / 900) % (TV_LINES.length + 3);
  const shown = Math.floor(beat);
  // one line of the small font takes 6 art pixels
  for (const [index, text] of TV_LINES.slice(0, Math.min(shown, 3)).entries()) write(text, 2, high - 2 - index * 6, K.phosphor);
  const share = Math.min(1, Math.max(0, (beat - 3) / (TV_LINES.length - 1)));
  const barZ = high - 22;
  for (let column = 2; column < across - 2; column++) {
    const filled = (column - 2) / (across - 4) <= share;
    if (!filled && column % 2) continue;
    const at = roomPointOnWall('back', item.fromX + column / 8, barZ);
    px(context, at.x, at.y, filled ? K.phosphorBright : K.phosphorDim);
  }
}

/** A point of a piece in room pixels, on the grid of art pixels. */
function onPiece(piece: FurniturePiece, spot: PieceSpot): Point {
  const base = toScreen({ x: piece.x + spot.x, y: piece.y + spot.y });
  return { x: Math.round(base.x / ART_SCALE) * ART_SCALE, y: Math.round((base.y - spot.z * ART_SCALE) / ART_SCALE) * ART_SCALE };
}

const LED_COLOURS = [K.led.green, K.led.green, K.led.green, K.led.amber, K.led.blue];

/** An LED on a piece, blinking on its own beat: some nearly always on, some busy, some rarely. */
function led(context: Context, at: Point, time: number, seed: string, colour?: string) {
  const beat = 120 + pick(`ledbeat${seed}`, 900);
  if (pick(`ledon${seed}${Math.floor(time / beat)}`, 4) === 0) return;
  px(context, at.x, at.y, colour ?? LED_COLOURS[pick(`ledcolour${seed}`, LED_COLOURS.length)], ART_SCALE);
}

/** How bright a bulb is at `time`: steady, with a stutter now and then. */
function flicker(time: number, seed: number) {
  const round = Math.floor(time / 140 + seed);
  return pick(`stutter${Math.floor(round / 24)}:${seed}`, 5) === 0 && pick(`flick${round}`, 2) === 0 ? 0.35 : 1;
}

/** A drop of water falling from a pipe, and its splash at the foot of the wall. */
function drip(context: Context, along: number, wall: 'back' | 'left', time: number, seed: number) {
  const period = 3400 + (seed % 7) * 500;
  const age = ((time + seed * 311) % period) / period;
  if (age < 0.8) return;
  const fall = (age - 0.8) / 0.2;
  const at = roomPointOnWall(wall, along, 46 * (1 - fall * fall));
  px(context, at.x, at.y, K.textBright, ART_SCALE / 2 + 1);
}

function steam(context: Context, base: Point, time: number, seed: number) {
  for (let index = 0; index < 3; index++) {
    const age = (time / 2400 + index / 3 + (seed % 13) / 13) % 1;
    context.globalAlpha = 0.5 * (1 - age);
    px(context, base.x + Math.sin(age * 6 + index * 2) * 4, base.y - age * 22, K.paper);
  }
  context.globalAlpha = 1;
}

function scope(context: Context, piece: FurniturePiece, time: number) {
  const steps = 6;
  for (let step = 0; step < steps; step++) {
    const wave = Math.sin(time / 180 + step * 1.3) * 1.2;
    const at = onPiece(piece, { x: SCOPE.fromX + (step / steps) * (SCOPE.toX - SCOPE.fromX), y: SCOPE.y, z: SCOPE.z + wave });
    px(context, at.x, at.y, K.phosphor);
  }
}

export function cellarEffects(layout: Layout, time: number): ThemeEffect[] {
  const effects: ThemeEffect[] = [];
  const add = (depth: number, paint: (context: Context) => void) => effects.push({ depth, paint });
  for (const item of layout.wallItems) {
    if (item.kind === 'window') add(WALL_EFFECT, (context) => screenWall(context, item, time));
    if (item.kind === 'tv') add(WALL_EFFECT, (context) => bigTerminal(context, item, time));
  }
  for (const [index, bulb] of torchesOf(layout).entries()) {
    const point = roomPointOnWall(bulb.wall, bulb.along, BULB_Z);
    add(WALL_EFFECT, (context) => {
      context.globalAlpha = 0.28 * flicker(time, index);
      context.fillStyle = K.light.bulb;
      context.fillRect(point.x - 5, point.y - 5, 10, 10);
      context.globalAlpha = 1;
      if (flicker(time, index) === 1) px(context, point.x - 1, point.y - 1, K.bulbCore);
    });
  }
  for (const [index, along] of [2.4, 6.3, 13.9, 18.4].entries()) add(WALL_EFFECT, (context) => drip(context, along, 'back', time, index + 1));
  add(WALL_EFFECT, (context) => drip(context, 5.2, 'left', time, 7));
  for (const piece of layout.furniture) {
    const seed = pick(`${piece.x},${piece.y}`, 1000);
    const onThis = (paint: (context: Context) => void) => add(furnitureDepth(piece), paint);
    for (const [index, spot] of (LEDS[piece.kind] ?? []).entries()) onThis((context) => led(context, onPiece(piece, spot), time, `${seed}:${index}`));
    if (piece.kind === 'bigPlant') for (const spot of RACK_LEDS) onThis((context) => led(context, onPiece(piece, spot), time, `${seed}:${spot.x}:${spot.z}`));
    if (piece.kind === 'desk') onThis((context) => led(context, onPiece(piece, DESK_LED), time, `${seed}desk`));
    if (piece.kind === 'counter') {
      onThis((context) => { scope(context, piece, time); steam(context, onPiece(piece, STEAM), time, seed); });
    }
    if (piece.kind === 'floorLamp') {
      const at = onPiece(piece, WORK_LAMP);
      onThis((context) => {
        context.globalAlpha = 0.25 * flicker(time, seed);
        context.fillStyle = K.light.bulb;
        context.fillRect(at.x - 6, at.y - 6, 14, 14);
        context.globalAlpha = 1;
        px(context, at.x, at.y, K.bulbCore);
      });
    }
    if (piece.kind === 'bossDesk') onThis((context) => { const at = onPiece(piece, { ...LAMP, z: LAMP.z - 1 }); px(context, at.x, at.y, K.bulbCore); });
  }
  return effects;
}

/** The lights of the cellar: mostly green, the bulbs and the work lamp a little warmth. */
export function cellarLights(layout: Layout, _lighting: Lighting): ThemeLight[] {
  const lights: ThemeLight[] = torchesOf(layout).map(({ wall, along }) => ({
    x: wall === 'back' ? along : 0.25, y: wall === 'back' ? 0.25 : along, height: BULB_Z * ART_SCALE + 4, radius: 120, colour: K.light.bulb, strength: 0.65,
  }));
  for (const item of layout.wallItems) {
    if (item.kind === 'window') lights.push({ x: item.fromX + item.width / 2, y: 0.4, height: 56, radius: 150, colour: K.light.screen, strength: 0.55 });
    if (item.kind === 'tv') lights.push({ x: item.fromX + item.width / 2, y: 0.5, height: 54, radius: 170, colour: K.light.screen, strength: 0.7 });
    if (item.kind === 'clock') lights.push({ x: item.fromX + item.width / 2, y: 0.2, height: 62, radius: 36, colour: K.light.exit, strength: 0.4 });
  }
  const at = (piece: FurniturePiece, spot: PieceSpot, radius: number, colour: string, strength: number): ThemeLight =>
    ({ x: piece.x + spot.x, y: piece.y + spot.y, height: spot.z * ART_SCALE + 4, radius, colour, strength });
  for (const piece of layout.furniture) {
    if (piece.kind === 'floorLamp') lights.push(at(piece, WORK_LAMP, 170, K.light.bulb, 0.9));
    if (piece.kind === 'bigPlant') lights.push(at(piece, { x: 0.5, y: 1, z: 22 }, 90, K.light.screen, 0.55));
    if (piece.kind === 'bossDesk') lights.push(at(piece, LAMP, 90, K.light.bulb, 0.8));
    if (piece.kind === 'counter') lights.push(at(piece, { x: SCOPE.fromX, y: SCOPE.y, z: SCOPE.z }, 70, K.light.screen, 0.6));
    if (piece.kind === 'cooler') lights.push(at(piece, { x: 0.5, y: 0.9, z: 10 }, 44, K.light.fridge, 0.35));
  }
  return lights;
}
