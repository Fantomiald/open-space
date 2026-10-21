// The treehouse's furniture (themes/kit.ts): tables cut from trees, their top's rings and moss, on stumps and roots;
// mushroom stools, ferns and flowers that glow, a little tree with golden leaves, a shelf hollowed in a trunk with its
// jars of fireflies, benches of logs and moss with leaves for cushions, a stump with a teapot, a lantern of fireflies on
// a branch, spring water in a jar, a counter with its teapot and honey, a sheet of bark between two branches.
import { ROOM_PALETTE } from '../../design/room-palette.ts';
import { FOREST_FURNITURE as F } from '../../design/theme-forest.ts';
import type { FurniturePiece, PieceKind } from '../../../shared/room-layout.ts';
import { standing, writeOnBoard, type Design, type Painter } from '../pixel-furniture.ts';
import { tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';

interface Spot { x: number; y: number }

/* Shapes */

/** A flat ellipse on the floor (or at `z`) around a point, `radius` art pixels across and half as deep. */
function ellipse(p: Painter, middle: Spot, radius: number, colour: string, z = 0) {
  const depth = radius / 2;
  for (let row = -Math.floor(depth); row <= Math.floor(depth); row++) {
    const half = Math.round(radius * Math.sqrt(Math.max(0, 1 - (row / depth) ** 2)));
    for (let across = -half; across < half; across++) p.upright(across, z - row, colour, middle);
  }
}

/** A stump around a floor point: bark in vertical ridges, lit from the left, its cut top showing its rings. */
function stump(p: Painter, middle: Spot, z: number, height: number, radius: number, bark = F.bark) {
  const colours = tones(bark);
  for (let across = -radius; across < radius; across++) {
    const front = Math.round((radius / 2) * Math.sqrt(1 - ((across + 0.5) / radius) ** 2));
    const ridge = (across + radius) % 3 === 0;
    const side = across < -radius * 0.55 ? colours.light : across >= radius * 0.4 ? colours.shade : bark;
    for (let up = z - front; up < z + height - front; up++) p.upright(across, up, ridge ? F.barkDark : side, middle);
    for (let up = z + height - front; up <= z + height + front; up++) {
      const distance = Math.hypot((across + 0.5) / radius, (up - z - height) / Math.max(1, radius / 2));
      const ring = Math.floor(distance * 5);
      p.upright(across, up, distance > 0.82 ? colours.light : ring % 2 ? F.ring : F.woodTop, middle);
    }
  }
}

/** Roots splaying from the foot of something, along the floor. */
function roots(p: Painter, middle: Spot, radius: number) {
  for (const [direction, length] of [[-1, 4], [1, 5], [-1, 2], [1, 2]] as const) {
    for (let step = 0; step < length; step++) {
      const across = direction * (radius - 1 + step);
      const up = Math.max(0, 2 - Math.floor(step / 2)) - (length === 2 ? 1 : 0);
      p.upright(across, up, step === length - 1 ? F.barkDark : F.bark, middle);
      p.upright(across, up - 1, F.barkDark, middle);
    }
  }
}

/** Moss in tufts over an edge: a few pixels along a row, lighter on top. */
function mossTufts(p: Painter, middle: Spot, from: number, to: number, z: number, key: string) {
  for (let across = from; across <= to; across++) {
    if (pick(`${key}${across}`, 3) === 0) continue;
    p.upright(across, z, F.moss, middle);
    if (pick(`${key}up${across}`, 3) === 0) p.upright(across, z + 1, F.mossLight, middle);
    if (pick(`${key}down${across}`, 4) === 0) p.upright(across, z - 1, F.mossDark, middle);
  }
}

/** A little mushroom (`size` 1 or 2) standing at `z` above a point. */
function mushroom(p: Painter, middle: Spot, across: number, z: number, cap: string, size = 1) {
  for (let up = 0; up < 1 + size; up++) p.upright(across, z + up, F.stem, middle);
  for (let wide = -size; wide <= size; wide++) p.upright(across + wide, z + 1 + size, cap, middle);
  if (size > 1) for (let wide = -1; wide <= 1; wide++) p.upright(across + wide, z + 2 + size, tones(cap).light, middle);
  if (size > 1) p.upright(across - 1, z + 1 + size, F.spots, middle);
}

/** Twigs sprouting from the top of a branch, a leaf at each step. */
function sprig(p: Painter, middle: Spot, z: number) {
  for (const [lean, length] of [[-1, 5], [1, 4], [0, 6]] as const) for (let step = 0; step < length; step++) {
    const across = Math.round(lean * step * 0.8);
    p.upright(across, z + step, F.barkLight, middle);
    if (step % 2 === 1) {
      p.upright(across - 1, z + step, F.fern, middle);
      p.upright(across + 1, z + step + 1, F.fernLight, middle);
    }
  }
}

/** A big leaf standing for a cushion, around `middle` along its plane, `half` wide: its two halves, its veins, its tip. */
function leafCushion(middle: number, half: number, row: (from: number, to: number, z: number, colour: string) => void) {
  for (let z = 3; z < 18; z++) {
    const share = (z - 3) / 15;
    const wide = half * Math.sin(Math.min(1, share * 1.15) * Math.PI) ** 0.6 * 0.95;
    if (wide < 0.03) continue;
    const vein = (z % 3 === 0);
    row(middle - wide, middle, z, vein ? F.leafCushionDark : tones(F.leafCushion).light);
    row(middle, middle + wide, z, vein ? F.leafCushionDark : F.leafCushion);
    row(middle - 0.02, middle + 0.02, z, F.leafVein);
  }
}

/** The grain of a wooden top along x: a few darker lines, as a plank shows. */
function grainAlongX(p: Painter, fromX: number, toX: number, ys: readonly number[], z: number) {
  for (const y of ys) for (let x = fromX; x < toX; x += 1 / 8) if (pick(`grain${x.toFixed(2)},${y}`, 4)) p.pixel(x, y, z, F.ring);
}

/* The pieces */

/** The laptops of the desks, in wood, a leaf on their back (the boxes stay where hands type). */
function laptop(p: Painter, x: number, y: number, width: number, depth: number) {
  p.box(x, y, width, depth, 11, 1, F.laptop, F.laptopTop);
  p.box(x, 0.55, width, 0.06, 12, 5, F.laptop, F.laptopTop);
}

/** The user's laptop: the same box as the office's (it is what a click opens). */
const paintBossLaptop = (p: Painter) => laptop(p, 1.1, 0.15, 0.8, 0.45);

/** The clumps of the golden tree's crown: across, up, how wide and high. */
const CROWN = [[-3, 27, 3, 2.5], [3, 28, 3, 2.5], [0, 30, 3.5, 3], [-3.5, 32, 2.5, 2.5], [3.5, 33, 2.5, 2.5], [-1, 35, 3, 2.5], [1.5, 36, 2.5, 2.5], [0, 25, 2.5, 2]] as const;

/** The board: a sheet of pale bark on the office's writing plane, between two branches. */
const BOARD = { y: 0.34, fromX: 0.18, toX: 3.82, low: 15, high: 43 };
function paintBoardFrame(p: Painter) {
  for (const x of [0.02, 3.84]) {
    p.box(x, 0.24, 0.14, 0.12, 0, 50, F.bark);
    p.onFront(0.36, x + 0.03, x + 0.06, 2, 48, F.barkDark);
  }
  p.box(0, 0.24, 4, 0.1, 44, 2, F.bark, F.barkLight);
  p.box(0.3, BOARD.y, 3.4, 0.1, 13, 1, F.wood, F.woodTop);
}
function paintBoardSheet(p: Painter) {
  p.onFront(BOARD.y, BOARD.fromX, BOARD.toX, BOARD.low, BOARD.high, F.board);
  for (const z of [BOARD.low, BOARD.high - 1]) p.onFront(BOARD.y, BOARD.fromX, BOARD.toX, z, z + 1, F.boardEdge);
}
const BOARD_BALLOONS = [[0.15, 56, 0], [0.55, 60, 2], [0.3, 65, 1]] as const;

/** A teapot, standing: one letter a pixel (l lid, t its glaze, s spout and handle, h its shine). */
const TEAPOT = [
  '....k.....',
  '...lll....',
  '..ttttt...',
  's.thtttt.s',
  'sthhttttts',
  'sthtttttt.',
  '.ttttttt..',
  '..ttttt...',
];
const TEAPOT_COLOURS = { k: F.teapotLid, l: F.teapotLid, t: F.teapot, s: tones(F.teapot).shade, h: tones(F.teapot).light };
/** A cup cut from an acorn, a pine cone, a pot of honey with its dipper. */
const ACORN_CUP = ['.cc.', 'dttd', 'dddd', '.dd.'];
const PINE_CONE = ['.c.', 'cdc', 'dcd', 'cdc', '.d.'];
const HONEY_POT = [
  '...w..',
  '..nw..',
  '.nnwn.',
  'oooooo',
  'phhhhp',
  'phhyhp',
  'phhhhp',
  '.pppp.',
];
const HONEY_COLOURS = { n: F.paper, w: F.wood, o: F.honeyPot, p: tones(F.honeyPot).shade, h: F.honey, y: tones(F.honey).light };

/** Each mushroom stool's cap, by turns. */
const capOf = (piece: FurniturePiece) => F.caps[Math.round(piece.x * 3 + piece.y * 5) % F.caps.length];
/** A pot of ferns, or of flowers that glow (FLOWERS), by turns. */
export const isFlowerPot = (piece: FurniturePiece) => pick(`pot${piece.x},${piece.y}`, 2) === 0;
/** The glowing flowers of a pot: how far across, how high, and their colour (they pulse, see forest-effects.ts). */
export const FLOWERS = [[-3, 13, 0], [2, 15, 1], [0, 17, 0], [4, 11, 2], [-4, 10, 1]] as const;
/** The jars of fireflies in the hollow trunk (where they are along its front, which niche). */
export const JARS = [{ x: 0.62, low: 2 }, { x: 1.5, low: 10 }, { x: 0.3, low: 18 }] as const;
/** The bookshelf's front, and its niches from the floor up. */
export const SHELF = { y: 0.6, niches: [[2, 9], [11, 17], [19, 23]] as const };
/** The two arched niches of each row of the hollow trunk, along its front. */
const ARCHES = [[0.14, 0.94], [1.06, 1.86]] as const;
/** The lantern on its branch: its middle, and the glass where the fireflies fly. */
export const LANTERN = { x: 0.62, y: 0.42, low: 20, high: 28 };

export const FOREST_FURNITURE: Partial<Record<PieceKind, Design>> = {
  // a thick plank with a live edge on two short logs, moss along its back, a mushroom at a foot
  desk: { height: 24, paint(p) {
    for (const x of [0.32, 1.68]) {
      stump(p, { x, y: 0.5 }, 0, 9, 3);
      roots(p, { x, y: 0.5 }, 3);
    }
    p.box(0, 0, 2, 0.95, 9, 2, F.wood, F.woodTop);
    p.onFront(0.95, 0, 2, 9, 10, F.bark);
    grainAlongX(p, 0.05, 1.95, [0.3, 0.7], 11);
    mushroom(p, { x: 1.68, y: 0.5 }, 3, 3, F.caps[1], 1);
    laptop(p, 0.25, 0.2, 0.7, 0.4);
    p.onFront(0.61, 0.55, 0.65, 14, 15, F.laptopLeaf);
    p.box(1.25, 0.45, 0.45, 0.3, 11, 1, F.paper);
    p.box(1.65, 0.2, 0.14, 0.14, 11, 3, F.clay, F.tea);
  }, fine(p) {
    mossTufts(p, { x: 1, y: 0.02 }, -7, 7, 12, 'deskmoss');
    p.pixel(0, 0.95, 10, F.moss);
    p.pixel(0.1, 0.95, 9, F.mossDark);
  } },
  // the user's desk: a block of a great trunk, a leaf carved on its front, a glowing mushroom for a lamp, a fern, a scroll
  bossDesk: { height: 28, paint(p) {
    p.box(0, 0, 3, 0.95, 0, 9, F.woodDark);
    for (let x = 0.3; x < 3; x += 0.38) p.onFront(0.95, x, x + 0.03, 1, 9, tones(F.woodDark).dark);
    p.box(0, 0, 3, 0.95, 9, 2, F.wood, F.woodTop);
    p.onFront(0.95, 0, 3, 9, 10, F.bark);
    // the carved leaf in the middle of its front
    for (let up = 0; up < 6; up++) {
      const half = [0.05, 0.14, 0.2, 0.2, 0.14, 0.05][up];
      p.onFront(0.95, 1.5 - half, 1.5 + half, 2 + up, 3 + up, F.leafCushion);
    }
    p.onFront(0.95, 1.48, 1.52, 1, 8, F.leafCushionDark);
    roots(p, { x: 0.25, y: 0.6 }, 2);
    roots(p, { x: 2.75, y: 0.6 }, 2);
    grainAlongX(p, 0.05, 2.95, [0.3, 0.7], 11);
    paintBossLaptop(p);
    p.onFront(0.61, 1.45, 1.55, 14, 15, F.laptopLeaf);
    p.box(2.05, 0.5, 0.5, 0.3, 11, 1, F.paper);
    p.box(2.05, 0.5, 0.06, 0.3, 11, 1.5, F.woodTop);
    // the lamp: a mushroom with a glowing cap
    p.box(2.74, 0.16, 0.08, 0.08, 11, 4, F.stem);
    p.ball(2.78, 0.2, 16, 3.5, 2, F.glowWarm);
    // a fern in a cup of bark
    stump(p, { x: 0.35, y: 0.35 }, 11, 2, 2);
    p.ball(0.35, 0.35, 16, 3.5, 2.5, F.fern);
    p.ball(0.3, 0.42, 17, 2, 1.5, F.fernLight);
  }, fine(p) {
    mossTufts(p, { x: 1.5, y: 0.02 }, -11, 11, 12, 'bossmoss');
    for (const across of [-2, 0, 2]) p.upright(across, 14 + Math.abs(across) / 2, F.spots, { x: 2.78, y: 0.2 });
  }, clickable: paintBossLaptop },
  // a mushroom for a stool, its cap spotted, a smaller one growing behind it
  chair: { height: 20, paint(p, piece) {
    const middle = { x: 0.5, y: 0.55 };
    const cap = capOf(piece);
    p.ball(0.5, 0.2, 13, 2.5, 2, cap);
    for (let up = 0; up < 11; up++) for (const across of [0, 1]) p.upright(across, up, across ? F.stemShade : F.stem, { x: 0.5, y: 0.2 });
    p.ball(0.5, 0.2, 13, 2.5, 2, cap);
    p.upright(0, 14, F.spots, { x: 0.5, y: 0.2 });
    for (let across = -3; across < 3; across++) for (let up = 0; up < 5; up++) p.upright(across, up, across >= 1 ? F.stemShade : F.stem, middle);
    ellipse(p, middle, 7, tones(cap).shade, 5);
    ellipse(p, middle, 7, cap, 6);
    ellipse(p, middle, 5, tones(cap).light, 7);
  }, fine(p) {
    const middle = { x: 0.5, y: 0.55 };
    for (const [across, up] of [[-4, 6], [3, 7], [-1, 8], [5, 5], [1, 5]] as const) p.upright(across, up, F.spots, middle);
  } },
  // a hollow log for a pot: ferns spilling out of it, or flowers that glow in the dark
  plant: { height: 26, paint(p, piece) {
    const middle = { x: 0.5, y: 0.5 };
    p.shadow(0.5, 0.5, 6, 3);
    stump(p, middle, 0, 5, 4);
    if (isFlowerPot(piece)) {
      ellipse(p, middle, 4, F.mossDark, 6);
      ellipse(p, middle, 3, F.moss, 7);
      for (const [across, up] of FLOWERS) for (let stem = 6; stem < up; stem++) p.upright(across + Math.round((stem - up) / 6), stem, F.fernDark, middle);
      for (const [across, up] of [[-2, 9], [1, 10], [3, 8]] as const) { p.upright(across, up, F.fern, middle); p.upright(across + 1, up, F.fernLight, middle); }
      return;
    }
    for (const [lean, length, colour] of [[-6, 11, F.fernDark], [6, 10, F.fernDark], [-3, 14, F.fern], [3, 13, F.fern], [0, 16, F.fernLight], [-5, 8, F.fern], [5, 8, F.fernLight]] as const) {
      for (let step = 0; step < length; step++) {
        const share = step / length;
        const across = Math.round(lean * share * 1.3), up = 6 + Math.round(length * share - lean * lean * share * share * 0.12);
        p.upright(across, up, colour, middle);
        if (step % 2 === 0 && step > 1) { p.upright(across - 1, up - 1, colour, middle); p.upright(across + 1, up - 1, tones(colour).light, middle); }
      }
    }
  }, fine(p, piece) {
    if (!isFlowerPot(piece)) return;
    const middle = { x: 0.5, y: 0.5 };
    for (const [across, up, colour] of FLOWERS) {
      const bloom = F.bloom[colour];
      p.upright(across, up, F.bloomCore, middle);
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, 1], [0, -1]] as const) p.upright(across + dx, up + dz, bloom, middle);
    }
  } },
  // a little tree with golden leaves, rooted in a mound of moss, a few leaves of crystal among them
  bigPlant: { height: 46, paint(p) {
    const middle = { x: 0.5, y: 0.5 };
    p.shadow(0.5, 0.5, 9, 4);
    ellipse(p, middle, 7, F.mossDark, 1);
    ellipse(p, middle, 5, F.moss, 2);
    roots(p, middle, 2);
    for (let up = 1; up < 24; up++) {
      const sway = Math.round(Math.sin(up / 4) * 1.2);
      const wide = up < 5 ? 2 : 1;
      for (let across = -wide; across <= wide; across++) p.upright(sway + across, up, across === wide ? F.barkDark : across === -wide ? F.barkLight : F.trunk, middle);
    }
    for (const [direction, from] of [[-1, 14], [1, 17], [-1, 20]] as const) for (let step = 1; step < 6; step++) p.upright(direction * step, from + Math.floor(step / 2), F.trunk, middle);
    // the crown in clumps, each lit from the top left, gaps of shade between them
    for (const [across, up, wide, high] of CROWN) p.ball(0.5 + across / 16, 0.5 - across / 16, up, wide, high, F.goldLeavesDark);
    for (const [across, up, wide, high] of CROWN) p.ball(0.5 + (across - 0.6) / 16, 0.5 - (across - 0.6) / 16, up + 0.7, wide - 1, high - 1, F.goldLeaves);
  }, fine(p) {
    const middle = { x: 0.5, y: 0.5 };
    // single leaves standing out of the crown, lit or in shade
    for (let leaf = 0; leaf < 26; leaf++) {
      const angle = (leaf / 26) * Math.PI * 2;
      const across = Math.round(Math.cos(angle) * (4 + pick(`gl${leaf}`, 2))), up = 31 + Math.round(Math.sin(angle) * (5 + pick(`gu${leaf}`, 2)));
      p.upright(across, up, Math.sin(angle) > 0.2 ? F.goldLeavesLight : F.goldLeavesDark, middle);
    }
    for (let leaf = 0; leaf < 18; leaf++) p.upright(pick(`gx${leaf}`, 7) - 3, 26 + pick(`gz${leaf}`, 11), leaf % 3 ? F.goldLeavesLight : F.goldLeavesDark, middle);
    for (const [across, up] of [[-3, 27], [3, 30], [-1, 35], [4, 27], [1, 37], [-4, 31]] as const) {
      p.upright(across, up, F.glass, middle);
      p.upright(across + 1, up, F.lightBloom, middle);
    }
  } },
  // a hollow in a trunk: three niches with books, jars of fireflies and pine cones; moss and mushrooms on its bark
  bookshelf: { height: 30, paint(p) {
    p.box(0, 0, 2, 0.6, 0, 24, F.bark, F.woodTop);
    for (const x of [0.2, 1.8]) roots(p, { x, y: 0.5 }, 2);
    // ridges of bark running down the trunk, a little wavy
    for (let x = 0.06; x < 2; x += 0.16) for (let z = 0; z < 24; z++) p.pixel(x + (pick(`ridge${x.toFixed(2)},${Math.floor(z / 5)}`, 3) - 1) * 0.03, SHELF.y, z, F.barkDark);
    for (const [low, high] of SHELF.niches) for (const [from, to] of ARCHES) {
      // a hollow with a rounded top, its sill of pale wood
      for (let z = low; z < high; z++) {
        const inset = z >= high - 2 ? (z - high + 3) * 0.07 : 0;
        p.onFront(SHELF.y, from + inset, to - inset, z, z + 1, F.hollow);
      }
      p.onFront(SHELF.y, from, to, low, low + 0.6, tones(F.wood).shade);
    }
    let index = 0;
    for (const [low, high] of SHELF.niches) for (const [from, to] of ARCHES) for (let x = from + 0.06; x < to - 0.1; x += 0.12) {
      if (JARS.some((jar) => jar.low === low && x > jar.x - 0.12 && x < jar.x + 0.26)) continue;
      const kind = pick(`niche${index}`, 9);
      if (kind === 0 && x + 0.3 < to) {
        standing(p, PINE_CONE, { c: F.cone, d: F.coneDark }, { x: x + 0.15, y: SHELF.y - 0.15 }, low + 0.6);
        x += 0.24;
      } else if (kind > 1) p.onFront(SHELF.y, x, x + 0.09, low + 0.6, high - 2 - (index % 3 === 0 ? 1 : 0), F.books[index % F.books.length]);
      index++;
    }
    for (const jar of JARS) {
      p.onFront(SHELF.y, jar.x, jar.x + 0.24, jar.low + 0.6, jar.low + 4.5, F.jar);
      p.onFront(SHELF.y, jar.x + 0.02, jar.x + 0.22, jar.low + 4.5, jar.low + 5.5, F.jarCap);
      p.onFront(SHELF.y, jar.x + 0.03, jar.x + 0.07, jar.low + 1.5, jar.low + 3.5, F.waterTop);
    }
  }, fine(p) {
    for (const jar of JARS) for (const [x, z] of [[0.1, 2], [0.16, 3.5], [0.13, 2.8]] as const) p.pixel(jar.x + x, SHELF.y, jar.low + z, F.firefly);
    mossTufts(p, { x: 1, y: 0.3 }, -8, -3, 24, 'shelfmoss');
    mossTufts(p, { x: 1, y: 0.3 }, 5, 8, 24, 'shelfmoss2');
    mushroom(p, { x: 2, y: 0.4 }, 0, 6, F.caps[1], 2);
    mushroom(p, { x: 2, y: 0.4 }, 2, 4, F.caps[0], 1);
  } },
  // a fallen log along the wall: moss for seats, big leaves for cushions against the wall, its cut end for an arm
  sofa: { height: 22, paint(p, { depth }) {
    p.box(0.05, 0, 0.9, depth, 0, 3, F.bark);
    for (let y = 0.2; y < depth; y += 0.45) p.onSide(0.95, y, y + 0.05, 0, 3, F.barkDark);
    const seat = (depth - 0.22) / depth;
    for (let index = 0; index < depth; index++) {
      const y = 0.22 + index * seat;
      p.box(0.35, y, 0.6, seat - 0.02, 3, 4, F.moss, F.mossLight);
      p.box(0.08, y + 0.08, 0.2, seat - 0.18, 3, 8, F.leafCushionDark);
      leafCushion(y + seat / 2, seat * 0.5, (y0, y1, z, colour) => p.onSide(0.3, y0, y1, z, z + 1, colour));
    }
    p.box(0.05, 0, 0.9, 0.22, 3, 9, F.bark, F.woodTop);
  } },
  sofaArm: { height: 14, paint(p) {
    p.box(0.05, 0, 0.9, 0.22, 0, 3, F.bark);
    p.box(0.05, 0, 0.9, 0.22, 3, 9, F.bark, F.woodTop);
    p.onFront(0.22, 0.1, 0.9, 3, 12, F.ring);
    p.onFront(0.22, 0.3, 0.7, 5, 10, F.woodTop);
    p.onFront(0.22, 0.45, 0.55, 7, 8, F.ring);
  } },
  // the same bench facing the room
  couch: { height: 22, paint(p, { width }) {
    p.box(0, 0.05, width, 0.9, 0, 3, F.bark);
    for (let x = 0.3; x < width; x += 0.45) p.onFront(0.95, x, x + 0.05, 0, 3, F.barkDark);
    for (let index = 0; index < width; index++) {
      p.box(index + 0.14, 0.08, 0.72, 0.2, 3, 8, F.leafCushionDark);
      leafCushion(index + 0.5, 0.5, (x0, x1, z, colour) => p.onFront(0.3, x0, x1, z, z + 1, colour));
      p.box(index + 0.04, 0.35, 0.92, 0.6, 3, 4, F.moss, F.mossLight);
    }
    p.box(0, 0.05, 0.2, 0.9, 3, 9, F.bark, F.woodTop);
  } },
  couchArm: { height: 14, paint(p) {
    p.box(0, 0.05, 0.2, 0.9, 0, 3, F.bark);
    p.box(0, 0.05, 0.2, 0.9, 3, 9, F.bark, F.woodTop);
    p.onSide(0.2, 0.1, 0.9, 3, 12, F.ring);
    p.onSide(0.2, 0.3, 0.7, 5, 10, F.woodTop);
  } },
  // a wide stump, its rings for a top, a teapot and acorn cups on it
  lowTable: { height: 22, paint(p, { width, depth }) {
    const middle = { x: width / 2, y: depth / 2 };
    stump(p, middle, 0, 7, 9);
    roots(p, middle, 8);
    mushroom(p, middle, 7, 1, F.caps[0], 1);
    const pot = width > depth ? { x: width * 0.3, y: depth * 0.4 } : { x: width * 0.4, y: depth * 0.3 };
    standing(p, TEAPOT, TEAPOT_COLOURS, pot, 7);
    standing(p, ACORN_CUP, { c: F.cone, d: F.coneDark, t: F.tea }, width > depth ? { x: width * 0.5, y: depth * 0.75 } : { x: width * 0.75, y: depth * 0.5 }, 7);
  }, fine(p, { width, depth }) {
    mossTufts(p, { x: width / 2, y: depth / 2 }, 4, 8, 3, 'tablemoss');
  } },
  // a crooked branch from the floor, a lantern of fireflies hanging from its end
  floorLamp: { height: 38, paint(p) {
    const middle = { x: 0.5, y: 0.5 };
    ellipse(p, middle, 5, F.mossDark, 1);
    roots(p, middle, 1);
    for (let up = 0; up < 33; up++) {
      const across = Math.round(Math.sin(up / 6) * 1.5 - Math.max(0, up - 26) * 0.6);
      p.upright(across, up, F.bark, middle);
      p.upright(across + 1, up, F.barkDark, middle);
    }
    for (let step = 0; step < 6; step++) p.upright(-3 + step, 33 + (step < 2 ? step : 2), F.bark, middle);
    for (const [across, up] of [[-5, 31], [-6, 30], [3, 34], [4, 35], [-2, 20], [-3, 21]] as const) p.upright(across, up, F.fern, middle);
    // the lantern, hanging from a cord
    const lantern = { x: LANTERN.x, y: LANTERN.y };
    for (let up = LANTERN.high + 2; up < 34; up++) p.upright(0, up, F.lanternIron, lantern);
    for (let across = -3; across <= 3; across++) {
      for (let up = LANTERN.low; up < LANTERN.high; up++) p.upright(across, up, Math.abs(across) === 3 ? tones(F.lanternGlass).shade : F.lanternGlass, lantern);
      if (Math.abs(across) < 3) p.upright(across, LANTERN.high, F.lanternIron, lantern);
      p.upright(across, LANTERN.low - 1, F.lanternIron, lantern);
    }
    for (const across of [-1, 0, 1]) p.upright(across, LANTERN.high + 1, F.lanternIron, lantern);
  }, fine(p) {
    for (const [across, up] of [[-1, 22], [1, 25], [0, 24], [-2, 26]] as const) p.upright(across, up, F.glow, { x: LANTERN.x, y: LANTERN.y });
  } },
  // spring water in a big jar on a stump, a wooden tap, a cup beside it
  cooler: { height: 30, paint(p) {
    const middle = { x: 0.5, y: 0.5 };
    stump(p, middle, 0, 12, 5);
    roots(p, middle, 4);
    for (let across = -4; across < 4; across++) {
      const front = Math.round(2 * Math.sqrt(1 - ((across + 0.5) / 4) ** 2));
      const edge = across === -4 || across === 3;
      for (let up = 13 - front; up <= 23 + front; up++) {
        const colour = up < 20 - front ? (across < -1 ? F.waterTop : F.water) : up <= 20 + front ? F.waterTop : F.jar;
        p.upright(across, up, edge ? F.glass : colour, middle);
      }
    }
    for (let across = -2; across < 2; across++) for (let up = 24; up < 27; up++) p.upright(across, up, up === 26 ? tones(F.cork).light : F.cork, middle);
    p.box(0.45, 0.78, 0.1, 0.12, 14, 2, F.wood, F.woodTop);
    p.box(0.7, 0.75, 0.12, 0.12, 12, 2, F.clay, F.water);
  }, fine(p) {
    const middle = { x: 0.5, y: 0.5 };
    for (let up = 15; up < 21; up++) p.upright(-3, up, F.glass, middle);
    for (const [across, up] of [[0, 16], [1, 18], [-1, 19]] as const) p.upright(across, up, F.waterTop, middle);
  } },
  // a counter of planks: a teapot where the coffee was, two cups of tea, a pot of honey, jam, a basket of mushrooms
  counter: { height: 26, paint(p) {
    p.box(0, 0.1, 3, 0.85, 0, 11, F.wood);
    for (let x = 0.25; x < 3; x += 0.25) p.onFront(0.95, x - 0.015, x + 0.015, 1, 10, tones(F.wood).shade);
    for (const x of [0, 2.9]) p.box(x, 0.1, 0.1, 0.85, 0, 11, F.bark, F.barkLight);
    p.box(0, 0.1, 3, 0.85, 11, 1, F.woodDark, F.woodTop);
    grainAlongX(p, 0.05, 2.95, [0.4, 0.75], 12);
    // the big teapot (the steam rises from its lid)
    p.ball(0.55, 0.5, 15, 4.5, 3.5, F.teapot);
    p.ball(0.55, 0.5, 18.5, 2.5, 1.2, F.teapotLid);
    p.pixel(0.55, 0.5, 20, F.teapotLid);
    for (let step = 0; step < 4; step++) p.upright(5 + step, 15 + step, F.teapot, { x: 0.55, y: 0.5 });
    for (const up of [14, 15, 16, 17]) p.upright(-6, up, tones(F.teapot).shade, { x: 0.55, y: 0.5 });
    for (const x of [1.2, 1.45]) p.box(x, 0.5, 0.14, 0.14, 12, 3, F.clay, F.tea);
    standing(p, HONEY_POT, HONEY_COLOURS, { x: 2.3, y: 0.55 }, 12);
    p.box(2.62, 0.3, 0.12, 0.12, 12, 3, F.glass, F.jam);
    p.box(2.62, 0.3, 0.12, 0.12, 15, 0.6, F.cork);
    // a little basket of mushrooms
    p.box(1.7, 0.3, 0.3, 0.25, 12, 2, F.cork);
    for (const [x, y] of [[1.78, 0.38], [1.9, 0.42]] as const) p.ball(x, y, 15, 1.6, 1, F.caps[1]);
  }, fine(p) {
    mossTufts(p, { x: 1.5, y: 0.95 }, -12, -6, 11, 'countermoss');
    mossTufts(p, { x: 1.5, y: 0.95 }, 8, 11, 11, 'countermoss2');
  } },
  // a sheet of pale bark tied between two branches, leaves sprouting from their tops; the notes on it
  whiteboard: { height: 70, paint(p, _piece, board) {
    paintBoardFrame(p);
    for (const x of [0.09, 3.91]) sprig(p, { x, y: 0.3 }, 50);
    for (const x of [1.3, 2.6]) sprig(p, { x, y: 0.3 }, 46);
    p.box(0.5, BOARD.y + 0.02, 0.25, 0.05, 14, 1, F.barkDark);
    p.box(0.85, BOARD.y + 0.02, 0.2, 0.05, 14, 1, F.woodDark);
    if (board.kind === 'birthday') for (const [x, z, colour] of BOARD_BALLOONS) p.ball(x, 0.3, z, 3.5, 4.5, ROOM_PALETTE.festive.balloons[colour]);
  }, fine(p, _piece, board) {
    paintBoardSheet(p);
    // the twine at its four corners
    for (const x of [BOARD.fromX + 0.04, BOARD.toX - 0.08]) for (const z of [BOARD.low + 1, BOARD.high - 2]) {
      p.pixel(x, BOARD.y, z, F.twine);
      p.pixel(x + 0.06, BOARD.y, z, F.twine);
    }
    writeOnBoard(p, board);
    if (board.kind === 'birthday') for (const [x, z] of BOARD_BALLOONS) for (let up = 50; up < z - 4; up++) p.pixel(0.1 + (x - 0.1) * (up - 50) / (z - 54), 0.3, up, ROOM_PALETTE.festive.white);
  }, clickable(p) {
    paintBoardFrame(p);
    paintBoardSheet(p);
  } },
};
