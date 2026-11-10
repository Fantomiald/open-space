// The cellar's furniture (themes/kit.ts, pixel-furniture.ts for the painter), all found on the street or in a skip:
// steel tables with an old CRT, a door on trestles for the user, worn swivel chairs, towers on milk crates, racks of
// servers, steel shelves of hardware, sofas patched with tape, a pallet for a low table, a work lamp on a tripod, a
// mini fridge, a dirty whiteboard on angle iron and a workbench. Their LEDs and glows are drawn every frame
// (cellar-effects.ts), from the spots given here.
import { CELLAR_PALETTE as K } from '../../design/theme-cellar.ts';
import type { PieceKind } from '../../../shared/room-layout.ts';
import { tones } from '../pixel-art.ts';
import { paintLaptop, writeOnBoard, type Design, type Painter } from '../pixel-furniture.ts';
import { pick } from '../sky.ts';

/** A point of a piece, from its corner: x and y in tiles, z in art pixels. */
export interface PieceSpot { x: number; y: number; z: number }

export const LAMP: PieceSpot = { x: 2.72, y: 0.3, z: 20 };
export const WORK_LAMP: PieceSpot = { x: 0.5, y: 0.5, z: 31 };
export const DESK_LED: PieceSpot = { x: 1.42, y: 0.78, z: 5 };
export const SCOPE = { fromX: 0.34, toX: 0.74, y: 0.74, z: 15.5 };
export const STEAM: PieceSpot = { x: 1.45, y: 0.5, z: 21 };

/** The LEDs of a server's units, down its front. */
const RACK_UNITS = [4, 9, 14, 19, 24, 29, 34];
export const RACK_LEDS: readonly PieceSpot[] = RACK_UNITS.flatMap((z) => [0.2, 0.3, 0.4, 0.55, 0.7].map((x) => ({ x, y: 0.88, z: z + 1 })));

/** The LEDs of the other pieces. */
export const LEDS: Partial<Record<PieceKind, readonly PieceSpot[]>> = {
  plant: [{ x: 0.36, y: 0.75, z: 14 }, { x: 0.46, y: 0.75, z: 14 }, { x: 0.56, y: 0.75, z: 11 }],
  bookshelf: [0.2, 0.3, 0.4, 0.5, 0.6].map((x) => ({ x, y: 0.6, z: 11 })),
  cooler: [{ x: 0.7, y: 0.82, z: 13 }],
  counter: [{ x: 2.25, y: 0.7, z: 13 }],
  bossDesk: [{ x: 0.82, y: 0.78, z: 3 }, { x: 2.32, y: 0.78, z: 2 }],
};

function along(p: Painter, fromX: number, toX: number, y: number, z: number, colour: string) {
  for (let x = fromX; x < toX; x += 1 / 8) p.pixel(x, y, z, colour);
}

/** An old CRT, its screen to whoever sits behind the desk and its bulging back to us. */
function crt(p: Painter, x: number, y: number, top: number) {
  p.box(x + 0.12, y + 0.04, 0.44, 0.3, top, 1, K.casingDark);
  p.box(x, y, 0.68, 0.34, top + 1, 6, K.casing, K.casingLight);
  p.box(x + 0.1, y + 0.34, 0.48, 0.12, top + 2, 4, tones(K.casing).shade);
}

function crtVents(p: Painter, x: number, y: number, top: number) {
  for (const z of [top + 3, top + 4, top + 5]) along(p, x + 0.16, x + 0.52, y + 0.46, z, K.casingDark);
}

function can(p: Painter, x: number, y: number, top: number, colour: string) {
  p.box(x, y, 0.1, 0.1, top, 2.2, colour, K.steelLight);
}

function angleFrame(p: Painter) {
  for (const x of [0.02, 3.82]) {
    p.box(x - 0.05, 0.19, 0.26, 0.24, 0, 1, K.steelDark);
    p.box(x, 0.24, 0.14, 0.12, 1, 46, K.steel);
  }
  p.box(0.08, 0.24, 3.84, 0.1, 44, 2, K.steel);
  p.box(0.12, 0.22, 3.76, 0.12, 13, 32, K.steelDark);
}

/** Tape over a tear in a sofa's cloth. */
function tape(p: Painter, x: number, y: number, z: number) {
  for (let step = 0; step < 3; step++) p.pixel(x + step / 8, y, z, K.tape);
}

