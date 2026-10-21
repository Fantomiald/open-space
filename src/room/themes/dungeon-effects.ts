// What moves and glows in the dungeon, every frame after the light of the hour (so it shines in the dark), in room
// pixels, each effect behind whoever stands in front of it: the torches' flames and sparks, the candles, the brazier's fire, the cauldron's bubbles and fumes, spores
// over the mushrooms, glints on the gold, the swirl in the crystal ball, the mirror's stars. And the lights of it all.
import { DUNGEON_PALETTE as D } from '../../design/theme-dungeon.ts';
import type { FurniturePiece, Layout } from '../../../shared/room-layout.ts';
import { toScreen, type Point } from '../geometry.ts';
import type { Lighting } from '../lighting.ts';
import { ART_SCALE } from '../pixel-art.ts';
import { furnitureDepth } from '../pixel-furniture.ts';
import { pick } from '../sky.ts';
import { roomPointOnWall, type Context } from '../wall-art.ts';
import { WALL_EFFECT, type ThemeEffect, type ThemeLight } from './kit.ts';
import { torchesOf } from './dungeon-art.ts';
import { BRAZIER, BREW, CANDLES, CRYSTAL_BALL, GIANT_CAP, mushroomKind, type PieceSpot } from './dungeon-furniture.ts';

/** Where a torch's flame starts, in art pixels up the wall (just over its head, see SCONCE in dungeon.ts). */
const TORCH_FLAME = 36;

/** A point of a piece in room pixels, on the grid of art pixels. */
function onPiece(piece: FurniturePiece, spot: PieceSpot): Point {
  const base = toScreen({ x: piece.x + spot.x, y: piece.y + spot.y });
  return { x: Math.round(base.x / ART_SCALE) * ART_SCALE, y: Math.round((base.y - spot.z * ART_SCALE) / ART_SCALE) * ART_SCALE };
}

function px(context: Context, x: number, y: number, colour: string, size = ART_SCALE) {
  context.fillStyle = colour;
  context.fillRect(Math.round(x), Math.round(y), size, size);
}

/**
 * A flame standing on `base`: columns `half` art pixels each side of it, the middle ones the tallest, each licking up
 * and down on its own beat; white and yellow at its heart, orange, then red at its tips.
 */
function fire(context: Context, base: Point, half: number, height: number, time: number, seed: number) {
  const [red, orange, yellow, white] = D.flame;
  for (let across = -half; across <= half; across++) {
    const profile = 1 - (Math.abs(across) / (half + 1)) ** 2;
    const lick = 0.78 + 0.16 * Math.sin(time / 95 + across * 1.9 + seed) + 0.1 * Math.sin(time / 51 + across * 3.3 + seed * 2);
    const tall = Math.max(1, Math.round(height * profile * lick));
    for (let up = 0; up < tall; up++) {
      const share = up / tall;
      const heart = Math.abs(across) <= half * 0.5 * (1 - share) + 0.2;
      const colour = share > 0.72 ? red : !heart ? orange : share < 0.35 && Math.abs(across) <= half / 3 ? white : yellow;
      px(context, base.x + across * ART_SCALE, base.y - (up + 1) * ART_SCALE, colour);
    }
  }
}

/** Sparks flying up from a fire and fading. */
function sparks(context: Context, base: Point, count: number, rise: number, time: number, seed: number) {
  for (let index = 0; index < count; index++) {
    const age = (time / 1500 + index / count + (seed % 97) / 97) % 1;
    context.globalAlpha = 1 - age;
    const sway = Math.sin(age * 7 + index * 2 + seed) * 4;
    px(context, base.x + sway + ((index * 5) % 7) - 3, base.y - age * rise, D.flame[index % 2 ? 1 : 2]);
  }
  context.globalAlpha = 1;
}

/** A candle's flame: two art pixels that sway and flicker. */
function candleFlame(context: Context, base: Point, time: number, seed: number) {
  const sway = Math.floor(time / 210 + seed) % 5 === 0 ? ART_SCALE / 2 : 0;
  px(context, base.x, base.y - ART_SCALE, D.flame[2]);
  px(context, base.x + sway, base.y - ART_SCALE * 2, Math.floor(time / 160 + seed) % 3 ? D.flame[1] : D.flame[3]);
}

