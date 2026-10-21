// The shuttle's furniture (themes/kit.ts): white hulls that float over a cyan glow, with a dark keel and thrusters where
// legs were; holographic screens, a board of light, crystals of data, plants under glass and an alien tree, orbs of
// light, a holographic planet over the tables. Then what moves and glows every frame over them, and their lights.
import { ROOM_PALETTE } from '../../design/room-palette.ts';
import { SPACE_FURNITURE as F } from '../../design/theme-space.ts';
import type { FurniturePiece, Layout, PieceKind } from '../../../shared/room-layout.ts';
import { toScreen, type Point } from '../geometry.ts';
import { furnitureDepth, writeOnBoard, type Design, type Painter } from '../pixel-furniture.ts';
import { ART_SCALE, tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import type { ThemeEffect, ThemeLight } from './kit.ts';

type Context = CanvasRenderingContext2D;
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

/** The cyan glow on the floor under what floats, brighter towards its middle. */
function halo(p: Painter, middle: Spot, radius: number) {
  ellipse(p, middle, radius, F.haloOuter);
  ellipse(p, middle, radius * 0.66, F.haloInner);
  ellipse(p, middle, radius * 0.33, F.haloCore);
}

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

/** A case of glass around a floor point, see-through, its edges and rims brighter; round on top when `dome` is given. */
function glassCase(p: Painter, middle: Spot, z: number, height: number, radius: number, dome = 0) {
  for (let across = -radius; across < radius; across++) {
    const span = Math.sqrt(1 - ((across + 0.5) / radius) ** 2);
    const front = Math.round((radius / 2) * span);
    const top = dome ? z + height + Math.round(dome * span) : z + height + front;
    const edge = across === -radius || across === radius - 1;
    for (let up = z - front; up <= top; up++) {
      const rim = up === z - front || up === top || (!dome && up === z + height - front);
      p.upright(across, up, edge || rim ? F.glassEdge : F.glassFill, middle);
    }
  }
}

/** A shine down the left of a glass case. */
function shine(p: Painter, middle: Spot, from: number, to: number, radius: number) {
  for (let up = from; up < to; up++) p.upright(-radius + 2, up, F.glassShine, middle);
  p.upright(-radius + 3, to - 2, F.glassShine, middle);
}

/** Two pixels of flame under a keel, at `z`: a thruster holding the piece up. */
function thruster(p: Painter, x: number, y: number, z: number) {
  p.pixel(x, y, z, F.glowPale);
}

/** A screen of light standing on the plane y = `y`, seen from behind: lines of what its reader sees, the right way for them. */
function holoScreen(p: Painter, y: number, fromX: number, toX: number, low: number, high: number) {
  p.onFront(y, fromX, toX, low, high, F.holo);
  p.onFront(y, fromX, toX, high - 1, high, F.holoBright);
  p.onFront(y, fromX, toX, low, low + 0.6, F.holoBright);
  const width = toX - fromX - 0.16;
  [0.8, 0.45, 0.65].forEach((share, index) => {
    const row = high - 2.5 - index * 1.4;
    if (row > low + 0.5) p.onFront(y, toX - 0.08 - width * share, toX - 0.08, row, row + 0.6, F.holoLine);
  });
}

/* The pieces */

/** The holographic screens of the desks and of the commander's post (the laptop's box, where hands type). */
const SCREEN = { desk: { fromX: 0.25, toX: 0.95 }, bossDesk: { fromX: 1.1, toX: 1.9 }, y: 0.61, low: 12, high: 17 };

/** The data crystals of the bay: where each stands along its front, its rows, height and colour. */
function crystalsOf(): { x: number; low: number; high: number; colour: string }[] {
  const crystals: { x: number; low: number; high: number; colour: string }[] = [];
  let index = 0;
  for (const [low, high] of [[4, 9.5], [11.5, 16], [18, 22]]) {
    for (let x = 0.22; x < 1.75; x += 0.3) {
      crystals.push({ x, low, high: high - pick(`crystal${index}`, 3), colour: F.crystals[pick(`hue${index}`, F.crystals.length)] });
      index++;
    }
  }
  return crystals;
}
const CRYSTALS = crystalsOf();

/** The bay's front, where its crystals stand. */
const BAY = { y: 0.6 };

/** The board of light: two emitter bars, above and under the writing plane (kept where the office's board is). */
const BOARD = { y: 0.34, fromX: 0.18, toX: 3.82, low: 15, high: 43 };
function paintBoardFrame(p: Painter) {
  for (const [z, height] of [[11, 3], [43, 2]] as const) p.box(0.1, 0.22, 3.8, 0.12, z, height, F.hull, F.hullTop);
  for (const x of [0, 3.82]) p.box(x, 0.18, 0.18, 0.2, 10, 36, F.hullShade, F.hullTop);
}
const BOARD_BALLOONS = [[0.15, 54, 0], [0.55, 58, 2], [0.3, 63, 1]] as const;

/** The seats' top, where the office's cushions are. */
const SEAT_TOP = 7;
/** The buds of a plant under glass, and the vines hanging from the alien tree (across, from, to: a fruit at their end), in art pixels. */
const BUDS = [[-2, 13], [2, 15], [0, 11], [3, 11], [-3, 10]] as const;
const VINES = [[-4, 25, 19], [-1, 24, 17], [3, 26, 21], [5, 27, 23]] as const;
const budOf = (piece: FurniturePiece) => F.buds[(piece.x + piece.y) % 2];

export const SPACE_FURNITURE: Partial<Record<PieceKind, Design>> = {
  // a white console on a dark keel, floating on its thrusters; a holographic screen where the laptop was
  desk: { height: 22, paint(p) {
    p.box(0.55, 0.3, 0.9, 0.35, 5, 2, F.keel);
    p.box(0.12, 0.08, 1.76, 0.8, 7, 2, F.hullShade, F.hullTop);
    p.box(0, 0, 2, 0.95, 9, 2, F.hull, F.hullTop);
    p.onFront(0.95, 0.08, 1.92, 9, 10, F.glow);
    p.box(0.25, 0.2, 0.7, 0.4, 11, 1, F.keel, F.glowDim);
    p.box(1.65, 0.2, 0.14, 0.14, 11, 3, F.hull, F.glow);
  }, fine(p) {
    holoScreen(p, SCREEN.y, SCREEN.desk.fromX, SCREEN.desk.toX, SCREEN.low, SCREEN.high);
    for (const x of [0.6, 1.4]) thruster(p, x, 0.5, 4);
  }, ground: (p) => halo(p, { x: 1, y: 0.5 }, 13) },
  // the commander's post: longer, a gold line, its row of status lights, a console, a star map in light
  bossDesk: { height: 30, paint(p) {
    p.box(0.5, 0.28, 2, 0.4, 4, 3, F.keel);
    p.box(0.12, 0.08, 2.76, 0.8, 7, 2, F.hullShade, F.hullTop);
    p.box(0, 0, 3, 0.95, 9, 2, F.hull, F.hullTop);
    p.onFront(0.95, 0.06, 2.94, 9, 10, F.command);
    p.onFront(0.88, 0.25, 2.75, 7, 8.5, F.keel);
    for (let index = 0; index < 12; index++) p.onFront(0.88, 0.35 + index * 0.2, 0.43 + index * 0.2, 7.5, 8.5, F.statusLights[pick(`boss${index}`, F.statusLights.length)]);
    p.box(1.1, 0.15, 0.8, 0.45, 11, 1, F.keel, F.glowDim);
    p.box(0.15, 0.15, 0.7, 0.5, 11, 1, F.pad, F.padScreen);
    p.box(2.05, 0.5, 0.5, 0.3, 11, 1, F.pad, F.padScreen);
    cylinder(p, { x: 2.75, y: 0.25 }, 11, 2, 2, F.hull, F.glow);
  }, fine(p) {
    holoScreen(p, SCREEN.y, SCREEN.bossDesk.fromX, SCREEN.bossDesk.toX, SCREEN.low, SCREEN.high);
    for (const x of [0.7, 1.5, 2.3]) thruster(p, x, 0.5, 3);
    // the console's keys, and the star map over its projector
    for (const [x, y] of [[0.3, 0.3], [0.45, 0.3], [0.6, 0.3], [0.3, 0.5], [0.6, 0.5]]) p.pixel(x, y, 12, F.statusLights[pick(`key${x}${y}`, 4)]);
    const map = { x: 2.75, y: 0.25 };
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * Math.PI * 2;
      p.upright(Math.round(Math.cos(angle) * 4), 19 + Math.round(Math.sin(angle) * 2), F.holo, map);
    }
    for (const [across, up] of [[0, 19], [-2, 20], [2, 18], [1, 21], [-3, 18]] as const) p.upright(across, up, F.holoBright, map);
    for (let up = 14; up < 18; up++) p.upright(0, up, F.holo, map);
  }, ground: (p) => halo(p, { x: 1.5, y: 0.5 }, 19) },
  // an egg-shaped shell on a short stem, floating, its cushion inside
  chair: { height: 22, paint(p) {
    p.box(0.4, 0.4, 0.2, 0.2, 2, 3, F.keel);
    p.ball(0.45, 0.3, 11, 6, 7, F.hull);
    p.ball(0.5, 0.42, 10, 4, 5, F.cushion);
    p.box(0.18, 0.3, 0.64, 0.5, 5, 2, F.hull, F.cushion);
  }, fine: (p) => thruster(p, 0.5, 0.5, 1), ground: (p) => halo(p, { x: 0.5, y: 0.5 }, 7) },
  // a hydroponic pod under a bell of glass: glowing leaves and buds
  plant: { height: 26, float: 1, paint(p, piece) {
    const middle = { x: 0.5, y: 0.5 };
    cylinder(p, middle, 2, 2, 5, F.hull);
    cylinder(p, middle, 4, 1, 5, F.glowDim, F.substrate);
    for (let up = 5; up < 9; up++) for (const across of [-2, 0, 2]) p.upright(across, up + Math.abs(across) / 2, F.leafDark, middle);
    p.ball(0.5, 0.5, 10, 4, 3, F.leafDark);
    p.ball(0.4, 0.6, 12, 2.5, 2.2, F.leaf);
    p.ball(0.62, 0.4, 14, 2.4, 2, F.leaf);
    glassCase(p, middle, 5, 10, 5, 4);
    const bud = budOf(piece);
    for (const [across, up] of BUDS) p.upright(across, up, bud, middle);
  }, fine: (p) => shine(p, { x: 0.5, y: 0.5 }, 8, 15, 5),
  ground(p) {
    p.shadow(0.5, 0.5, 4, 2);
    halo(p, { x: 0.5, y: 0.5 }, 7);
  } },
  // an alien tree in a cylinder of glass: a twisted violet trunk, a glowing crown, fruits of light
  bigPlant: { height: 44, float: 1, paint(p) {
    const middle = { x: 0.5, y: 0.5 };
    cylinder(p, middle, 1, 3, 7, F.hull);
    cylinder(p, middle, 4, 1, 7, F.glowDim, F.substrate);
    for (let up = 5; up < 24; up++) {
      const sway = Math.round(Math.sin(up / 3) * 1.4);
      p.upright(sway, up, F.trunk, middle);
      p.upright(sway + 1, up, tones(F.trunk).shade, middle);
    }
    for (const [across, up] of [[-3, 16], [-4, 17], [3, 19], [4, 20]] as const) p.upright(across, up, F.trunk, middle);
    p.ball(0.5, 0.5, 27, 6, 4.5, F.canopyDark);
    p.ball(0.4, 0.6, 29, 4, 3, F.canopy);
    p.ball(0.62, 0.4, 31, 3.5, 2.5, F.canopyLight);
    p.ball(0.5, 0.5, 33, 2.5, 2, F.canopy);
    glassCase(p, middle, 5, 31, 7);
    cylinder(p, middle, 36, 2, 7, F.hull, F.hullTop);
  }, fine(p) {
    const middle = { x: 0.5, y: 0.5 };
    // vines hanging from the crown, a fruit of light at their end
    for (const [across, from, to] of VINES) {
      for (let up = from; up > to; up--) p.upright(across, up, F.leafDark, middle);
      p.upright(across, to, F.fruit, middle);
    }
    shine(p, middle, 8, 34, 7);
  }, ground: (p) => halo(p, { x: 0.5, y: 0.5 }, 10) },
  // a bay of data crystals behind dark glass, lines of light between their rows
  bookshelf: { height: 26, paint(p) {
    p.box(0.08, 0.08, 1.84, 0.45, 0, 2, F.keel);
    p.box(0, 0, 2, 0.6, 2, 22, F.hull, F.hullTop);
    p.onFront(BAY.y, 0.12, 1.88, 3.5, 23, F.bayGlass);
    for (const z of [10.5, 17]) p.onFront(BAY.y, 0.12, 1.88, z, z + 1, F.hullShade);
    for (const x of [0.67, 1.33]) p.onFront(BAY.y, x - 0.02, x + 0.02, 3.5, 23, F.pad);
    for (const crystal of CRYSTALS) {
      p.onFront(BAY.y, crystal.x - 0.04, crystal.x + 0.24, crystal.low, crystal.low + 1, F.glowDim);
      p.onFront(BAY.y, crystal.x, crystal.x + 0.2, crystal.low + 1, crystal.high, crystal.colour);
      p.onFront(BAY.y, crystal.x, crystal.x + 0.08, crystal.low + 1, crystal.high, tones(crystal.colour).light);
      p.onFront(BAY.y, crystal.x + 0.06, crystal.x + 0.14, crystal.high, crystal.high + 1.5, tones(crystal.colour).light);
    }
  }, fine(p) {
    p.onFront(BAY.y, 0.12, 1.88, 2.5, 3.5, F.glow);
  }, ground: (p) => halo(p, { x: 1, y: 0.3 }, 12) },
  // capsule benches along the left wall: each seat a white shell padded inside, a hood over it, lines of light
  sofa: { height: 28, paint(p, { depth }) {
    p.box(0.15, 0.08, 0.75, depth - 0.16, 0, 2, F.keel);
    const seat = (depth - 0.22) / depth;
    for (let index = 0; index < depth; index++) {
      const y = 0.22 + index * seat;
      p.box(0.06, y, 0.25, seat - 0.04, 2, 19, F.hull, F.hullTop);
      p.onSide(0.31, y + 0.06, y + seat - 0.1, 8, 19, F.cushion);
      p.box(0.06, y, 0.5, seat - 0.04, 21, 3, F.hull, F.hullTop);
      p.onSide(0.56, y + 0.04, y + seat - 0.08, 21, 22, F.glow);
      p.box(0.31, y, 0.64, seat - 0.04, 2, SEAT_TOP - 2, F.hull, F.cushion);
      p.onSide(0.95, y + 0.06, y + seat - 0.1, 3, 4, F.glow);
    }
    p.box(0.05, 0, 0.9, 0.22, 2, 10, F.hull, F.hullTop);
    p.onFront(0.22, 0.1, 0.9, 10, 11, F.glow);
  }, ground: (p, { depth }) => halo(p, { x: 0.5, y: depth / 2 }, 6 + depth * 4) },
  sofaArm: { height: 14, paint(p) {
    p.box(0.15, 0, 0.75, 0.22, 0, 2, F.keel);
    p.box(0.05, 0, 0.9, 0.22, 2, 10, F.hull, F.hullTop);
    p.onFront(0.22, 0.1, 0.9, 10, 11, F.glow);
  } },
  // the same bench facing the room, its back on the back wall's side
  couch: { height: 28, paint(p, { width }) {
    p.box(0.08, 0.15, width - 0.16, 0.72, 0, 2, F.keel);
    for (let index = 0; index < width; index++) {
      p.box(index + 0.04, 0.06, 0.92, 0.25, 2, 19, F.hull, F.hullTop);
      p.onFront(0.31, index + 0.1, index + 0.9, 8, 19, F.cushion);
      p.box(index + 0.04, 0.06, 0.92, 0.5, 21, 3, F.hull, F.hullTop);
      p.onFront(0.56, index + 0.08, index + 0.92, 21, 22, F.glow);
      p.box(index + 0.04, 0.31, 0.92, 0.64, 2, SEAT_TOP - 2, F.hull, F.cushion);
      p.onFront(0.95, index + 0.12, index + 0.88, 3, 4, F.glow);
    }
    p.box(0, 0.05, 0.2, 0.9, 2, 10, F.hull, F.hullTop);
    p.onSide(0.2, 0.1, 0.9, 10, 11, F.glow);
  }, ground: (p, { width }) => halo(p, { x: width / 2, y: 0.5 }, 6 + width * 4) },
  couchArm: { height: 14, paint(p) {
    p.box(0, 0.15, 0.15, 0.72, 0, 2, F.keel);
    p.box(0, 0.05, 0.2, 0.9, 2, 10, F.hull, F.hullTop);
    p.onSide(0.2, 0.1, 0.9, 10, 11, F.glow);
  } },
  // a round table of light on one stem: its emitter in the middle (the planet over it moves, see paintSpaceEffects)
  lowTable: { height: 12, paint(p, { width, depth }) {
    const middle = { x: width / 2, y: depth / 2 };
    cylinder(p, middle, 1, 4, 3, F.keel);
    p.box(0.1, 0.1, width - 0.2, depth - 0.2, 5, 2, F.hull, F.hullTop);
    p.onFront(depth - 0.1, 0.18, width - 0.18, 5, 6, F.glow);
    p.onSide(width - 0.1, 0.18, depth - 0.18, 5, 6, F.glowDim);
    p.box(width * 0.2, depth * 0.2, 0.12, 0.12, 7, 3, F.hull, F.drink);
    p.box(width - 0.55, depth - 0.45, 0.35, 0.25, 7, 1, F.pad, F.padScreen);
  }, fine(p, { width, depth }) {
    const middle = { x: width / 2, y: depth / 2 };
    ellipse(p, middle, 3, F.glowDim, 7);
    ellipse(p, middle, 1.6, F.glowPale, 7);
  }, ground: (p, { width, depth }) => halo(p, { x: width / 2, y: depth / 2 }, 4 + (width + depth) * 3) },
  // an orb of light floating above its pad, a ring around it
  floorLamp: { height: 36, float: 2, paint(p) {
    p.ball(0.5, 0.5, 25, 4, 4, F.orb);
  }, fine(p) {
    const middle = { x: 0.5, y: 0.5 };
    for (let step = 0; step < 28; step++) {
      const angle = (step / 28) * Math.PI * 2;
      const across = Math.round(Math.cos(angle) * 7), up = 25 + Math.round(Math.sin(angle) * 2);
      if (Math.sin(angle) < 0 || Math.abs(across) > 3) p.upright(across, up, Math.sin(angle) < 0 ? F.glow : F.glowDim, middle);
    }
    p.upright(-2, 27, F.glassShine, middle);
    p.upright(-1, 28, F.glassShine, middle);
  }, ground(p) {
    const middle = { x: 0.5, y: 0.5 };
    halo(p, middle, 9);
    ellipse(p, middle, 4, F.keel);
    ellipse(p, middle, 2, F.glow);
  } },
  // a dispenser of water and oxygen: a white cabinet, a glass tank on it (its bubbles rise, see paintSpaceEffects)
  cooler: { height: 28, paint(p) {
    const middle = { x: 0.5, y: 0.5 };
    p.box(0.3, 0.3, 0.4, 0.4, 0, 1, F.keel);
    p.box(0.25, 0.25, 0.5, 0.5, 1, 12, F.hull, F.hullTop);
    p.onFront(0.75, 0.33, 0.67, 4, 9, F.bayGlass);
    p.onFront(0.75, 0.45, 0.55, 8, 9, F.glow);
    p.onFront(0.75, 0.42, 0.58, 4, 5, F.hullShade);
    p.onFront(0.75, 0.33, 0.4, 10.5, 11.5, F.statusLights[0]);
    p.onFront(0.75, 0.6, 0.67, 10.5, 11.5, F.statusLights[3]);
    cylinder(p, middle, 13, 8, 4, F.oxygen, F.oxygenTop);
    glassCase(p, middle, 13, 10, 4);
    cylinder(p, middle, 23, 1, 4, F.hull, F.hullTop);
  }, fine: (p) => shine(p, { x: 0.5, y: 0.5 }, 15, 22, 4) },
  // the meal synthesizer: a white counter lit along its edge, the machine where the coffee was, two steaming cups, a menu in light
  counter: { height: 26, paint(p) {
    p.box(0.08, 0.18, 2.84, 0.7, 0, 2, F.keel);
    p.box(0, 0.1, 3, 0.85, 2, 9, F.hull, F.hullTop);
    for (const x of [1, 2]) p.onFront(0.95, x - 0.02, x + 0.02, 3, 9, F.hullShade);
    p.box(0, 0.1, 3, 0.85, 11, 1, F.pad, F.bayGlass);
    p.box(0.3, 0.3, 0.5, 0.4, 12, 8, F.hull, F.hullTop);
    p.onFront(0.7, 0.36, 0.74, 13, 18, F.bayGlass);
    p.onFront(0.7, 0.42, 0.66, 13, 14, F.hullTop);
    p.box(0.48, 0.44, 0.14, 0.12, 20, 1, F.keel, F.glowDim);
    for (const x of [1.2, 1.45]) p.box(x, 0.5, 0.14, 0.14, 12, 3, F.hull, F.drink);
    p.box(2.1, 0.35, 0.4, 0.4, 12, 2, F.hull, F.glowDim);
  }, fine(p) {
    p.onFront(0.95, 0.05, 2.95, 9.5, 10.5, F.glow);
    p.onFront(0.7, 0.38, 0.72, 17, 18, F.glow);
    p.onFront(0.7, 0.36, 0.42, 19, 20, F.statusLights[0]);
    holoScreen(p, 0.55, 2.12, 2.48, 15, 22);
  } },
  // a board of light between two floating emitter bars: the notes stay dark on its pale glow
  whiteboard: { height: 68, float: 1, paint(p, _piece, board) {
    paintBoardFrame(p);
    if (board.kind === 'birthday') for (const [x, z, colour] of BOARD_BALLOONS) p.ball(x, 0.3, z, 3.5, 4.5, ROOM_PALETTE.festive.balloons[colour]);
  }, fine(p, _piece, board) {
    p.onFront(BOARD.y, BOARD.fromX, BOARD.toX, BOARD.low, BOARD.high, F.holoBoard);
    for (const z of [BOARD.low, BOARD.high - 1]) p.onFront(BOARD.y, BOARD.fromX, BOARD.toX, z, z + 1, F.holoBoardEdge);
    p.onFront(BOARD.y + 0.04, 0.12, 3.88, 13, 14, F.glow);
    p.onFront(BOARD.y + 0.04, 0.12, 3.88, 43, 44, F.glow);
    writeOnBoard(p, board);
    if (board.kind === 'birthday') for (const [x, z] of BOARD_BALLOONS) for (let up = 46; up < z - 4; up++) p.pixel(0.1 + (x - 0.1) * (up - 46) / (z - 50), 0.3, up, ROOM_PALETTE.festive.white);
  }, clickable(p) {
    paintBoardFrame(p);
    p.onFront(BOARD.y, BOARD.fromX, BOARD.toX, BOARD.low, BOARD.high, F.holoBoard);
  }, ground(p) {
    for (const x of [0.1, 3.9]) {
      halo(p, { x, y: 0.3 }, 6);
      ellipse(p, { x, y: 0.3 }, 2, F.glow);
    }
  } },
};

