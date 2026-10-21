// The beach bar's furniture (themes/kit.ts): desks of surfboards on driftwood trestles, the user's desk a little tiki
// bar, bamboo deckchairs in striped canvas, dwarf palms and cacti in pots, a coconut palm, a surf shack's shelf of
// towels and buckets, daybeds heaped with cushions, driftwood tables with cocktails and a cooler box, tiki torches, a
// dispenser of lemon water, the board between two surfboards, a bamboo bar under a thatch skirt. Then the flames that
// move every frame, and the lights.
import { ROOM_PALETTE } from '../../design/room-palette.ts';
import { BEACH_FURNITURE as F } from '../../design/theme-beach.ts';
import type { FurniturePiece, Layout, PieceKind } from '../../../shared/room-layout.ts';
import { toScreen, type Point } from '../geometry.ts';
import { furnitureDepth, writeOnBoard, type Design, type Painter } from '../pixel-furniture.ts';
import { ART_SCALE, tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import type { ThemeEffect, ThemeLight } from './kit.ts';

type Context = CanvasRenderingContext2D;
interface Spot { x: number; y: number }

/* Shapes */

/** An upright cylinder around a floor point, `radius` art pixels across, its round top in `top`. */
function cylinder(p: Painter, middle: Spot, z: number, height: number, radius: number, colour: string, top?: string) {
  const colours = tones(colour);
  for (let across = -radius; across < radius; across++) {
    const front = Math.round((radius / 2) * Math.sqrt(1 - ((across + 0.5) / radius) ** 2));
    const side = across < -radius * 0.6 ? colours.light : across >= radius * 0.35 ? colours.shade : colours.base;
    for (let up = z - front; up < z + height - front; up++) p.upright(across, up, side, middle);
    for (let up = z + height - front; up <= z + height + front; up++) p.upright(across, up, top ?? colours.light, middle);
  }
}

/** A line on top of a box, along x at `y` (a stringer, a seam). */
const alongTop = (p: Painter, y: number, fromX: number, toX: number, z: number, colour: string) => p.box(fromX, y, toX - fromX, 0.04, z, 0, colour, colour);

/** A palm frond from (across, z) on the upright plane: it rises along (`rise`, `lift`), bends down, its leaflets hanging under it. */
function frond(p: Painter, middle: Spot, across: number, z: number, rise: number, lift: number, length: number) {
  const droop = 0.85 / length;
  for (let step = 0; step <= length; step++) {
    const x = Math.round(across + rise * step), up = Math.round(z + lift * step - droop * step * step);
    p.upright(x, up, step > length - 2 ? F.leafLight : F.leaf, middle);
    if (step > 1 && step < length - 1) p.upright(x, up + 1, F.leafLight, middle);
    if (step >= 2) {
      p.upright(x, up - 1, F.leafDark, middle);
      if (step % 2 === 0 && step < length) p.upright(x, up - 2, F.leafDark, middle);
    }
  }
}

/** A crown of fronds all round a point, `size` the length of the longest. */
function crown(p: Painter, middle: Spot, z: number, size: number) {
  for (const [rise, lift, share] of [[-0.6, 0.5, 0.75], [0.6, 0.5, 0.75], [-1, 0.45, 1], [1, 0.45, 1], [-0.3, 0.8, 0.65], [0.35, 0.75, 0.65], [-1, 0.05, 0.85], [1, 0.1, 0.85], [-0.8, -0.2, 0.6], [0.8, -0.15, 0.6]] as const) {
    frond(p, middle, 0, z, rise, lift, Math.round(size * share));
  }
}

/** Something to drink standing on a top at `z`: a coconut with a straw, or a glass of cocktail with its umbrella. */
function coconut(p: Painter, x: number, y: number, z: number) {
  p.ball(x, y, z + 2, 2.2, 2, F.coconut);
  p.upright(0, z + 4, F.coconutFlesh, { x, y });
  p.upright(-1, z + 4, F.coconutFlesh, { x, y });
  for (let up = 4; up < 7; up++) p.upright(1, z + up, F.straw, { x, y });
  p.upright(2, z + 7, F.straw, { x, y });
}
function cocktail(p: Painter, x: number, y: number, z: number, colour: string) {
  const middle = { x, y };
  p.upright(0, z, F.glass, middle);
  p.upright(0, z + 1, F.glass, middle);
  for (const across of [-1, 0, 1]) for (const up of [2, 3, 4]) p.upright(across, z + up, up === 4 ? tones(colour).light : colour, middle);
  p.upright(2, z + 4, F.lime, middle);
  for (let up = 5; up < 8; up++) p.upright(-1, z + up, F.bamboo, middle);
  for (const across of [-3, -2, -1, 0, 1]) p.upright(across, z + 8, across % 2 ? F.umbrella : F.umbrellaAlt, middle);
  for (const across of [-2, -1, 0]) p.upright(across, z + 9, F.umbrella, middle);
}

/** A laptop where the office's is (its box kept: hands type there), silver, a sticker on its lid. */
function laptop(p: Painter, fromX: number, toX: number, depth: number, sticker: string) {
  p.box(fromX, 0.2, toX - fromX, depth, 11, 1, F.laptop);
  p.box(fromX, 0.55, toX - fromX, 0.06, 12, 5, F.laptop);
  const middle = (fromX + toX) / 2;
  p.onFront(0.61, middle - 0.06, middle + 0.06, 14, 16, sticker);
  p.onFront(0.61, middle - 0.02, middle + 0.02, 14.5, 15.5, F.mug);
}

/** Canes of bamboo standing side by side on the front (+y) face at `y`, from `fromX` to `toX`, `low` to `high`, a ring across them. */
function canes(p: Painter, y: number, fromX: number, toX: number, low: number, high: number) {
  for (let x = fromX, index = 0; x < toX - 0.01; x += 0.12, index++) p.onFront(y, x, Math.min(toX, x + 0.1), low, high, index % 2 ? F.bamboo : tones(F.bamboo).light);
  p.onFront(y, fromX, toX, (low + high) / 2, (low + high) / 2 + 0.6, F.bambooNode);
}
/** The same on the side (+x) face at `x`. */
function canesOnSide(p: Painter, x: number, fromY: number, toY: number, low: number, high: number) {
  for (let y = fromY, index = 0; y < toY - 0.01; y += 0.12, index++) p.onSide(x, y, Math.min(toY, y + 0.1), low, high, index % 2 ? tones(F.bamboo).shade : F.bamboo);
  p.onSide(x, fromY, toY, (low + high) / 2, (low + high) / 2 + 0.6, F.bambooNode);
}

/** A skirt of palm thatch hanging from a front edge at `z`, its strands of uneven length (fine: one pixel each). */
function skirt(p: Painter, y: number, fromX: number, toX: number, z: number, length: number) {
  for (let x = fromX; x < toX; x += 1 / 16) {
    const reach = length - pick(`skirt${x.toFixed(3)}`, 3);
    for (let down = 0; down < reach; down++) p.pixel(x, y, z - down, down === reach - 1 ? tones(F.thatch).shade : pick(`strand${x.toFixed(3)}`, 2) ? F.thatch : F.thatchLight);
  }
}

/* The pieces */

const boardOf = (piece: FurniturePiece) => F.surfboards[pick(`board${piece.x},${piece.y}`, F.surfboards.length)];
const canvasOf = (piece: FurniturePiece) => F.canvas[pick(`canvas${piece.x},${piece.y}`, F.canvas.length)];
const cushionOf = (piece: FurniturePiece, index: number) => F.cushions[pick(`cushion${piece.x},${piece.y},${index}`, F.cushions.length)];

/** A surfboard lying flat from x = 0 to `length`, its nose to the right: slices narrower toward both ends. */
function surfboard(p: Painter, length: number, z: number, height: number, colour: string) {
  const slices = [[0, 0.08, 0.3], [0.08, 0.22, 0.12], [0.22, length - 0.36, 0.04], [length - 0.36, length - 0.16, 0.14], [length - 0.16, length, 0.32]] as const;
  for (const [from, to, inset] of slices) p.box(from, inset, to - from, 0.95 - inset * 2, z, height, colour, tones(colour).light);
  alongTop(p, 0.455, 0.1, length - 0.1, z + height, F.stringer);
  p.box(length * 0.7, 0.08, 0.1, 0.79, z + height, 0, F.boardStripe, F.boardStripe);
  p.box(length * 0.7 + 0.14, 0.08, 0.04, 0.79, z + height, 0, F.boardStripe, F.boardStripe);
}

/** The board's two surfboards standing in the sand, and its thatch roof: kept where the office's board is. */
const BOARD = { y: 0.34, fromX: 0.18, toX: 3.82, low: 15, high: 43 };
function paintBoardFrame(p: Painter) {
  p.box(0.12, 0.24, 3.76, 0.1, 13, 32, F.woodDark);
  for (const [x, colour] of [[0, F.surfboards[0]], [3.8, F.surfboards[1]]] as const) {
    p.box(x, 0.2, 0.2, 0.18, 0, 44, colour, tones(colour).light);
    p.box(x + 0.04, 0.2, 0.12, 0.18, 44, 3, colour, tones(colour).light);
    p.onFront(0.38, x + 0.08, x + 0.12, 2, 44, F.stringer);
  }
  p.box(-0.05, 0.12, 4.1, 0.34, 45, 2, F.thatch, F.thatchLight);
  p.box(0.15, 0.18, 3.7, 0.22, 47, 2, F.thatch, F.thatchLight);
}
function paintBoardSurface(p: Painter) {
  p.onFront(BOARD.y, BOARD.fromX, BOARD.toX, BOARD.low, BOARD.high, F.board);
  for (const z of [22, 29, 36]) p.onFront(BOARD.y, BOARD.fromX, BOARD.toX, z, z + 0.5, F.boardSeam);
}
const BOARD_BALLOONS = [[0.15, 54, 0], [0.55, 58, 2], [0.3, 63, 1]] as const;

/** The things on the surf shack's shelf, by shelf from the bottom. */
function paintShelfThings(p: Painter) {
  // rolled towels on the bottom shelf, a spiral in each
  for (let index = 0; index < 5; index++) {
    const x = 0.3 + index * 0.35, colour = F.towels[index % F.towels.length];
    p.ball(x, 0.4, 4.5, 2.8, 2.8, colour);
    p.pixel(x, 0.62, 4.5, F.canvasPale);
  }
  // a bucket and its spade, a diving mask, shells on the middle one
  p.box(0.2, 0.2, 0.32, 0.32, 9, 6, F.bucket);
  p.box(0.2, 0.2, 0.32, 0.32, 15, 0.5, tones(F.bucket).light);
  p.box(0.6, 0.3, 0.06, 0.06, 9, 9, F.spade);
  p.box(0.55, 0.28, 0.16, 0.1, 9, 3, F.spade);
  p.box(0.9, 0.35, 0.5, 0.1, 10, 4, F.mask);
  p.onFront(0.45, 0.95, 1.12, 10.8, 13.2, F.maskGlass);
  p.onFront(0.45, 1.18, 1.35, 10.8, 13.2, F.maskGlass);
  p.ball(1.6, 0.4, 10.5, 2, 1.5, F.shellPink);
  p.ball(1.78, 0.35, 10, 1.4, 1.2, F.shell);
  // folded towels in piles on the top shelf, a pair of flip flops
  F.towels.slice(0, 4).forEach((colour, index) => { p.box(0.15, 0.15, 0.6, 0.38, 17 + index * 1.4, 1.4, index % 2 ? F.canvasPale : colour); });
  F.towels.slice(1, 4).forEach((colour, index) => { p.box(0.85, 0.15, 0.55, 0.38, 17 + index * 1.6, 1.6, colour); });
  for (const x of [1.5, 1.7]) p.box(x, 0.15, 0.14, 0.38, 17, 0.6, F.cushions[1], F.cushions[1]);
}

/** The seats' top, where the office's cushions are. */
const SEAT_TOP = 7;

export const BEACH_FURNITURE: Partial<Record<PieceKind, Design>> = {
  // a surfboard on two driftwood trestles, a laptop with a sticker, a coconut to drink
  desk: { height: 22, paint(p, piece) {
    for (const x of [0.25, 1.6]) {
      p.box(x, 0.15, 0.12, 0.1, 0, 9, F.driftwoodDark);
      p.box(x, 0.72, 0.12, 0.1, 0, 9, F.driftwood);
      p.box(x - 0.02, 0.15, 0.16, 0.67, 6, 1.5, F.driftwood);
    }
    surfboard(p, 2, 9, 2, boardOf(piece));
    laptop(p, 0.25, 0.95, 0.4, F.stickers[pick(`sticker${piece.x},${piece.y}`, F.stickers.length)]);
    p.box(1.22, 0.42, 0.36, 0.3, 11, 0.6, F.map);
  }, fine(p) {
    coconut(p, 1.72, 0.27, 11);
  } },
  // a little tiki bar: bamboo canes, a polished top, a thatch skirt; a hurricane lamp and a cocktail beside the laptop
  bossDesk: { height: 30, paint(p) {
    p.box(0, 0.05, 3, 0.9, 0, 9, F.bamboo);
    canes(p, 0.95, 0.04, 2.96, 0, 9);
    canesOnSide(p, 3, 0.08, 0.92, 0, 9);
    p.box(0, 0, 3, 0.95, 9, 2, F.wood, tones(F.wood).light);
    alongTop(p, 0.47, 0.05, 2.95, 11, tones(F.wood).base);
    laptop(p, 1.1, 1.9, 0.45, F.stickers[0]);
    p.box(2.05, 0.5, 0.5, 0.3, 11, 0.6, F.map);
    p.box(2.15, 0.56, 0.12, 0.1, 11.6, 0, F.mapInk, F.mapInk);
    cylinder(p, { x: 2.8, y: 0.22 }, 11, 1, 2, F.woodDark);
    cylinder(p, { x: 2.8, y: 0.22 }, 12, 6, 2, F.lampGlass);
  }, fine(p) {
    skirt(p, 0.96, 0, 3, 9, 4);
    const lamp = { x: 2.8, y: 0.22 };
    p.upright(0, 14, F.flame, lamp);
    p.upright(0, 15, F.flameCore, lamp);
    p.upright(-1, 17, F.lampGlass, lamp);
    cocktail(p, 0.45, 0.35, 11, F.cocktails[1]);
  } },
  // a bamboo deckchair, its seat and back in striped canvas
  chair: { height: 20, paint(p, piece) {
    const stripe = canvasOf(piece);
    for (const [x, y] of [[0.2, 0.72], [0.73, 0.72], [0.2, 0.2], [0.73, 0.2]]) p.box(x, y, 0.07, 0.07, 0, 5, F.bamboo);
    for (const x of [0.2, 0.73]) p.box(x, 0.12, 0.07, 0.07, 5, 13, F.bamboo);
    p.box(0.2, 0.2, 0.6, 0.6, 4.5, 0.6, F.bamboo);
    for (let index = 0; index < 6; index++) p.box(0.2 + index * 0.1, 0.22, 0.1, 0.56, 5, 1.5, index % 2 ? F.canvasPale : stripe);
    for (let z = 8; z < 17; z += 1.5) p.box(0.27, 0.13, 0.46, 0.05, z, 1.5, Math.round((z - 8) / 1.5) % 2 ? F.canvasPale : stripe);
    p.box(0.2, 0.12, 0.6, 0.07, 17, 1, F.bamboo);
  } },
  // a dwarf palm in a woven pot, or a cactus in a terracotta one, a flower on top
  plant: { height: 26, paint(p, piece) {
    const middle = { x: 0.5, y: 0.5 };
    p.shadow(0.5, 0.5, 6, 3);
    if ((piece.x + piece.y) % 2) {
      cylinder(p, middle, 0, 6, 4, F.wovenPot, F.sandInPot);
      for (let up = 1; up < 6; up += 2) for (let across = -4; across < 4; across += 2) p.upright(across + (up % 4 === 1 ? 1 : 0), up - 1, tones(F.wovenPot).shade, middle);
      for (let up = 7; up < 14; up++) {
        p.upright(0, up, up % 3 ? F.trunk : F.trunkRing, middle);
        p.upright(1, up, tones(F.trunk).shade, middle);
      }
      crown(p, middle, 14, 7);
      return;
    }
    cylinder(p, middle, 0, 6, 4, F.terracotta, F.sandInPot);
    p.onFront(0.72, 0.28, 0.72, 4.5, 5.5, tones(F.terracotta).light);
    const column = (across: number, from: number, to: number) => {
      for (let up = from; up < to; up++) p.upright(across, up, across < 0 ? F.cactus : across > 0 ? F.cactusDark : tones(F.cactus).light, middle);
    };
    for (const across of [-2, -1, 0, 1, 2]) column(across, 6, across === -2 || across === 2 ? 18 : 19);
    for (const [across, from, to] of [[-3, 11, 13], [-4, 11, 16], [-5, 12, 16], [3, 13, 15], [4, 13, 18], [5, 14, 18]] as const) column(across, from, to);
  }, fine(p, piece) {
    if ((piece.x + piece.y) % 2) return;
    const middle = { x: 0.5, y: 0.5 };
    for (const [across, up] of [[-2, 9], [2, 12], [0, 15], [-2, 16], [1, 8], [-4, 14], [4, 16], [2, 17]] as const) p.upright(across, up, F.spine, middle);
    for (const [across, up] of [[0, 20], [-1, 19], [1, 19], [0, 19]] as const) p.upright(across, up, F.flower, middle);
  } },
  // a coconut palm in a mound of sand: a leaning ringed trunk, a crown of fronds, coconuts under it
  bigPlant: { height: 62, paint(p, piece) {
    const middle = { x: 0.5, y: 0.5 };
    const lean = piece.x > 10 ? -1 : 1;
    p.shadow(0.5, 0.5, 10, 4);
    p.ball(0.5, 0.5, 1, 7, 3, F.sandInPot);
    const sway = (up: number) => Math.round(lean * (Math.sin(up / 22) * 6));
    for (let up = 2; up < 42; up++) {
      const across = sway(up);
      const ring = up % 4 === 0;
      p.upright(across - 1, up, ring ? F.trunkRing : tones(F.trunk).light, middle);
      p.upright(across, up, ring ? F.trunkRing : F.trunk, middle);
      p.upright(across + 1, up, ring ? F.trunkRing : tones(F.trunk).shade, middle);
    }
    const top = { x: 0.5 + sway(42) / 16, y: 0.5 - sway(42) / 16 };
    for (const [across, up] of [[-2, 40], [1, 39], [-1, 38]] as const) p.ball(top.x + across / 16, top.y - across / 16, up, 1.6, 1.6, F.coconut);
    crown(p, top, 42, 9);
  } },
  // a surf shack's shelf of driftwood planks: towels rolled and folded, a bucket and spade, a mask, shells
  bookshelf: { height: 26, paint(p) {
    p.box(0.08, 0, 1.84, 0.1, 0, 24, F.woodDark);
    for (const x of [0, 1.9]) p.box(x, 0, 0.1, 0.6, 0, 24, F.wood);
    for (const z of [0, 8, 16]) p.box(0.1, 0.05, 1.8, 0.55, z, 1, F.wood);
    p.box(0, 0, 2, 0.6, 23, 1, F.wood, tones(F.wood).light);
    paintShelfThings(p);
    for (const z of [8, 16]) p.onFront(0.6, 0.1, 1.9, z, z + 1, tones(F.wood).light);
  } },
  // a daybed along the left wall, facing the room: a bamboo frame, a thick white mattress, a cushion for each seat
  sofa: { height: 20, paint(p, piece) {
    const { depth } = piece;
    p.box(0.05, 0, 0.9, depth, 0, 3, F.wood);
    for (let y = 0.1; y < depth; y += 0.3) p.onSide(0.95, y, y + 0.12, 0.5, 2.5, tones(F.wood).shade);
    p.box(0.02, 0, 0.1, depth, 3, 11, F.bamboo);
    p.box(0.1, 0.04, 0.84, depth - 0.08, 3, 4, F.mattress);
    const seat = (depth - 0.22) / depth;
    for (let index = 0; index < depth; index++) {
      const y = 0.22 + index * seat;
      p.box(0.12, y + 0.04, 0.25, seat - 0.1, SEAT_TOP, 7, cushionOf(piece, index));
      p.onSide(0.37, y + 0.2, y + seat - 0.26, 9, 12, F.canvasPale);
    }
    p.box(0.05, 0, 0.9, 0.22, 3, 7, cushionOf(piece, 9));
  } },
  sofaArm: { height: 14, paint(p, piece) {
    p.box(0.05, 0, 0.9, 0.22, 0, 3, F.wood);
    p.box(0.05, 0, 0.9, 0.22, 3, 7, cushionOf(piece, 8));
    p.onFront(0.22, 0.2, 0.8, 6, 7, F.canvasPale);
  } },
  // the same daybed facing the viewer, its back on the back wall's side
  couch: { height: 20, paint(p, piece) {
    const { width } = piece;
    p.box(0, 0.05, width, 0.9, 0, 3, F.wood);
    for (let x = 0.1; x < width; x += 0.3) p.onFront(0.95, x, x + 0.12, 0.5, 2.5, tones(F.wood).shade);
    p.box(0, 0.02, width, 0.1, 3, 11, F.bamboo);
    p.box(0.04, 0.1, width - 0.08, 0.82, 3, 4, F.mattress);
    for (let index = 0; index < width; index++) {
      p.box(index + 0.1, 0.12, 0.8, 0.25, SEAT_TOP, 7, cushionOf(piece, index));
      p.onFront(0.37, index + 0.3, index + 0.7, 9, 12, F.canvasPale);
    }
    p.box(0, 0.05, 0.2, 0.9, 3, 7, cushionOf(piece, 9));
  } },
  couchArm: { height: 14, paint(p, piece) {
    p.box(0, 0.05, 0.2, 0.9, 0, 3, F.wood);
    p.box(0, 0.05, 0.2, 0.9, 3, 7, cushionOf(piece, 8));
    p.onSide(0.2, 0.3, 0.7, 6, 7, F.canvasPale);
  } },
  // a slab of driftwood on two stumps, a coconut and a cocktail; or a cooler box, when it stands the other way
  lowTable: { height: 16, paint(p, { width, depth }) {
    if (depth > width) {
      p.box(0.14, 0.1, 0.72, depth - 0.2, 0, 6, F.cooler);
      p.box(0.12, 0.08, 0.76, depth - 0.16, 6, 1, F.coolerLid);
      p.onSide(0.86, 0.3, depth - 0.3, 2.5, 3.5, tones(F.cooler).dark);
      p.onFront(depth - 0.1, 0.25, 0.75, 4, 5, F.coolerLid);
      return;
    }
    for (const x of [0.25, width - 0.5]) p.box(x, 0.3, 0.25, 0.4, 0, 5, F.driftwoodDark);
    p.box(0.06, 0.1, width - 0.12, depth - 0.2, 5, 2, F.driftwood, tones(F.driftwood).light);
    for (const y of [0.35, 0.6]) alongTop(p, y, 0.2, width - 0.3, 7, F.driftwood);
  }, fine(p, { width, depth }) {
    if (depth > width) {
      coconut(p, 0.5, 0.5, 7);
      return;
    }
    coconut(p, 0.45, 0.45, 7);
    cocktail(p, width - 0.35, 0.4, 7, F.cocktails[(width * 7) % 3]);
  } },
  // a tiki torch: a bamboo pole in the sand, a carved tiki cup on top, its flame (it flickers, see paintFurnitureEffects)
  floorLamp: { height: 42, paint(p) {
    p.shadow(0.5, 0.5, 4, 2);
    p.ball(0.5, 0.5, 0, 3, 1.5, F.thatch);
    for (let z = 0; z < 26; z++) p.box(0.45, 0.45, 0.1, 0.1, z, 1, z % 6 === 5 ? F.bambooNode : F.bamboo);
    for (const z of [9, 18]) p.box(0.43, 0.43, 0.14, 0.14, z, 1, F.rope);
    p.box(0.36, 0.36, 0.28, 0.28, 26, 7, F.tiki, tones(F.bowl).dark);
    // its face: brows, eyes, a grinning mouth
    p.onFront(0.64, 0.38, 0.62, 31, 31.8, F.tikiDark);
    for (const x of [0.4, 0.52]) p.onFront(0.64, x, x + 0.08, 29.5, 30.6, F.tikiDark);
    p.onFront(0.64, 0.4, 0.6, 27, 28.4, F.tikiDark);
    p.onFront(0.64, 0.44, 0.56, 27.5, 28, F.coconutFlesh);
  }, fine(p) {
    const middle = { x: 0.5, y: 0.5 };
    for (const [across, up, colour] of [[0, 34, F.flameOuter], [-1, 34, F.flameOuter], [1, 34, F.flameOuter], [0, 35, F.flame], [0, 36, F.flameCore]] as const) p.upright(across, up, colour, middle);
  } },
  // a jar of lemon water with a tap on a driftwood crate
  cooler: { height: 28, paint(p) {
    const middle = { x: 0.5, y: 0.5 };
    p.box(0.22, 0.22, 0.56, 0.56, 0, 10, F.wood);
    for (const z of [3, 6.5]) p.onFront(0.78, 0.22, 0.78, z, z + 0.6, F.woodDark);
    p.onSide(0.78, 0.22, 0.78, 3, 3.6, tones(F.woodDark).dark);
    cylinder(p, middle, 10, 11, 4, F.water, F.jar);
    cylinder(p, middle, 21, 1, 4, F.woodDark);
  }, fine(p) {
    const middle = { x: 0.5, y: 0.5 };
    for (const [across, up] of [[-2, 13], [1, 16], [-1, 18], [2, 12]] as const) {
      p.upright(across, up, F.lemon, middle);
      p.upright(across + 1, up, F.lemon, middle);
      p.upright(across, up + 1, tones(F.lemon).light, middle);
    }
    for (const [across, up] of [[0, 14], [-3, 16], [2, 19], [1, 11]] as const) p.upright(across, up, F.mint, middle);
    for (let up = 12; up < 20; up++) p.upright(-3, up, F.glass, middle);
    p.box(0.47, 0.82, 0.06, 0.06, 10.5, 1.5, F.tap);
  } },
  // the board: whitewashed planks between two surfboards standing in the sand, a thatch roof over it
  whiteboard: { height: 70, paint(p, _piece, board) {
    paintBoardFrame(p);
    for (const [x, colour] of [[0.7, ROOM_PALETTE.furniture.markers.b], [1.05, ROOM_PALETTE.furniture.markers.r]] as const) p.box(x, BOARD.y + 0.02, 0.28, 0.05, 14, 1, colour);
    p.box(0.3, BOARD.y, 3.4, 0.1, 13, 1, F.woodDark);
    if (board.kind === 'birthday') for (const [x, z, colour] of BOARD_BALLOONS) p.ball(x, 0.3, z, 3.5, 4.5, ROOM_PALETTE.festive.balloons[colour]);
  }, fine(p, _piece, board) {
    paintBoardSurface(p);
    for (const x of [0.1, 3.9]) for (const z of [16, 30, 42]) p.pixel(x, 0.38, z, F.rope);
    skirt(p, 0.46, -0.05, 4.05, 45, 3);
    writeOnBoard(p, board);
    if (board.kind === 'birthday') for (const [x, z] of BOARD_BALLOONS) for (let up = 49; up < z - 4; up++) p.pixel(0.1 + (x - 0.1) * (up - 49) / (z - 53), 0.3, up, ROOM_PALETTE.festive.white);
  }, clickable(p) {
    paintBoardFrame(p);
    paintBoardSurface(p);
  } },
  // the bamboo bar under its thatch skirt: an espresso machine where the coffee was, two steaming mugs, fruit, bottles
  counter: { height: 26, paint(p) {
    p.box(0, 0.1, 3, 0.85, 0, 11, F.bamboo);
    canes(p, 0.95, 0.02, 2.98, 0, 11);
    canesOnSide(p, 3, 0.12, 0.93, 0, 11);
    p.box(0, 0.1, 3, 0.85, 11, 1, F.wood, tones(F.wood).light);
    p.box(0.3, 0.3, 0.5, 0.4, 12, 8, F.machine, F.chrome);
    p.onFront(0.7, 0.4, 0.7, 13, 16, F.chrome);
    p.onFront(0.7, 0.5, 0.6, 16, 17, tones(F.chrome).dark);
    p.box(0.48, 0.44, 0.14, 0.12, 20, 1, F.chrome);
    for (const x of [1.2, 1.45]) p.box(x, 0.5, 0.14, 0.14, 12, 3, F.mug, F.coffee);
    p.box(2.0, 0.3, 0.45, 0.4, 12, 2, F.wovenPot);
    p.box(2.65, 0.25, 0.1, 0.1, 12, 6, F.bottle);
    p.box(2.8, 0.35, 0.1, 0.1, 12, 5, F.bottleAmber);
  }, fine(p) {
    skirt(p, 0.96, 0, 3, 11, 4);
    const basket = { x: 2.22, y: 0.5 };
    p.ball(2.28, 0.48, 16, 2.2, 3, F.pineapple);
    for (const [across, up] of [[0, 19], [-1, 20], [1, 20], [0, 21], [-2, 21], [2, 21]] as const) p.upright(across + 1, up, F.pineappleLeaf, basket);
    for (const across of [-3, -2, -1]) p.upright(across, 15 + (across === -2 ? 1 : 0), F.banana, basket);
    for (const [x, z] of [[2.68, 18], [2.83, 17]] as const) p.pixel(x, 0.33, z, F.woodDark);
  } },
};

/* What moves and glows every frame, in room pixels */

/** A point of a piece in room pixels: (x, y) in tiles from its corner, `z` art pixels up. */
function pointOf(piece: FurniturePiece, x: number, y: number, z: number): Point {
  const point = toScreen({ x: piece.x + x, y: piece.y + y });
  return { x: point.x, y: point.y - z * ART_SCALE };
}

function dot(context: Context, point: Point, colour: string, alpha: number) {
  if (alpha <= 0.01) return;
  context.globalAlpha = Math.min(1, alpha);
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x / ART_SCALE) * ART_SCALE, Math.round(point.y / ART_SCALE) * ART_SCALE, ART_SCALE, ART_SCALE);
}

