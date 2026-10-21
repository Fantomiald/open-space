// The dungeon's furniture (themes/kit.ts, pixel-furniture.ts for the painter): oak tables with a grimoire on its rest
// and a candle, a mage's desk for the user, small thrones, glowing mushrooms and a giant one, shelves of grimoires,
// skulls and potions, benches under furs, open treasure chests, braziers, a bubbling cauldron, a quest board and a
// tavern bar. Their flames, bubbles and glows are drawn every frame (dungeon-effects.ts), from the spots given here.
import { DUNGEON_PALETTE as D } from '../../design/theme-dungeon.ts';
import type { FurniturePiece, PieceKind } from '../../../shared/room-layout.ts';
import { standing, writeOnBoard, type Design, type Painter } from '../pixel-furniture.ts';
import { tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';

/** A point of a piece, from its corner: x and y in tiles, z in art pixels. */
export interface PieceSpot { x: number; y: number; z: number }

/** The candle flames of each piece, at the top of their wick. */
export const CANDLES: Partial<Record<PieceKind, readonly PieceSpot[]>> = {
  desk: [{ x: 1.71, y: 0.23, z: 15 }],
  bossDesk: [{ x: 2.635, y: 0.22, z: 20.5 }, { x: 2.8, y: 0.22, z: 21.5 }, { x: 2.965, y: 0.22, z: 20.5 }],
  bookshelf: [{ x: 1.75, y: 0.6, z: 21 }],
  whiteboard: [{ x: 0.1, y: 0.47, z: 41 }],
};
export const BRAZIER: PieceSpot = { x: 0.5, y: 0.5, z: 22.5 };
export const BREW: PieceSpot = { x: 0.5, y: 0.5, z: 13.5 };
export const CRYSTAL_BALL: PieceSpot = { x: 0.43, y: 0.43, z: 16 };
export const GIANT_CAP: PieceSpot = { x: 0.5, y: 0.5, z: 30 };

/** Which of the glowing mushrooms grows in a pot (its colour, and its light). */
export const mushroomKind = (piece: FurniturePiece) => pick(`cap${piece.x},${piece.y}`, D.caps.length);

/** A line of single pixels along x, on a top or a face. */
function along(p: Painter, fromX: number, toX: number, y: number, z: number, colour: string) {
  for (let x = fromX; x < toX; x += 1 / 8) p.pixel(x, y, z, colour);
}

/** A disc of pixels on a front face (the plane y), `radius` art pixels: the head of a barrel, a carved emblem. */
function discOnFront(p: Painter, y: number, x: number, z: number, radius: number, colour: string, ring = false) {
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    const distance = Math.hypot(dx, dz);
    if (distance <= radius + 0.3 && (!ring || distance > radius - 1)) p.pixel(x + dx / 8, y, z + dz, colour);
  }
}

/** Tufts of fur over a pelt's top, `z` up, lighter and darker hairs scattered. */
function tufts(p: Painter, fromX: number, toX: number, fromY: number, toY: number, z: number, colour: string) {
  const fur = tones(colour);
  for (let x = fromX; x < toX; x += 1 / 8) for (let y = fromY; y < toY; y += 1 / 8) {
    const hair = pick(`tuft${x.toFixed(3)},${y.toFixed(3)}`, 5);
    if (hair < 2) p.pixel(x, y, z, hair ? fur.light : fur.shade);
  }
}

/** The laptop's box (pixel-furniture.ts) as a grimoire on its rest: the rest, the pages, its leather back cover to us. */
function grimoire(p: Painter, fromX: number, toX: number, fromY: number, cover: string) {
  p.box(fromX, fromY, toX - fromX, 0.6 - fromY, 11, 1, D.oakDark);
  p.box(fromX + 0.03, 0.5, toX - fromX - 0.06, 0.05, 12, 5.5, D.parchment);
  p.box(fromX, 0.55, toX - fromX, 0.06, 12, 5, cover);
}

/** Gold corners and a rune on a grimoire's cover. */
function gildCover(p: Painter, fromX: number, toX: number, rune: string) {
  for (const x of [fromX + 0.04, toX - 0.06]) { p.pixel(x, 0.61, 16, D.gold); p.pixel(x, 0.61, 12.5, D.gold); }
  const middle = (fromX + toX) / 2;
  p.pixel(middle, 0.61, 15, rune);
  p.pixel(middle, 0.61, 14, rune);
  p.pixel(middle - 1 / 8, 0.61, 14.5, rune);
  p.pixel(middle + 1 / 8, 0.61, 14.5, rune);
}