/* What moves and glows every frame, in room pixels */

/** How long a floating piece takes to bob up and down, and its phase: the same beat as pixel-furniture.ts. */
const BOB_MS = 3200;
function bobOf(piece: FurniturePiece, time: number): number {
  const float = SPACE_FURNITURE[piece.kind]?.float;
  if (!float || !time) return 0;
  const phase = ((piece.x * 7 + piece.y * 13) % 10) / 10;
  return Math.round(Math.sin((time / BOB_MS + phase) * Math.PI * 2) * float) * ART_SCALE;
}

/** A point of a piece in room pixels: (x, y) in tiles from its corner, `z` art pixels up, raised by its bob. */
function pointOf(piece: FurniturePiece, x: number, y: number, z: number, lift: number): Point {
  const point = toScreen({ x: piece.x + x, y: piece.y + y });
  return { x: point.x, y: point.y - z * ART_SCALE - lift };
}

/** An art pixel (or `size` of them) at a room point, on the art grid. */
function dot(context: Context, point: Point, colour: string, alpha: number, size = 1) {
  if (alpha <= 0.01) return;
  context.globalAlpha = Math.min(1, alpha);
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x / ART_SCALE) * ART_SCALE, Math.round(point.y / ART_SCALE) * ART_SCALE, ART_SCALE * size, ART_SCALE * size);
}