/** Bubbles rising in the cauldron and bursting, and green fumes curling up from it. */
function brew(context: Context, base: Point, time: number, seed: number) {
  for (let index = 0; index < 5; index++) {
    const period = 900 + index * 170;
    const age = ((time + index * 337 + seed) % period) / period;
    const spot = pick(`bubble${index}${Math.floor((time + index * 337 + seed) / period)}`, 15);
    const x = base.x + ((spot % 5) - 2) * 3 * ART_SCALE / 2, y = base.y + ((spot % 3) - 1) * ART_SCALE / 2;
    if (age < 0.6) px(context, x, y - ART_SCALE / 2, D.bubble, age < 0.3 ? ART_SCALE / 2 + 1 : ART_SCALE);
    else if (age < 0.8) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) px(context, x + dx * ART_SCALE, y + dy * ART_SCALE - ART_SCALE, D.bubble, ART_SCALE / 2);
  }
  for (let index = 0; index < 4; index++) {
    const age = (time / 2600 + index / 4 + (seed % 13) / 13) % 1;
    context.globalAlpha = 0.55 * (1 - age);
    px(context, base.x + Math.sin(age * 6 + index * 1.7) * 6, base.y - ART_SCALE * 2 - age * 30, index % 2 ? D.brew : D.bubble);
  }
  context.globalAlpha = 1;
}

/** Spores drifting up slowly above glowing mushrooms, fading in and out. */
function spores(context: Context, base: Point, count: number, colour: string, time: number, seed: number) {
  for (let index = 0; index < count; index++) {
    const age = (time / 5200 + index / count + (seed % 31) / 31) % 1;
    context.globalAlpha = Math.sin(age * Math.PI) * 0.9;
    px(context, base.x + Math.sin(age * 5 + index * 2.3 + seed) * 9, base.y - age * 26, colour, ART_SCALE / 2 + 1);
  }
  context.globalAlpha = 1;
}

/** A glint: a little four-pointed star that comes and goes. */
function glint(context: Context, at: Point, colour: string, strength: number) {
  if (strength <= 0) return;
  context.globalAlpha = Math.min(1, strength);
  px(context, at.x, at.y, colour);
  if (strength > 0.5) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) px(context, at.x + dx * ART_SCALE, at.y + dy * ART_SCALE, colour, ART_SCALE / 2 + 1);
  context.globalAlpha = 1;
}

/** Everything that moves and glows, each effect at the depth of what it sits on or in, so people in front of it hide it. */
export function dungeonEffects(layout: Layout, time: number): ThemeEffect[] {
  const effects: ThemeEffect[] = [];
  const add = (depth: number, paint: (context: Context) => void) => effects.push({ depth, paint });
  for (const [index, torch] of torchesOf(layout).entries()) {
    const point = roomPointOnWall(torch.wall, torch.along, TORCH_FLAME);
    const base = { x: Math.round(point.x / ART_SCALE) * ART_SCALE, y: Math.round(point.y / ART_SCALE) * ART_SCALE };
    add(WALL_EFFECT, (context) => { fire(context, base, 1, 6, time, index * 1.7); sparks(context, base, 3, 34, time, index * 13); });
  }
  for (const piece of layout.furniture) {
    const seed = pick(`${piece.x},${piece.y}`, 1000);
    const onThis = (paint: (context: Context) => void) => add(furnitureDepth(piece), paint);
    for (const [index, spot] of (CANDLES[piece.kind] ?? []).entries()) onThis((context) => candleFlame(context, onPiece(piece, spot), time, seed + index * 3));
    if (piece.kind === 'floorLamp') {
      const base = onPiece(piece, BRAZIER);
      onThis((context) => { fire(context, base, 3, 9, time, seed); sparks(context, { x: base.x, y: base.y - 10 }, 5, 50, time, seed); });
    }
    if (piece.kind === 'cooler') onThis((context) => brew(context, onPiece(piece, BREW), time, seed));
    if (piece.kind === 'plant') onThis((context) => spores(context, onPiece(piece, { x: 0.45, y: 0.45, z: 17 }), 3, D.light.mushrooms[mushroomKind(piece)], time, seed));
    if (piece.kind === 'bigPlant') onThis((context) => spores(context, onPiece(piece, { ...GIANT_CAP, z: GIANT_CAP.z + 7 }), 5, D.light.mushrooms[0], time, seed));
    if (piece.kind === 'lowTable') {
      // one glint at a time, wandering over the gold
      const round = Math.floor(time / 700 + seed);
      const spot = { x: 0.3 + (pick(`glint${round}`, 100) / 100) * (piece.width - 0.6), y: 0.3 + (pick(`glinty${round}`, 100) / 100) * (piece.depth - 0.6), z: 7 };
      onThis((context) => glint(context, onPiece(piece, spot), D.goldLight, Math.sin(((time / 700 + seed) % 1) * Math.PI) * 1.4));
    }
    if (piece.kind === 'bossDesk') {
      // a mote of light circling inside the crystal ball
      const centre = onPiece(piece, CRYSTAL_BALL);
      const angle = time / 600;
      onThis((context) => {
        px(context, centre.x + Math.round(Math.cos(angle) * 2) * ART_SCALE, centre.y + Math.round(Math.sin(angle) * 1.5) * ART_SCALE, D.mirrorStar);
        px(context, centre.x - Math.round(Math.cos(angle) * 2) * ART_SCALE, centre.y - Math.round(Math.sin(angle) * 1.5) * ART_SCALE, D.mirrorMist);
      });
    }
  }
  for (const item of layout.wallItems) {
    if (item.kind !== 'tv') continue;
    for (let index = 0; index < 4; index++) {
      const round = Math.floor(time / 900 + index * 0.25);
      const along = item.fromX + 0.8 + (pick(`star${index}${round}`, 100) / 100) * (item.width - 1.6);
      const at = roomPointOnWall('back', along, 22 + pick(`starz${index}${round}`, 12));
      add(WALL_EFFECT, (context) => glint(context, at, D.mirrorStar, Math.sin(((time / 900 + index * 0.25) % 1) * Math.PI) * 1.2));
    }
  }
  return effects;
}