function candle(p: Painter, x: number, y: number, z: number, height: number) {
  p.box(x - 0.08, y - 0.08, 0.16, 0.16, z, 1, D.iron);
  p.box(x - 0.04, y - 0.04, 0.08, 0.08, z + 1, height - 1, D.wax);
}

const SKULL = ['.sss.', 'sssss', 'sksks', 'ssdss', '.sds.'];
const SKULL_PAINT = { s: D.skull, k: D.ink, d: D.skullShade };
const POTION = ['.c.', '.g.', 'glg', 'lll', 'lll'];
const LANTERN = ['.i.', 'iii', 'ifi', 'ifi', 'iii'];

/** The mushrooms of a pot: where, how high their stems, their caps' half width and height. */
const MUSHROOMS = [[0.42, 0.44, 12, 5, 3], [0.68, 0.62, 7, 3.5, 2.2], [0.3, 0.74, 5, 2.5, 1.6]] as const;
const POTION_SPOTS = [1.3, 1.48, 1.66, 1.84];

/** The posts, planks and roof of the quest board (what a click opens, outlined under the pointer). */
function questBoard(p: Painter) {
  for (const x of [0.02, 3.82]) {
    p.box(x - 0.05, 0.19, 0.26, 0.24, 0, 2, D.oakDark);
    p.box(x, 0.24, 0.16, 0.14, 2, 47, D.oak);
  }
  p.box(0.12, 0.22, 3.76, 0.12, 13, 32, D.boardPlanks);
  p.box(-0.14, 0.08, 4.28, 0.44, 48, 2, D.roof);
  p.box(-0.04, 0.16, 4.08, 0.28, 50, 2, tones(D.roof).shade);
  p.box(0.06, 0.24, 3.88, 0.12, 52, 1, D.roof);
}