/** A line of art pixels between two room points. */
function trace(context: Context, from: Point, to: Point, colour: string, alpha: number) {
  const steps = Math.max(1, Math.round(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / ART_SCALE));
  for (let step = 0; step <= steps; step++) dot(context, { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps }, colour, alpha);
}

/** A band of light running down a holographic screen, and now and then a flicker over all of it. */
function scanScreen(context: Context, piece: FurniturePiece, fromX: number, toX: number, time: number) {
  const seed = piece.x * 3 + piece.y;
  const row = Math.floor((time / 140 + seed) % 14);
  if (row < SCREEN.high - SCREEN.low) trace(context, pointOf(piece, fromX, SCREEN.y, SCREEN.high - 1 - row, 0), pointOf(piece, toX, SCREEN.y, SCREEN.high - 1 - row, 0), F.glowPale, 0.45);
  if (pick(`flicker${seed},${Math.floor(time / 90)}`, 40) === 0) {
    for (let z = SCREEN.low; z < SCREEN.high; z++) trace(context, pointOf(piece, fromX, SCREEN.y, z, 0), pointOf(piece, toX, SCREEN.y, z, 0), F.glowPale, 0.25);
  }
}

/** The orb's light breathing around it, and three sparks going round it. */
function pulseOrb(context: Context, piece: FurniturePiece, time: number) {
  const lift = bobOf(piece, time);
  const center = pointOf(piece, 0.5, 0.5, 25, lift);
  const breath = 0.5 + 0.5 * Math.sin(time / 650 + piece.x);
  for (let up = -7; up <= 7; up++) for (let across = -7; across <= 7; across++) {
    const distance = Math.hypot(across, up);
    if (distance < 4 || distance > 7) continue;
    dot(context, { x: center.x + across * ART_SCALE, y: center.y + up * ART_SCALE }, F.glow, (0.28 - (distance - 4) * 0.07) * (0.5 + breath));
  }
  for (let spark = 0; spark < 3; spark++) {
    const angle = time / 900 + (spark * Math.PI * 2) / 3;
    const front = Math.sin(angle) > 0;
    dot(context, { x: center.x + Math.cos(angle) * 9 * ART_SCALE, y: center.y + Math.sin(angle) * 3 * ART_SCALE }, F.glowPale, front ? 0.9 : 0.35);
  }
}