/** A flame dancing over a point: its height and lean change a few times a second, a spark now and then. */
function flame(context: Context, base: Point, time: number, seed: number, size: number) {
  const beat = Math.floor(time / 110);
  const height = size + pick(`flame${seed},${beat}`, 3);
  const lean = pick(`lean${seed},${Math.floor(time / 240)}`, 3) - 1;
  for (let up = 0; up < height; up++) {
    const share = up / height;
    const half = Math.max(0, Math.round((1 - share) * (size * 0.45)));
    const shift = Math.round(lean * share * 1.5) * ART_SCALE;
    for (let across = -half; across <= half; across++) {
      const colour = share > 0.7 || Math.abs(across) === half ? F.flameOuter : share < 0.35 && Math.abs(across) < half ? F.flameCore : F.flame;
      dot(context, { x: base.x + across * ART_SCALE + shift, y: base.y - up * ART_SCALE }, colour, 0.95);
    }
  }
  const age = (time / 900 + seed) % 1;
  dot(context, { x: base.x + (pick(`spark${seed},${Math.floor(time / 900 + seed)}`, 5) - 2) * ART_SCALE, y: base.y - (height + age * 8) * ART_SCALE }, F.flameCore, 1 - age);
}

/** The glow of a flame on what is around it, breathing. */
function halo(context: Context, center: Point, radius: number, colour: string, alpha: number) {
  for (let up = -radius; up <= radius; up++) for (let across = -radius; across <= radius; across++) {
    const distance = Math.hypot(across, up);
    if (distance > radius || distance < 2) continue;
    dot(context, { x: center.x + across * ART_SCALE, y: center.y + up * ART_SCALE }, colour, alpha * (1 - distance / radius));
  }
}