export const DUNGEON_FURNITURE: Partial<Record<PieceKind, Design>> = {
  // an oak table: thick legs, a stretcher, a chest underneath; a grimoire on its rest, a candle, ink and a scroll
  desk: { height: 24, paint(p, piece) {
    for (const [x, y] of [[0.04, 0.06], [1.78, 0.06], [0.04, 0.76], [1.78, 0.76]]) p.box(x, y, 0.18, 0.18, 0, 8, D.oakDark);
    p.box(0.2, 0.44, 1.6, 0.08, 2, 1.5, D.oakDark);
    p.box(1.1, 0.24, 0.6, 0.44, 0, 5, D.chest);
    p.box(0, 0, 2, 0.95, 8, 3, D.oak);
    grimoire(p, 0.25, 0.95, 0.2, D.leather[pick(`book${piece.x},${piece.y}`, D.leather.length)]);
    candle(p, 1.71, 0.23, 11, 4);
    p.box(1.36, 0.2, 0.13, 0.13, 11, 2, D.ink);
    p.box(1.18, 0.5, 0.44, 0.3, 11, 0.5, D.parchment);
    p.box(1.14, 0.48, 0.07, 0.34, 11, 1.5, D.parchmentShade);
  }, fine(p) {
    along(p, 0.02, 2, 0.32, 11, tones(D.oak).shade);
    along(p, 0.02, 2, 0.66, 11, tones(D.oak).shade);
    along(p, 0.02, 2, 0.95, 9.5, D.oakDark);
    p.onFront(0.68, 1.36, 1.44, 0, 5, D.iron);
    p.pixel(1.4, 0.68, 3, D.gold);
    gildCover(p, 0.25, 0.95, D.gold);
    for (let up = 0; up < 5; up++) p.pixel(1.45 + up / 16, 0.26, 13 + up, D.quill);
    for (const x of [1.25, 1.35, 1.45]) p.pixel(x, 0.65, 11.6, D.ink);
  } },
  // the user's desk, a mage's: dark wood under gold, a carved seal on its front; a grimoire of their own with a gem,
  // a candelabra (where the office has a lamp), a crystal ball, a skull and a scroll
  bossDesk: { height: 30, paint(p) {
    p.box(0, 0, 3, 0.95, 0, 2, tones(D.ebony).dark);
    p.box(0.05, 0.04, 2.9, 0.87, 2, 8, D.ebony);
    p.box(0, 0, 3, 0.95, 10, 1, D.ebony, tones(D.velvet).base);
    p.onFront(0.91, 0.2, 0.95, 3.5, 8, tones(D.ebony).shade);
    p.onFront(0.91, 2.05, 2.8, 3.5, 8, tones(D.ebony).shade);
    p.onSide(2.95, 0.12, 0.8, 3.5, 8, tones(D.ebony).dark);
    grimoire(p, 1.1, 1.9, 0.15, D.leather[3]);
    p.box(2.72, 0.14, 0.16, 0.16, 11, 1, D.gold);
    p.box(2.77, 0.19, 0.06, 0.06, 12, 5, D.gold);
    p.box(2.6, 0.19, 0.4, 0.06, 16.5, 1, D.gold);
    for (const [x, height] of [[2.6, 3], [2.77, 4], [2.93, 3]] as const) p.box(x, 0.19, 0.07, 0.06, 17.5, height, D.wax);
    p.box(0.3, 0.3, 0.26, 0.26, 11, 1.5, D.gold);
    p.ball(CRYSTAL_BALL.x, CRYSTAL_BALL.y, CRYSTAL_BALL.z, 3.2, 3.2, D.crystalBall);
    p.box(2.05, 0.5, 0.5, 0.3, 11, 0.5, D.parchment);
    p.box(2.02, 0.48, 0.07, 0.34, 11, 1.5, D.parchmentShade);
    standing(p, SKULL, SKULL_PAINT, { x: 0.8, y: 0.3 }, 11);
  }, fine(p) {
    along(p, 0, 3, 0.95, 10.5, D.gold);
    along(p, 0, 3, 0.95, 1.5, D.gold);
    discOnFront(p, 0.91, 1.5, 5.8, 3, D.gold, true);
    discOnFront(p, 0.91, 1.5, 5.8, 1, D.gold);
    gildCover(p, 1.1, 1.9, D.rune);
    p.pixel(1.5, 0.61, 14.5, D.runeLit);
  } },
  // a small throne: four legs, a velvet cushion, a carved oak back with gold knobs
  chair: { height: 24, paint(p) {
    for (const [x, y] of [[0.22, 0.22], [0.68, 0.22], [0.22, 0.68], [0.68, 0.68]]) p.box(x, y, 0.1, 0.1, 0, 5, D.oakDark);
    p.box(0.2, 0.2, 0.6, 0.6, 5, 1.5, D.oak);
    p.box(0.25, 0.25, 0.5, 0.5, 6.5, 0.8, D.velvet);
    for (const x of [0.2, 0.7]) p.box(x, 0.08, 0.1, 0.12, 5, 12, D.oakDark);
    p.box(0.3, 0.1, 0.4, 0.08, 7, 9, D.oak);
    p.onFront(0.18, 0.38, 0.62, 10, 14, D.velvet);
    p.box(0.2, 0.08, 0.6, 0.12, 16, 1.5, D.oakDark);
    for (const x of [0.25, 0.75]) p.ball(x, 0.14, 18.5, 1, 1, D.gold);
  }, fine(p) {
    p.pixel(0.5, 0.18, 17.5, D.gold);
  } },
  // glowing mushrooms on a mossy stone
  plant: { height: 24, paint(p, piece) {
    const cap = D.caps[mushroomKind(piece)];
    p.shadow(0.5, 0.5, 7, 3);
    p.ball(0.5, 0.55, 2, 6, 3, D.rock);
    p.ball(0.42, 0.5, 4, 4, 1.6, D.moss[0]);
    for (const [x, y, top, wide, high] of MUSHROOMS) {
      p.box(x - 0.05, y - 0.05, 0.1, 0.1, 2, top - 2, D.mushroomStem);
      p.ball(x, y, top + high * 0.5, wide, high, cap);
    }
  }, fine(p, piece) {
    const glow = D.light.mushrooms[mushroomKind(piece)];
    for (const [x, y, top, wide] of MUSHROOMS) {
      for (let across = -wide + 2; across <= wide - 2; across++) p.upright(across, top - 1, glow, { x, y });
      p.upright(-1, top + 2, D.capSpot, { x, y });
      if (wide > 3) p.upright(2, top + 1, D.capSpot, { x, y });
    }
  } },
  // a giant mushroom, its gills glowing under a spotted cap, small ones at its foot
  bigPlant: { height: 44, paint(p) {
    p.shadow(0.5, 0.5, 9, 4);
    p.box(0.3, 0.3, 0.4, 0.4, 0, 4, D.mushroomStem);
    p.box(0.36, 0.36, 0.28, 0.28, 4, 22, D.mushroomStem);
    p.box(0.33, 0.33, 0.34, 0.34, 18, 1.5, tones(D.mushroomStem).shade);
    p.ball(GIANT_CAP.x, GIANT_CAP.y, GIANT_CAP.z, 7, 5, D.giantCap);
    p.ball(0.46, 0.46, GIANT_CAP.z + 2.5, 4, 2.5, tones(D.giantCap).light);
    for (const [x, y, top] of [[0.2, 0.62, 5], [0.72, 0.28, 4], [0.78, 0.7, 3]] as const) {
      p.box(x - 0.04, y - 0.04, 0.08, 0.08, 0, top, D.mushroomStem);
      p.ball(x, y, top + 1, 2.2, 1.4, D.caps[0]);
    }
  }, fine(p) {
    for (let across = -5; across <= 5; across++) {
      const rim = Math.round(GIANT_CAP.z - 5 * Math.sqrt(1 - (across / 7) ** 2));
      p.upright(across, rim + 1, D.light.mushrooms[0], GIANT_CAP);
    }
    for (const [across, z] of [[-4, 31], [-1, 33], [2, 32], [4, 29], [-3, 28], [1, 30]] as const) {
      p.upright(across, z, D.capSpot, GIANT_CAP);
      p.upright(across + 1, z, D.capSpot, GIANT_CAP);
    }
  } },
  // shelves of grimoires, a skull, potions and a candle; a cobweb in a corner
  bookshelf: { height: 30, paint(p) {
    p.box(0, 0, 2, 0.6, 0, 22.5, D.oakDark);
    p.box(-0.03, -0.03, 2.06, 0.66, 22.5, 1.5, D.oak);
    p.onFront(0.6, 0.06, 1.94, 1, 22.5, tones(D.oakDark).dark);
    for (const shelf of [0, 8, 16]) p.onFront(0.6, 0.04, 1.96, shelf, shelf + 1, D.oak);
    let index = 0;
    const books = (fromX: number, toX: number, bottom: number) => {
      for (let x = fromX; x < toX - 0.08; x += 0.15) {
        const height = 5 - (index * 7) % 3;
        p.onFront(0.6, x, x + 0.12, bottom, bottom + height, D.leather[index % D.leather.length]);
        index++;
      }
    };
    books(0.1, 1.15, 1);
    books(0.7, 1.9, 9);
    books(0.1, 1.0, 17);
    for (const [z, width, colour] of [[17, 0.42, 0], [18.5, 0.36, 2], [20, 0.4, 4]] as const) p.onFront(0.6, 1.1, 1.1 + width, z, z + 1.5, D.leather[colour]);
    standing(p, SKULL, SKULL_PAINT, { x: 0.4, y: 0.6 }, 9);
    for (const [potion, x] of POTION_SPOTS.entries()) standing(p, POTION, { c: D.oak, g: D.glass, l: D.potions[potion % D.potions.length] }, { x, y: 0.6 }, 1);
    p.onFront(0.6, 1.71, 1.79, 17, 21, D.wax);
  }, fine(p) {
    let index = 0;
    for (const [fromX, toX, bottom] of [[0.1, 1.15, 1], [0.7, 1.9, 9], [0.1, 1.0, 17]] as const) {
      for (let x = fromX; x < toX - 0.08; x += 0.15) {
        const height = 5 - (index * 7) % 3;
        p.pixel(x + 0.06, 0.6, bottom + height - 1.5, D.gold);
        index++;
      }
    }
    for (let step = 0; step < 5; step++) { p.pixel(0.06 + step / 8, 0.6, 22 - step * 0.5, D.web); p.pixel(0.06, 0.6, 22 - step, D.web); }
    p.pixel(0.16, 0.6, 20.5, D.web);
  } },
  // a bench of oak planks along the wall, a fur on each seat and one over the back
  sofa: { height: 20, paint(p, { depth }) {
    p.box(0.05, 0, 0.9, depth, 0, 4, D.oakDark);
    p.box(0.3, 0.18, 0.65, depth - 0.18, 4, 1.5, D.oak);
    const seat = (depth - 0.18) / depth;
    for (let index = 0; index < depth; index++) {
      const colour = index % 2 ? D.furLight : D.fur;
      p.box(0.33, 0.21 + index * seat, 0.6, seat - 0.06, 5.5, 1.5, colour);
      p.onSide(0.93, 0.25 + index * seat, 0.15 + (index + 1) * seat, 3.5, 5.5, colour);
    }
    p.box(0.05, 0.18, 0.25, depth - 0.18, 4, 9, D.oak);
    p.box(0.07, 0.22, 0.24, depth - 0.26, 9, 4, D.furGrey);
    p.box(0.05, 0, 0.9, 0.18, 4, 7, D.oakDark);
  }, fine(p, { depth }) {
    const seat = (depth - 0.18) / depth;
    for (let index = 0; index < depth; index++) tufts(p, 0.36, 0.92, 0.24 + index * seat, 0.12 + (index + 1) * seat, 7, index % 2 ? D.furLight : D.fur);
    tufts(p, 0.08, 0.3, 0.24, depth - 0.06, 13, D.furGrey);
    for (let y = 0.3; y < depth - 0.05; y += 0.25) p.pixel(0.93, y, 3, tones(D.fur).dark);
    for (let y = 0.3; y < depth; y += 0.5) p.pixel(0.31, y, 10, tones(D.furGrey).dark);
    p.pixel(0.85, 0.09, 11, D.gold);
  } },
  sofaArm: { height: 14, paint(p) {
    p.box(0.05, 0, 0.9, 0.22, 0, 4, D.oakDark);
    p.box(0.05, 0, 0.9, 0.22, 4, 7, D.oakDark);
  }, fine(p) {
    p.pixel(0.85, 0.11, 11, D.gold);
  } },
  couch: { height: 20, paint(p, { width }) {
    p.box(0, 0.05, width, 0.9, 0, 4, D.oakDark);
    p.box(0.2, 0.3, width - 0.2, 0.65, 4, 1.5, D.oak);
    for (let index = 0; index < width; index++) {
      const furs = [D.fur, D.furGrey, D.furLight];
      const from = index + 0.06 + (index === 0 ? 0.16 : 0), to = index + 0.94;
      p.box(from, 0.34, to - from, 0.58, 5.5, 1.5, furs[index % furs.length]);
      p.onFront(0.92, from + 0.04, to - 0.04, 3.5, 5.5, furs[index % furs.length]);
    }
    p.box(0.2, 0.08, width - 0.2, 0.25, 4, 9, D.oak);
    p.box(0.24, 0.1, width - 0.3, 0.22, 9, 4, D.fur);
    p.box(0, 0.05, 0.2, 0.9, 4, 7, D.oakDark);
  }, fine(p, { width }) {
    const furs = [D.fur, D.furGrey, D.furLight];
    for (let index = 0; index < width; index++) tufts(p, index + 0.1 + (index === 0 ? 0.16 : 0), index + 0.9, 0.38, 0.9, 7, furs[index % furs.length]);
    tufts(p, 0.26, width - 0.08, 0.12, 0.3, 13, D.fur);
    for (let x = 0.3; x < width - 0.05; x += 0.25) p.pixel(x, 0.92, 3, tones(D.fur).dark);
    for (let x = 0.5; x < width; x += 0.5) p.pixel(x, 0.33, 10, tones(D.fur).dark);
    p.pixel(0.1, 0.9, 11, D.gold);
  } },
  couchArm: { height: 14, paint(p) {
    p.box(0, 0.05, 0.2, 0.9, 0, 4, D.oakDark);
    p.box(0, 0.05, 0.2, 0.9, 4, 7, D.oakDark);
  }, fine(p) {
    p.pixel(0.1, 0.9, 11, D.gold);
  } },
  // an open treasure chest, gold heaped to the brim (its top), its lid up against the back; coins spilled around
  lowTable: { height: 18, paint(p, { width, depth }) {
    const wide = width >= depth;
    const [x, y, w, d] = wide ? [0.1, 0.2, width - 0.2, depth - 0.32] : [0.2, 0.1, width - 0.32, depth - 0.2];
    p.shadow(width / 2, depth / 2, width * 7, depth * 3.5);
    if (wide) p.box(0.1, 0.08, width - 0.2, 0.12, 6, 8, D.chestLid);
    else p.box(0.08, 0.1, 0.12, depth - 0.2, 6, 8, D.chestLid);
    p.box(x, y, w, d, 0, 6, D.chest);
    p.box(x + 0.05, y + 0.05, w - 0.1, d - 0.1, 6, 1, D.gold, D.gold);
  }, fine(p, { width, depth }) {
    const wide = width >= depth;
    const [x, y, w, d] = wide ? [0.1, 0.2, width - 0.2, depth - 0.32] : [0.2, 0.1, width - 0.32, depth - 0.2];
    if (wide) for (const share of [0.15, 0.85]) p.onFront(y + d, x + w * share - 0.03, x + w * share + 0.03, 0, 6, D.iron);
    else for (const share of [0.15, 0.85]) p.onSide(x + w, y + d * share - 0.03, y + d * share + 0.03, 0, 6, D.iron);
    if (wide) { p.onFront(y + d, x + w / 2 - 0.06, x + w / 2 + 0.06, 2, 5, D.gold); p.pixel(x + w / 2, y + d, 3, D.ink); }
    else { p.onSide(x + w, y + d / 2 - 0.06, y + d / 2 + 0.06, 2, 5, D.gold); p.pixel(x + w, y + d / 2, 3, D.ink); }
    for (let index = 0; index < 18; index++) {
      const coinX = x + 0.08 + (pick(`coinx${index}`, 100) / 100) * (w - 0.16), coinY = y + 0.08 + (pick(`coiny${index}`, 100) / 100) * (d - 0.16);
      p.pixel(coinX, coinY, 7, index % 3 ? D.goldLight : tones(D.gold).shade);
    }
    p.pixel(x + w * 0.3, y + d * 0.4, 7, D.potions[0]);
    p.pixel(x + w * 0.7, y + d * 0.6, 7, D.potions[1]);
    for (const [cx, cy] of wide ? [[0.3, depth - 0.05], [width - 0.4, depth - 0.02], [width * 0.6, depth - 0.04]] : [[width - 0.05, 0.3], [width - 0.04, depth - 0.4]]) {
      p.pixel(cx, cy, 0, D.gold);
      p.pixel(cx + 0.12, cy, 0, tones(D.gold).shade);
    }
  } },
  // a brazier on three iron legs, its coals glowing (the fire is drawn every frame)
  floorLamp: { height: 34, paint(p) {
    p.shadow(0.5, 0.5, 6, 3);
    for (const [x, y] of [[0.28, 0.3], [0.64, 0.3], [0.46, 0.64]]) p.box(x, y, 0.08, 0.08, 0, 18, D.iron);
    p.box(0.3, 0.3, 0.42, 0.42, 7, 1, D.iron);
    p.box(0.24, 0.24, 0.52, 0.52, 17, 3.5, D.iron);
    p.box(0.18, 0.18, 0.64, 0.64, 20.5, 1.5, D.ironLight);
    p.box(0.25, 0.25, 0.5, 0.5, 21, 1.5, D.coal, D.ember);
  }, fine(p) {
    for (const [x, y] of [[0.35, 0.4], [0.55, 0.32], [0.62, 0.55], [0.42, 0.6]]) p.pixel(x, y, 22.5, D.flame[2]);
  } },
  // a cauldron on its fire, brimming with a green brew (its bubbles are drawn every frame)
  cooler: { height: 30, paint(p) {
    p.shadow(0.5, 0.5, 8, 3.5);
    p.box(0.22, 0.44, 0.56, 0.12, 0, 1.5, D.log);
    p.box(0.44, 0.22, 0.12, 0.56, 0.5, 1.5, D.log);
    for (const [x, y] of [[0.26, 0.42], [0.66, 0.42], [0.46, 0.68]]) p.box(x, y, 0.08, 0.08, 0, 4, D.iron);
    p.ball(0.5, 0.5, 8.5, 7, 5.5, D.cauldron);
    p.ball(0.5, 0.5, 13, 6.5, 2.5, tones(D.cauldron).light);
    p.ball(BREW.x, BREW.y, BREW.z, 5, 1.6, D.brew);
  }, fine(p) {
    for (const across of [-7, 7]) { p.upright(across, 11, D.ironLight, BREW); p.upright(across, 12, D.ironLight, BREW); }
    for (const across of [-3, -1, 2, 4]) p.upright(across, 2 + (across & 1), D.ember, { x: 0.5, y: 0.5 });
    p.upright(0, 1, D.flame[2], { x: 0.5, y: 0.5 });
  } },
  // a quest board under its little roof: notices on parchment (what the user wrote), a lantern on its post
  whiteboard: { height: 68, paint(p) {
    questBoard(p);
    p.onFront(0.34, 0.18, 3.82, 15, 43, D.parchment);
    standing(p, LANTERN, { i: D.iron, f: D.flame[2] }, { x: 0.1, y: 0.47 }, 38);
  }, fine(p, _piece, board) {
    const shade = D.parchmentShade;
    for (const x of [1.42, 2.6]) for (let z = 15; z <= 43; z++) p.pixel(x, 0.34, z, shade);
    for (const x of [0.22, 1.35, 1.5, 2.52, 2.68, 3.76]) { p.pixel(x, 0.34, 42, D.ink); }
    for (const x of [0.6, 2.0, 3.3]) { p.pixel(x, 0.34, 15, D.boardPlanks); p.pixel(x + 0.13, 0.34, 15, D.boardPlanks); }
    for (const x of [1.0, 3.0]) { p.pixel(x, 0.34, 43, D.boardPlanks); }
    p.pixel(3.55, 0.34, 16.5, D.velvet);
    p.pixel(3.55 + 1 / 8, 0.34, 16.5, D.velvet);
    writeOnBoard(p, board);
  }, clickable: questBoard },
  // a tavern bar: barrels set in its front, an alembic steaming on a burner, two tankards of hot mead, a keg, potions
  counter: { height: 26, paint(p) {
    p.box(0, 0.1, 3, 0.85, 0, 11, D.oak);
    p.box(-0.04, 0.06, 3.08, 0.93, 11, 1, D.oakDark);
    p.box(0.38, 0.36, 0.36, 0.3, 12, 2, D.iron);
    p.ball(0.55, 0.5, 16.5, 2.8, 2.6, D.glass);
    for (const x of [1.2, 1.45]) p.box(x, 0.5, 0.14, 0.14, 12, 3, D.tankard, D.foam);
    p.box(2.05, 0.3, 0.5, 0.45, 12, 7, D.barrel);
    p.box(2.7, 0.28, 0.1, 0.1, 12, 4, D.potions[0]);
    p.box(2.74, 0.56, 0.1, 0.1, 12, 3, D.potions[2]);
  }, fine(p) {
    for (let x = 0.25; x < 3; x += 0.25) for (let z = 1; z < 11; z++) p.pixel(x, 0.95, z, tones(D.oak).shade);
    for (const x of [0.75, 2.25]) {
      discOnFront(p, 0.95, x, 5.5, 4, D.barrel);
      discOnFront(p, 0.95, x, 5.5, 4, D.iron, true);
      discOnFront(p, 0.95, x, 5.5, 1, tones(D.barrel).shade);
      p.pixel(x, 0.95, 2.5, D.gold);
    }
    for (let up = 0; up < 3; up++) p.upright(0, 19 + up, D.glass, { x: 0.55, y: 0.5 });
    for (const across of [-1, 0, 1]) p.upright(across, 15, D.alembic, { x: 0.55, y: 0.5 });
    for (const across of [-2, -1, 0, 1, 2]) p.upright(across, 14, D.alembic, { x: 0.55, y: 0.5 });
    for (const x of [1.2, 1.45]) { p.onFront(0.64, x, x + 0.14, 13, 13.5, D.iron); p.pixel(x + 0.16, 0.6, 13.5, D.tankard); }
    for (const z of [13.5, 17.5]) p.onFront(0.75, 2.05, 2.55, z, z + 0.5, D.iron);
    p.pixel(2.3, 0.75, 14.5, D.gold);
    p.pixel(2.75, 0.33, 16.5, D.oak);
    p.pixel(2.79, 0.61, 15.5, D.oak);
  } },
};