/** Spores of light rising from what grows, and fading at the top of its glass. */
function riseSpores(context: Context, piece: FurniturePiece, time: number, from: number, to: number, spread: number) {
  const lift = bobOf(piece, time);
  for (let spore = 0; spore < 3; spore++) {
    const age = (time / 3800 + spore / 3 + piece.x / 7) % 1;
    const across = (pick(`spore${piece.x},${piece.y},${spore},${Math.floor(time / 3800 + spore / 3 + piece.x / 7)}`, spread * 2 + 1) - spread) * ART_SCALE;
    const point = pointOf(piece, 0.5, 0.5, from + age * (to - from), lift);
    dot(context, { x: point.x + across, y: point.y }, F.buds[(spore + Math.round(piece.x)) % F.buds.length], Math.sin(age * Math.PI));
  }
}

/** A few crystals of the bay glowing brighter in turn. */
function pulseCrystals(context: Context, piece: FurniturePiece, time: number) {
  CRYSTALS.forEach((crystal, index) => {
    const wave = Math.sin(time / 500 - index * 0.9);
    if (wave < 0.6) return;
    for (let z = crystal.low + 1; z < crystal.high; z++) trace(context, pointOf(piece, crystal.x, BAY.y, z + 1, 0), pointOf(piece, crystal.x + 0.18, BAY.y, z + 1, 0), F.glowPale, (wave - 0.6) * 1.2);
  });
}