/** The torches' and the lamp's flames, each at its piece's depth: whoever stands in front of one covers it. */
export function furnitureEffects(layout: Layout, time: number, glow: number): ThemeEffect[] {
  const effects: ThemeEffect[] = [];
  for (const piece of layout.furniture) {
    const seed = piece.x * 3 + piece.y;
    if (piece.kind === 'floorLamp') effects.push({ depth: furnitureDepth(piece), paint(context) {
      const base = pointOf(piece, 0.5, 0.5, 34);
      if (glow > 0.05) halo(context, { x: base.x, y: base.y - 3 * ART_SCALE }, 6, F.flame, 0.22 * glow * (0.85 + 0.15 * Math.sin(time / 170 + seed)));
      flame(context, base, time, seed, 5);
      context.globalAlpha = 1;
    } });
    if (piece.kind === 'bossDesk') effects.push({ depth: furnitureDepth(piece), paint(context) {
      const base = pointOf(piece, 2.8, 0.22, 14);
      if (glow > 0.05) halo(context, { x: base.x, y: base.y - ART_SCALE }, 3, F.flame, 0.3 * glow);
      flame(context, base, time, seed, 2);
      context.globalAlpha = 1;
    } });
  }
  return effects;
}

/** The furniture's own lights at night: the torches, the hurricane lamp, the bar. */
export function furnitureLights(layout: Layout): ThemeLight[] {
  const lights: ThemeLight[] = [];
  const add = (piece: FurniturePiece, x: number, y: number, height: number, radius: number, colour: string, strength: number) =>
    lights.push({ x: piece.x + x, y: piece.y + y, height, radius, colour, strength });
  for (const piece of layout.furniture) {
    if (piece.kind === 'floorLamp') add(piece, 0.5, 0.5, 72, 150, F.lightTorch, 1);
    if (piece.kind === 'bossDesk') add(piece, 2.8, 0.22, 32, 80, F.lightLamp, 0.8);
    if (piece.kind === 'counter') add(piece, 1.5, 0.6, 30, 110, F.lightBar, 0.7);
  }
  return lights;
}