/** The lights of the dungeon: torches, the crystals through the windows, candles, the brazier, the brew, mushrooms, gold. */
export function dungeonLights(layout: Layout, _lighting: Lighting): ThemeLight[] {
  const lights: ThemeLight[] = torchesOf(layout).map(({ wall, along }) => ({
    x: wall === 'back' ? along : 0.25, y: wall === 'back' ? 0.25 : along, height: TORCH_FLAME * ART_SCALE + 4, radius: 130, colour: D.light.torch, strength: 0.9,
  }));
  for (const item of layout.wallItems) {
    if (item.kind === 'window') lights.push({ x: item.fromX + item.width / 2, y: 0.3, height: 52, radius: 110, colour: D.light.crystal, strength: 0.3 });
    if (item.kind === 'tv') lights.push({ x: item.fromX + item.width / 2, y: 0.5, height: 54, radius: 120, colour: D.light.arcane, strength: 0.45 });
    if (item.kind === 'clock') lights.push({ x: item.fromX + item.width / 2, y: 0.2, height: 64, radius: 40, colour: D.rune, strength: 0.35 });
  }
  const at = (piece: FurniturePiece, spot: PieceSpot, radius: number, colour: string, strength: number): ThemeLight =>
    ({ x: piece.x + spot.x, y: piece.y + spot.y, height: spot.z * ART_SCALE + 4, radius, colour, strength });
  for (const piece of layout.furniture) {
    for (const spot of CANDLES[piece.kind] ?? []) lights.push(at(piece, spot, piece.kind === 'whiteboard' ? 110 : 50, D.light.candle, piece.kind === 'whiteboard' ? 0.6 : 0.45));
    if (piece.kind === 'floorLamp') lights.push(at(piece, { ...BRAZIER, z: BRAZIER.z + 6 }, 150, D.light.torch, 0.8));
    if (piece.kind === 'cooler') lights.push(at(piece, { ...BREW, z: BREW.z + 4 }, 100, D.light.brew, 0.85));
    if (piece.kind === 'plant') lights.push(at(piece, { x: 0.5, y: 0.5, z: 12 }, 64, D.light.mushrooms[mushroomKind(piece)], 0.6));
    if (piece.kind === 'bigPlant') lights.push(at(piece, { ...GIANT_CAP, z: GIANT_CAP.z - 4 }, 100, D.light.mushrooms[0], 0.7));
    if (piece.kind === 'lowTable') lights.push(at(piece, { x: piece.width / 2, y: piece.depth / 2, z: 9 }, 60, D.light.gold, 0.45));
    if (piece.kind === 'bossDesk') lights.push(at(piece, CRYSTAL_BALL, 60, D.light.arcane, 0.6));
  }
  return lights;
}