/** A planet of light turning above a table's emitter, a ring and a moon going round it. */
function spinPlanet(context: Context, piece: FurniturePiece, time: number) {
  const radius = 4;
  const center = pointOf(piece, piece.width / 2, piece.depth / 2, 13 + Math.round(Math.sin(time / 1300 + piece.x)), 0);
  for (let up = -radius; up < radius; up++) for (let across = -radius; across < radius; across++) {
    const x = across + 0.5, y = up + 0.5;
    const distance = Math.hypot(x, y);
    if (distance > radius) continue;
    const longitude = Math.asin(Math.max(-1, Math.min(1, x / Math.sqrt(radius * radius - y * y)))) + time / 1600;
    const land = Math.sin(longitude * 2.5 + y * 0.9) + Math.sin(longitude * 4 - y * 0.5) > 0.7;
    const point = { x: center.x + across * ART_SCALE, y: center.y + up * ART_SCALE };
    if (distance > radius - 1) dot(context, point, F.glowPale, 0.6);
    else dot(context, point, land ? F.planetLand : F.planetHolo, land ? 0.65 : 0.35);
  }
  const angle = time / 1100 + piece.y;
  for (let step = 0; step < 24; step++) {
    const along = (step / 24) * Math.PI * 2;
    if (step % 2) dot(context, { x: center.x + Math.cos(along) * 7 * ART_SCALE, y: center.y + Math.sin(along) * 2 * ART_SCALE }, F.planetHolo, Math.sin(along) > 0 ? 0.4 : 0.15);
  }
  dot(context, { x: center.x + Math.cos(angle) * 7 * ART_SCALE, y: center.y + Math.sin(angle) * 2 * ART_SCALE }, F.glowPale, Math.sin(angle) > 0 ? 0.95 : 0.3);
}