export const CELLAR_FURNITURE: Partial<Record<PieceKind, Design>> = {
  // a steel table with a plywood top: a tower under it, an old CRT, a can, papers and a mess of cables
  desk: { height: 24, paint(p, piece) {
    for (const [x, y] of [[0.04, 0.06], [1.84, 0.06], [0.04, 0.8], [1.84, 0.8]]) p.box(x, y, 0.1, 0.1, 0, 8, K.steel);
    p.box(0.1, 0.1, 1.8, 0.06, 3, 1, K.steelDark);
    p.box(1.24, 0.2, 0.36, 0.58, 0, 7.5, K.case, K.caseLight);
    p.box(0, 0, 2, 0.95, 8, 3, K.plyDark, K.plyTop);
    crt(p, 0.24, 0.16, 11);
    can(p, 1.34, 0.22, 11, K.sticker[pick(`can${piece.x},${piece.y}`, K.sticker.length)]);
    p.box(1.12, 0.52, 0.5, 0.32, 11, 0.5, K.paper);
    p.box(1.62, 0.2, 0.2, 0.14, 11, 1, K.ink);
  }, fine(p, piece) {
    along(p, 0, 2, 0.95, 9.5, K.plyTop);
    crtVents(p, 0.24, 0.16, 11);
    for (const x of [0.5, 0.75, 1.1]) p.pixel(x, 0.95, 7, K.cable);
    for (let z = 2; z < 7; z++) p.pixel(1.34, 0.78, z, K.caseLight);
    for (const x of [1.2, 1.3, 1.42]) p.pixel(x, 0.66 + (x % 0.2), 11.6, K.ink);
    p.pixel(0.5 + pick(`sticker${piece.x},${piece.y}`, 3) / 8, 0.5, 15, K.sticker[pick(`stickerc${piece.x},${piece.y}`, K.sticker.length)]);
  } },
  // the user's desk: a door laid on two trestles, a CRT, their laptop, a gooseneck lamp, a rubber duck for debugging
  bossDesk: { height: 30, paint(p) {
    for (const x of [0.12, 2.76]) {
      p.box(x, 0.08, 0.12, 0.78, 0, 10, K.steel);
      p.box(x - 0.04, 0.04, 0.2, 0.86, 0, 1, K.steelDark);
    }
    p.box(0.55, 0.3, 0.34, 0.48, 0, 8, K.case, K.caseLight);
    p.box(2.05, 0.3, 0.5, 0.48, 0, 5, K.case, K.caseLight);
    p.box(0, 0, 3, 0.95, 10, 1, K.door, K.doorTop);
    crt(p, 0.2, 0.14, 11);
    p.box(1.1, 0.15, 0.8, 0.45, 11, 1, K.steelLight);
    p.box(1.1, 0.55, 0.8, 0.06, 12, 5, K.caseLight);
    p.box(2.62, 0.2, 0.22, 0.2, 11, 1, K.steelDark);
    p.box(2.7, 0.26, 0.05, 0.05, 12, 7, K.steel);
    p.box(2.62, 0.22, 0.24, 0.14, 19, 2, K.steelDark);
    p.ball(2.26, 0.56, 12.5, 1.8, 1.5, K.duck);
    p.ball(2.33, 0.5, 14.5, 1.1, 1.1, K.duck);
    can(p, 2.05, 0.22, 11, K.sticker[1]);
    p.box(0.98, 0.72, 0.42, 0.18, 11, 0.5, K.paper);
  }, fine(p) {
    crtVents(p, 0.2, 0.14, 11);
    along(p, 0, 3, 0.95, 10.5, K.doorTop);
    // the door's panels and the hole of its handle
    for (const x of [0.2, 1.4, 1.6, 2.8]) p.pixel(x, 0.95, 10.5, K.casingDark);
    p.pixel(2.9, 0.9, 11, K.ink);
    // stickers on the laptop's lid
    p.pixel(1.3, 0.61, 15, K.sticker[0]);
    p.pixel(1.5, 0.61, 14, K.sticker[3]);
    p.pixel(1.7, 0.61, 15, K.sticker[2]);
    p.pixel(2.2, 0.68, 12.5, K.ink);
    p.pixel(2.4, 0.5, 14.5, K.can);
  }, clickable: paintLaptop },
  // a worn swivel chair: five feet, a post, a split cushion
  chair: { height: 24, paint(p) {
    p.box(0.22, 0.46, 0.56, 0.08, 0, 1, K.steelDark);
    p.box(0.46, 0.22, 0.08, 0.56, 0, 1, K.steelDark);
    p.box(0.45, 0.45, 0.1, 0.1, 1, 4, K.steel);
    p.box(0.2, 0.2, 0.6, 0.6, 5, 2.3, K.clothDark, K.cloth);
    p.box(0.44, 0.08, 0.12, 0.12, 5, 7, K.steel);
    p.box(0.22, 0.08, 0.56, 0.12, 11, 7, K.clothDark, K.cloth);
  }, fine(p) {
    p.pixel(0.32, 0.5, 7.5, K.tape);
    p.pixel(0.45, 0.5, 7.5, K.tape);
    p.pixel(0.5, 0.2, 15, K.tape);
    p.pixel(0.6, 0.2, 15, K.tape);
  } },
  // an old tower on a milk crate, cables out of its back
  plant: { height: 24, paint(p) {
    p.shadow(0.5, 0.5, 7, 3);
    p.box(0.18, 0.2, 0.64, 0.58, 0, 7, K.crate);
    p.box(0.26, 0.26, 0.48, 0.5, 7, 11, K.case, K.caseLight);
  }, fine(p) {
    for (let z = 1; z < 7; z += 2) along(p, 0.2, 0.8, 0.78, z, tones(K.crate).dark);
    p.pixel(0.4, 0.76, 16, K.caseLight);
    p.pixel(0.5, 0.76, 16, K.caseLight);
    along(p, 0.3, 0.7, 0.76, 9, K.caseLight);
    for (let z = 4; z < 12; z++) p.pixel(0.78, 0.4 + (z % 3) / 16, z, K.cable);
  } },
  // a rack of servers, taller than anyone, its LEDs alive; cables spilling from its side
  bigPlant: { height: 44, paint(p) {
    p.shadow(0.5, 0.5, 9, 4);
    p.box(0.1, 0.12, 0.8, 0.76, 0, 38, K.rack, K.rackUnit);
    for (const z of RACK_UNITS) p.onFront(0.88, 0.14, 0.86, z - 1, z + 2.5, K.rackUnit);
  }, fine(p) {
    for (const z of RACK_UNITS) { along(p, 0.14, 0.86, 0.88, z - 1, K.rack); p.pixel(0.8, 0.88, z + 1, K.caseLight); }
    for (let z = 2; z < 30; z++) p.pixel(0.9, 0.3 + ((z * 3) % 7) / 40, z, K.cableBlue);
    for (let z = 2; z < 22; z++) p.pixel(0.9, 0.6 + ((z * 2) % 5) / 40, z, K.cableRed);
  } },
  // steel shelves of hardware: binders, cardboard boxes, a router with its LEDs, a dead CRT on top
  bookshelf: { height: 34, paint(p) {
    for (const x of [0, 1.92]) for (const y of [0, 0.52]) p.box(x, y, 0.08, 0.08, 0, 23, K.steel);
    p.onFront(0.6, 0.08, 1.92, 1, 23, tones(K.steelDark).dark);
    for (const z of [0, 8, 16, 23]) p.box(0, 0, 2, 0.6, z, 1, K.steel, K.steelLight);
    p.onFront(0.6, 0.12, 0.72, 9, 12.5, K.case);
    p.onFront(0.6, 1.05, 1.85, 9, 15, K.cardboard);
    p.onFront(0.6, 1.05, 1.85, 12, 12.5, K.cardboardDark);
    for (let index = 0; index < 7; index++) p.onFront(0.6, 0.12 + index * 0.13, 0.23 + index * 0.13, 1, 7, K.binder[index % K.binder.length]);
    p.onFront(0.6, 1.1, 1.8, 1, 5.5, K.cardboardDark);
    p.onFront(0.6, 0.15, 0.8, 17, 21, K.cardboard);
    for (let index = 0; index < 5; index++) p.onFront(0.6, 1 + index * 0.15, 1.12 + index * 0.15, 17, 22, K.casingDark);
    p.box(0.3, 0.1, 0.8, 0.42, 24, 7, K.casingDark, K.casing);
    p.box(1.3, 0.14, 0.5, 0.36, 24, 3, K.cardboard);
  }, fine(p) {
    for (let index = 0; index < 7; index++) p.pixel(0.17 + index * 0.13, 0.6, 5, K.paper);
    along(p, 1.2, 1.5, 0.6, 14, K.ink);
    along(p, 0.3, 0.6, 0.6, 19, K.ink);
    for (let z = 3; z < 12; z++) p.pixel(0.9 + (z % 2) / 16, 0.6, z, K.cable);
  } },
  // a sofa from the street against the wall, its cloth worn through and taped, a blanket over its back
  sofa: { height: 20, paint(p, { depth }) {
    p.box(0.05, 0, 0.9, depth, 0, 4, K.clothDark);
    const seat = (depth - 0.18) / depth;
    for (let index = 0; index < depth; index++) {
      const colour = index % 2 ? K.clothLight : K.cloth;
      p.box(0.33, 0.21 + index * seat, 0.6, seat - 0.06, 4, 3, colour);
    }
    p.box(0.05, 0.18, 0.25, depth - 0.18, 4, 9, K.cloth);
    p.box(0.07, 0.22, 0.24, depth - 0.26, 9, 4, K.blanket);
    p.box(0.05, 0, 0.9, 0.18, 4, 7, K.clothDark);
  }, fine(p, { depth }) {
    const seat = (depth - 0.18) / depth;
    for (let index = 0; index < depth; index++) tape(p, 0.45, 0.4 + index * seat, 7);
    for (let y = 0.3; y < depth - 0.05; y += 0.5) p.pixel(0.31, y, 10, K.damp);
  } },
  sofaArm: { height: 14, paint(p) {
    p.box(0.05, 0, 0.9, 0.22, 0, 4, K.clothDark);
    p.box(0.05, 0, 0.9, 0.22, 4, 7, K.clothDark);
  } },
  couch: { height: 20, paint(p, { width }) {
    p.box(0, 0.05, width, 0.9, 0, 4, K.clothDark);
    for (let index = 0; index < width; index++) {
      const from = index + 0.06 + (index === 0 ? 0.16 : 0), to = index + 0.94;
      p.box(from, 0.34, to - from, 0.58, 4, 3, index % 2 ? K.clothLight : K.cloth);
    }
    p.box(0.2, 0.08, width - 0.2, 0.25, 4, 9, K.cloth);
    p.box(0.24, 0.1, width - 0.3, 0.22, 9, 4, K.blanket);
    p.box(0, 0.05, 0.2, 0.9, 4, 7, K.clothDark);
  }, fine(p, { width }) {
    for (let index = 0; index < width; index++) tape(p, index + 0.35, 0.6, 7);
    for (let x = 0.5; x < width; x += 0.75) p.pixel(x, 0.33, 10, K.damp);
  } },
  couchArm: { height: 14, paint(p) {
    p.box(0, 0.05, 0.2, 0.9, 0, 4, K.clothDark);
    p.box(0, 0.05, 0.2, 0.9, 4, 7, K.clothDark);
  } },
  // two pallets for a low table: an old pizza box, cans, a laptop with no battery
  lowTable: { height: 18, paint(p, { width, depth }) {
    p.shadow(width / 2, depth / 2, width * 7, depth * 3.5);
    p.box(0.1, 0.1, width - 0.2, depth - 0.2, 0, 3, K.plyDark);
    p.box(0.08, 0.08, width - 0.16, depth - 0.16, 3, 4, K.ply, K.plyTop);
    p.box(width * 0.2, depth * 0.25, 0.7, 0.55, 7, 0.8, K.pizza);
    can(p, width * 0.6, depth * 0.3, 7, K.sticker[0]);
    can(p, width * 0.72, depth * 0.55, 7, K.sticker[2]);
  }, fine(p, { width, depth }) {
    for (let x = 0.3; x < width - 0.1; x += 0.4) for (let z = 3; z < 7; z++) p.pixel(x, depth - 0.08, z, K.plyDark);
    along(p, 0.15, width - 0.15, depth - 0.08, 1.5, K.ink);
    p.pixel(width * 0.28, depth * 0.45, 8, K.can);
    p.pixel(width * 0.38, depth * 0.55, 8, K.can);
  } },
  // a work lamp on a tripod: a bare bulb in its cage (it flickers, every frame)
  floorLamp: { height: 38, paint(p) {
    p.shadow(0.5, 0.5, 6, 3);
    for (const [x, y] of [[0.22, 0.48], [0.7, 0.48], [0.46, 0.76]]) p.box(x, y, 0.07, 0.07, 0, 3, K.steelDark);
    p.box(0.26, 0.48, 0.48, 0.05, 3, 1, K.steelDark);
    p.box(0.47, 0.47, 0.06, 0.06, 1, 26, K.steel);
    p.ball(WORK_LAMP.x, WORK_LAMP.y, WORK_LAMP.z, 3, 3, K.bulb);
  }, fine(p) {
    for (const across of [-3, 0, 3]) for (let up = -3; up <= 3; up++) p.upright(across, WORK_LAMP.z + up, K.steelDark, WORK_LAMP);
    for (const up of [-2, 2]) for (let across = -3; across <= 3; across++) p.upright(across, WORK_LAMP.z + up, K.steelDark, WORK_LAMP);
  } },
  // a mini fridge covered in stickers, a can on top
  cooler: { height: 26, paint(p) {
    p.shadow(0.5, 0.5, 8, 3.5);
    p.box(0.14, 0.2, 0.72, 0.62, 0, 15, K.fridgeDark, K.fridge);
    p.onFront(0.82, 0.18, 0.82, 1, 14, K.fridge);
    can(p, 0.4, 0.42, 15, K.sticker[0]);
  }, fine(p) {
    along(p, 0.18, 0.82, 0.82, 11, K.fridgeDark);
    for (let z = 4; z < 10; z++) p.pixel(0.75, 0.82, z, K.steelDark);
    for (const [x, z, sticker] of [[0.28, 7, 0], [0.42, 4, 1], [0.32, 12.5, 2], [0.55, 8, 3]] as const) {
      p.pixel(x, 0.82, z, K.sticker[sticker]);
      p.pixel(x + 1 / 8, 0.82, z, K.sticker[sticker]);
    }
  } },
  // a dirty whiteboard bolted to angle iron: what the user wrote, printouts taped to its edge
  whiteboard: { height: 54, paint(p) {
    angleFrame(p);
    p.onFront(0.34, 0.18, 3.82, 15, 43, K.board);
  }, fine(p, _piece, board) {
    for (let x = 0.2; x < 3.8; x += 0.25) p.pixel(x + (pick(`boardx${x}`, 8) / 40), 0.34, 15 + pick(`boardz${x}`, 28), K.boardShade);
    p.onFront(0.34, 3.4, 3.76, 16, 22, K.paper);
    for (const z of [17, 19, 20.5]) along(p, 3.44, 3.72, 0.34, z, K.paperShade);
    p.pixel(3.58, 0.34, 22, K.tape);
    writeOnBoard(p, board);
  }, clickable: angleFrame },
  // a workbench: pegboard for a front, an oscilloscope, a coffee maker, a soldering station, mugs, a spool of wire
  counter: { height: 26, paint(p) {
    p.box(0, 0.1, 3, 0.85, 0, 11, K.plyDark);
    p.box(-0.04, 0.06, 3.08, 0.93, 11, 1, K.steelDark, K.ply);
    p.box(0.28, 0.32, 0.52, 0.42, 12, 7, K.case, K.caseLight);
    p.onFront(0.74, SCOPE.fromX, SCOPE.toX, 13.5, 17.5, K.scope);
    p.box(1.25, 0.32, 0.42, 0.36, 12, 9, K.casingDark, K.case);
    p.box(1.31, 0.62, 0.28, 0.14, 12, 4, K.coffee);
    p.box(2.1, 0.42, 0.34, 0.28, 12, 2.5, K.steelDark);
    p.box(2.55, 0.36, 0.16, 0.16, 12, 3, K.cableRed);
    p.box(1.86, 0.56, 0.12, 0.12, 12, 2.4, K.mug);
  }, fine(p) {
    for (let x = 0.15; x < 3; x += 0.25) for (let z = 2; z < 10; z += 2) p.pixel(x, 0.95, z, K.ink);
    // tools on the pegboard
    for (let z = 4; z < 9; z++) { p.pixel(0.6, 0.95, z, K.steelLight); p.pixel(1.7, 0.95, z, K.can); }
    for (const x of [1.0, 1.15, 2.3]) for (let z = 6; z < 9; z++) p.pixel(x, 0.95, z, K.steelLight);
    for (let step = 0; step < 4; step++) p.pixel(2.44 + step / 12, 0.5, 15 + step / 2, K.steelLight);
  } },
};