/** Bubbles rising in the dispenser's tank. */
function riseBubbles(context: Context, piece: FurniturePiece, time: number) {
  for (let bubble = 0; bubble < 4; bubble++) {
    const age = (time / 2400 + bubble / 4) % 1;
    const across = ((bubble * 5) % 6 - 3 + Math.round(Math.sin(age * 6 + bubble))) * ART_SCALE;
    const point = pointOf(piece, 0.5, 0.5, 13 + age * 9, 0);
    dot(context, { x: point.x + across, y: point.y }, F.bubble, 0.85 * (1 - age * 0.6));
  }
}

/** A line of light sweeping slowly across the board, now and then, faint enough to read through. */
function sweepBoard(context: Context, piece: FurniturePiece, time: number) {
  const share = (time / 7000) % 1.6;
  if (share > 1) return;
  const lift = bobOf(piece, time);
  const x = BOARD.fromX + share * (BOARD.toX - BOARD.fromX);
  trace(context, pointOf(piece, x, BOARD.y, BOARD.low + 1, lift), pointOf(piece, x, BOARD.y, BOARD.high - 1, lift), F.glow, 0.3);
}

/** The thrusters under a floating console, flickering. */
function flickerThrusters(context: Context, piece: FurniturePiece, time: number, xs: readonly number[], z: number) {
  for (const x of xs) {
    const flame = pick(`flame${piece.x},${piece.y},${x},${Math.floor(time / 120)}`, 3);
    dot(context, pointOf(piece, x, 0.5, z - 1, 0), F.thruster, 0.2 + flame * 0.25);
  }
}

/** A line of light along the front (+y) face of a piece, from `fromX` to `toX`, at `z`. */
const alongFront = (context: Context, piece: FurniturePiece, y: number, fromX: number, toX: number, z: number, colour: string, alpha: number, lift = 0) =>
  trace(context, pointOf(piece, fromX, y, z, lift), pointOf(piece, toX, y, z, lift), colour, alpha);
/** The same along the side (+x) face. */
const alongSide = (context: Context, piece: FurniturePiece, x: number, fromY: number, toY: number, z: number, colour: string, alpha: number) =>
  trace(context, pointOf(piece, x, fromY, z, 0), pointOf(piece, x, toY, z, 0), colour, alpha);

/** A pixel `across` art pixels from the middle of a piece, `up` high: what upright() paints. */
const uprightAt = (piece: FurniturePiece, across: number, up: number, lift: number): Point => {
  const point = pointOf(piece, piece.width / 2, piece.depth / 2, up, lift);
  return { x: point.x + across * ART_SCALE, y: point.y };
};

/**
 * What glows of the furniture, brighter as the night falls (`glow`, 0 by day): the lines of light, the screens, the
 * crystals, what grows. Over the light of the hour, so it shines in the dark.
 */
function glowAtNight(context: Context, piece: FurniturePiece, time: number, glow: number) {
  const { width, depth } = piece;
  if (piece.kind === 'desk' || piece.kind === 'bossDesk') {
    const screen = piece.kind === 'desk' ? SCREEN.desk : SCREEN.bossDesk;
    for (let z = SCREEN.low; z < SCREEN.high; z++) alongFront(context, piece, SCREEN.y, screen.fromX, screen.toX, z, F.glow, 0.3 * glow);
    alongFront(context, piece, 0.95, 0.08, width - 0.08, 9, piece.kind === 'desk' ? F.glow : F.command, 0.7 * glow);
  }
  if (piece.kind === 'bookshelf') for (const crystal of CRYSTALS) {
    for (let z = crystal.low + 1; z < crystal.high; z++) alongFront(context, piece, BAY.y, crystal.x, crystal.x + 0.18, z + 1, crystal.colour, 0.55 * glow);
  }
  // only the line along the seats' front: the hoods' are behind whoever sits there
  if (piece.kind === 'couch') for (let index = 0; index < width; index++) alongFront(context, piece, 0.95, index + 0.12, index + 0.86, 4, F.glow, 0.7 * glow);
  if (piece.kind === 'sofa') {
    const seat = (depth - 0.22) / depth;
    for (let index = 0; index < depth; index++) alongSide(context, piece, 0.95, 0.28 + index * seat, 0.1 + (index + 1) * seat, 4, F.glow, 0.7 * glow);
  }
  if (piece.kind === 'counter') alongFront(context, piece, 0.95, 0.05, 2.93, 10, F.glow, 0.7 * glow);
  if (piece.kind === 'plant') {
    const lift = bobOf(piece, time);
    for (const [across, up] of BUDS) dot(context, uprightAt(piece, across, up, lift), budOf(piece), glow);
  }
  if (piece.kind === 'bigPlant') {
    const lift = bobOf(piece, time);
    for (const [across, , to] of VINES) dot(context, uprightAt(piece, across, to, lift), F.fruit, glow);
    for (let up = -3; up <= 3; up++) for (let across = -5; across <= 5; across++) {
      if ((across / 5.5) ** 2 + (up / 3.5) ** 2 > 1 || pick(`canopy${across},${up}`, 3)) continue;
      dot(context, uprightAt(piece, across, 29 + up, lift), F.canopy, 0.45 * glow);
    }
  }
}

/** What glows and moves on each piece, as an effect at the piece's own depth: whoever sits or stands in front of it covers it. */
export function furnitureEffects(layout: Layout, time: number, glow: number): ThemeEffect[] {
  return layout.furniture.map((piece) => ({
    depth: furnitureDepth(piece),
    paint(context: Context) {
      if (glow > 0.02) glowAtNight(context, piece, time, glow);
      if (piece.kind === 'desk') { scanScreen(context, piece, SCREEN.desk.fromX, SCREEN.desk.toX, time); flickerThrusters(context, piece, time, [0.6, 1.4], 4); }
      if (piece.kind === 'bossDesk') { scanScreen(context, piece, SCREEN.bossDesk.fromX, SCREEN.bossDesk.toX, time); flickerThrusters(context, piece, time, [0.7, 1.5, 2.3], 3); }
      if (piece.kind === 'floorLamp') pulseOrb(context, piece, time);
      if (piece.kind === 'plant') riseSpores(context, piece, time, 9, 18, 3);
      if (piece.kind === 'bigPlant') riseSpores(context, piece, time, 22, 36, 5);
      if (piece.kind === 'bookshelf') pulseCrystals(context, piece, time);
      if (piece.kind === 'lowTable') spinPlanet(context, piece, time);
      if (piece.kind === 'cooler') riseBubbles(context, piece, time);
      if (piece.kind === 'whiteboard') sweepBoard(context, piece, time);
      context.globalAlpha = 1;
    },
  }));
}

/** The furniture's own lights, cyan and bioluminescent, that light the room at night. */
export function furnitureLights(layout: Layout): ThemeLight[] {
  const lights: ThemeLight[] = [];
  const add = (piece: FurniturePiece, x: number, y: number, height: number, radius: number, colour: string, strength: number) =>
    lights.push({ x: piece.x + x, y: piece.y + y, height, radius, colour, strength });
  for (const piece of layout.furniture) {
    const { width, depth } = piece;
    if (piece.kind === 'floorLamp') add(piece, 0.5, 0.5, 50, 120, F.lightCyan, 0.9);
    if (piece.kind === 'desk') add(piece, 0.6, 0.5, 24, 60, F.lightCyan, 0.45);
    if (piece.kind === 'bossDesk') add(piece, 1.5, 0.5, 20, 90, F.lightCyan, 0.6);
    if (piece.kind === 'plant') add(piece, 0.5, 0.5, 22, 50, F.lightBio, 0.6);
    if (piece.kind === 'bigPlant') add(piece, 0.5, 0.5, 56, 90, F.lightViolet, 0.6);
    if (piece.kind === 'bookshelf') add(piece, 1, 0.8, 30, 80, F.lightViolet, 0.6);
    if (piece.kind === 'lowTable') add(piece, width / 2, depth / 2, 30, 70, F.lightCyan, 0.6);
    if (piece.kind === 'couch' || piece.kind === 'sofa') add(piece, width / 2, depth / 2, 4, 30 + (width + depth) * 8, F.lightCyan, 0.35);
    if (piece.kind === 'whiteboard') add(piece, 2, 0.6, 58, 120, F.lightCyan, 0.55);
    if (piece.kind === 'cooler') add(piece, 0.5, 0.5, 40, 50, F.lightCyan, 0.5);
    if (piece.kind === 'counter') add(piece, 0.55, 0.6, 32, 60, F.lightCyan, 0.5);
  }
  return lights;
}
