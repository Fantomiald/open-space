// The galleon's furniture (themes/kit.ts): captain's desks in varnished mahogany with a logbook on its lectern where the
// laptop was, barrels for stools, palms in half barrels and a parrot, sea chests stacked by a rack of rolled charts,
// chest benches heaped with cushions, open treasure chests for tables, lanterns on posts, a rum barrel on its cradle,
// the galley with its stove and barrels, a sea chart on an easel. Then what moves on them every frame, and their lights.
import { ROOM_PALETTE } from '../../design/room-palette.ts';
import { PIRATE_FURNITURE as F, PIRATE_PALETTE as P } from '../../design/theme-pirate.ts';
import type { FurniturePiece, Layout, PieceKind } from '../../../shared/room-layout.ts';
import { toScreen, type Point } from '../geometry.ts';
import { css, rgb, type Lighting, type Rgb } from '../lighting.ts';
import { writeOnBoard, type Design, type Painter } from '../pixel-furniture.ts';
import { ART_SCALE, tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import type { ThemeLight } from './kit.ts';

type Context = CanvasRenderingContext2D;
interface Spot { x: number; y: number }

/* Shapes */

/** A flat ellipse at `z` around a point, `radius` art pixels across and half as deep. */
function ellipse(p: Painter, middle: Spot, radius: number, colour: string, z = 0) {
  const depth = radius / 2;
  for (let row = -Math.floor(depth); row <= Math.floor(depth); row++) {
    const half = Math.round(radius * Math.sqrt(Math.max(0, 1 - (row / depth) ** 2)));
    for (let across = -half; across < half; across++) p.upright(across, z - row, colour, middle);
  }
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

/** A barrel standing on a floor point: bulging staves, iron hoops near both ends, its lid. */
function barrel(p: Painter, middle: Spot, z: number, height: number, radius: number, lid = F.staveTop) {
  cylinder(p, middle, z + 2, height - 4, radius + 1, F.stave);
  cylinder(p, middle, z, height, radius, F.stave, lid);
  for (let across = -radius - 1; across <= radius; across++) {
    const reach = Math.abs(across + 0.5) <= radius ? radius : radius + 1;
    const front = Math.round((reach / 2) * Math.sqrt(Math.max(0, 1 - ((across + 0.5) / reach) ** 2)));
    for (const up of [z + 1, z + height - 2]) p.upright(across, up - front, F.hoop, middle);
    if ((across + radius) % 3 === 2 && Math.abs(across + 0.5) < radius - 1) for (let up = z + 2; up < z + height - 2; up++) p.upright(across, up - front, tones(F.stave).shade, middle);
  }
  // the lid's ring of staves
  for (let across = -radius + 1; across < radius - 1; across++) {
    const depth = Math.round(((radius - 1) / 2) * Math.sqrt(1 - ((across + 0.5) / (radius - 1)) ** 2));
    p.upright(across, z + height - depth, tones(lid).shade, middle);
  }
}

/** A sea chest: a box of oak with iron straps, brass corners and a lock on its front; its lid a little lighter. */
function chest(p: Painter, x: number, y: number, width: number, depth: number, z: number, height: number) {
  p.box(x, y, width, depth, z, height - 3, F.oak, F.oakTop);
  p.box(x - 0.02, y - 0.02, width + 0.04, depth + 0.04, z + height - 3, 3, F.oakTop, tones(F.oakTop).light);
  for (const share of [0.18, 0.82]) {
    p.onFront(y + depth + 0.02, x + width * share - 0.06, x + width * share + 0.06, z, z + height, F.hoop);
  }
  p.onSide(x + width + 0.02, y + depth * 0.4, y + depth * 0.6, z, z + height, F.hoop);
  p.onFront(y + depth + 0.02, x + width / 2 - 0.06, x + width / 2 + 0.06, z + height - 5, z + height - 2, F.gold);
  p.pixel(x + width / 2, y + depth + 0.02, z + height - 4, F.darkWood);
}

/** A palm's crown: fronds arching out and drooping from `top`, a darker leaflet under each step. */
function fronds(p: Painter, middle: Spot, top: number, reach: number, colours: readonly string[]) {
  for (const [direction, rise, length] of [[-1, 1, reach], [1, 1, reach], [-1, 0.4, reach * 0.7], [1, 0.3, reach * 0.75], [0, 1.4, 3]] as const) {
    for (let step = 0; step <= length; step++) {
      const across = direction ? direction * step : 0;
      const up = Math.round(top + step * rise * 0.6 - (step * step) / (length * 1.1));
      const sway = direction ? 0 : step;
      p.upright(across, up + sway, colours[step % 2], middle);
      if (step > 1) p.upright(across, up - 1 + sway, colours[2], middle);
    }
  }
}

/** A parrot facing right, one letter a pixel. */
const PARROT = ['.rrr.', 'rrerw', '.rrrw', '.rbb.', 'rbbb.', '.bbr.', '.bb..', '.yy..', '.y...'];
const PARROT_COLOURS = { r: F.parrot, e: F.eye, w: F.beak, b: F.parrotWing, y: F.parrotTail };

/** One letter a pixel, facing the viewer, its bottom row at `z` above `middle`. */
function sprite(p: Painter, rows: readonly string[], colours: Readonly<Record<string, string>>, middle: Spot, z: number, shift = 0) {
  const half = Math.floor(rows[0].length / 2);
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
    const colour = colours[letter as keyof typeof colours];
    if (colour) p.upright(column - half + shift, z + rows.length - 1 - line, colour, middle);
  });
}

/* The pieces */

/** The logbook on its lectern, in the laptop's box (where hands type): its pages, the back of its leather cover with a clasp. */
function logbook(p: Painter, fromX: number, width: number) {
  p.box(fromX, 0.2, width, 0.4, 11, 1, F.leather, F.page);
  p.box(fromX, 0.55, width, 0.06, 12, 5, F.leather, F.leatherTop);
  p.onFront(0.61, fromX + width / 2 - 0.06, fromX + width / 2 + 0.06, 13, 16, F.gold);
}

/** A brass compass in its box, seen from above: its rose and needle. */
function compass(p: Painter, x: number, y: number) {
  p.box(x, y, 0.24, 0.22, 11, 1.5, F.darkWood, F.goldDark);
  p.pixel(x + 0.12, y + 0.11, 12.5, F.page);
  p.pixel(x + 0.08, y + 0.11, 12.5, F.page);
  p.pixel(x + 0.16, y + 0.11, 12.5, P.cross);
}

const SEAT_TOP = 7;
/** The steam of the galley's kettle and mugs rises where the office's does: these must stay under it (see draw.ts). */
const KETTLE = { x: 0.55, y: 0.5 };

/** The sea chart on its easel: the writing plane is the office board's. */
const CHART = { y: 0.34, fromX: 0.18, toX: 3.82, low: 15, high: 43 };
function paintEasel(p: Painter) {
  for (const x of [0.12, 3.76]) p.box(x, 0.4, 0.12, 0.12, 0, 49, F.oak, F.oakTop);
  p.box(0.06, 0.28, 3.88, 0.08, 45, 2, F.darkWood, F.oakTop);
  p.box(0.1, 0.36, 3.8, 0.14, 12, 3, F.oak, F.oakTop);
}
function paintChart(p: Painter) {
  p.onFront(CHART.y, CHART.fromX, CHART.toX, CHART.low, CHART.high, P.parchment);
  p.onFront(CHART.y, CHART.fromX, CHART.toX, CHART.low, CHART.low + 1, P.parchmentBurnt);
  p.onFront(CHART.y, CHART.fromX, CHART.toX, CHART.high - 1, CHART.high, P.parchmentBurnt);
  p.onFront(CHART.y, CHART.fromX, CHART.fromX + 0.08, CHART.low, CHART.high, P.parchmentBurnt);
  p.onFront(CHART.y, CHART.toX - 0.08, CHART.toX, CHART.low, CHART.high, P.parchmentBurnt);
}
const BOARD_BALLOONS = [[0.15, 56, 0], [0.55, 60, 2], [0.3, 65, 1]] as const;

export const PIRATE_FURNITURE: Partial<Record<PieceKind, Design>> = {
  // a writing desk in varnished mahogany on turned legs, a drawer, the logbook, a chart weighed by its compass, a quill
  desk: { height: 22, paint(p) {
    for (const [x, y] of [[0.06, 0.08], [1.82, 0.08], [0.06, 0.8], [1.82, 0.8]]) {
      p.box(x, y, 0.12, 0.12, 0, 1, F.gold);
      p.box(x + 0.02, y + 0.02, 0.08, 0.08, 1, 3, F.darkWood);
      p.box(x, y, 0.12, 0.12, 4, 1.5, F.mahogany);
      p.box(x + 0.02, y + 0.02, 0.08, 0.08, 5.5, 2, F.darkWood);
    }
    p.box(0.1, 0.1, 1.8, 0.75, 7, 2, F.mahogany);
    p.onFront(0.85, 0.7, 1.3, 7, 9, tones(F.mahogany).shade);
    p.onFront(0.85, 0.94, 1.06, 7, 8, F.gold);
    p.box(0, 0, 2, 0.95, 9, 2, F.mahogany, F.mahoganyTop);
    logbook(p, 0.25, 0.7);
    p.box(1.15, 0.38, 0.62, 0.45, 11, 0.5, P.parchmentDark, P.parchment);
    compass(p, 1.55, 0.12);
  }, fine(p) {
    for (const [x, y] of [[1.3, 0.55], [1.4, 0.6], [1.5, 0.6], [1.6, 0.65]]) p.pixel(x, y, 11.5, P.inkFaint);
    p.pixel(1.62, 0.7, 11.5, P.cross);
  } },
  // the captain's own: a great desk on a plinth, carved panels and a velvet band, the treasure map spread on it, the
  // logbook bound in gold, an oil lamp, a stack of coins and an hourglass
  bossDesk: { height: 24, paint(p) {
    p.box(0, 0, 3, 0.95, 0, 1.5, F.darkWood);
    p.box(0.04, 0.04, 2.92, 0.87, 1.5, 7.5, F.mahogany);
    for (const x of [0.12, 1.08, 2.04]) {
      p.onFront(0.91, x, x + 0.84, 2.5, 7.5, tones(F.mahogany).shade);
      p.onFront(0.91, x + 0.06, x + 0.78, 3, 7, F.mahogany);
    }
    p.onFront(0.91, 0.06, 2.94, 7, 9, F.velvet);
    p.box(0, 0, 3, 0.95, 9, 2, F.mahogany, F.mahoganyTop);
    p.box(0.12, 0.15, 0.85, 0.65, 11, 0.5, P.parchmentDark, P.parchment);
    logbook(p, 1.1, 0.8);
    // the oil lamp where the office has its lamp (its light, see draw.ts), coins, an hourglass
    p.box(2.68, 0.1, 0.22, 0.22, 11, 1, F.goldDark, F.gold);
    p.box(2.72, 0.14, 0.14, 0.14, 12, 3, P.lanternGlassDim, P.lanternGlass);
    p.box(2.74, 0.16, 0.1, 0.1, 15, 1, F.goldDark, F.gold);
    for (let layer = 0; layer < 4; layer++) p.box(2.12 + (layer % 2) * 0.03, 0.55, 0.2, 0.2, 11 + layer, 1, F.goldDark, F.gold);
    p.box(2.4, 0.2, 0.14, 0.14, 11, 0.6, F.darkWood);
    p.box(2.42, 0.22, 0.1, 0.1, 11.6, 3, P.parchmentDark, F.page);
    p.box(2.4, 0.2, 0.14, 0.14, 14.6, 0.6, F.darkWood);
  }, fine(p) {
    for (const [x, y] of [[0.3, 0.45], [0.4, 0.5], [0.5, 0.45], [0.6, 0.5], [0.7, 0.55]]) p.pixel(x, y, 11.5, P.inkFaint);
    for (const [x, y] of [[0.75, 0.6], [0.83, 0.6], [0.79, 0.56], [0.79, 0.64]]) p.pixel(x, y, 11.5, P.cross);
    for (const [x, y] of [[0.25, 0.3], [0.3, 0.28], [0.35, 0.32]]) p.pixel(x, y, 11.5, P.ink);
    p.pixel(2.79, 0.21, 14, P.flameCore);
  } },
  // a barrel for a stool, a round cushion on it
  chair: { height: 14, paint(p) {
    const middle = { x: 0.5, y: 0.5 };
    p.shadow(0.5, 0.5, 6, 3);
    barrel(p, middle, 0, 6, 4);
    ellipse(p, middle, 3.5, F.velvet, 7);
    ellipse(p, middle, 2.5, F.velvetTop, 7);
  } },
  // a little palm in half a barrel
  plant: { height: 26, paint(p) {
    const middle = { x: 0.5, y: 0.5 };
    p.shadow(0.5, 0.5, 6, 3);
    barrel(p, middle, 0, 6, 4, F.soil);
    for (let up = 5; up < 14; up++) p.upright(Math.round((up - 5) * 0.25), up, up % 3 ? F.palmTrunk : tones(F.palmTrunk).shade, middle);
    fronds(p, { x: 0.5 + 0.13, y: 0.5 - 0.13 }, 14, 6, [F.frond, F.frondLight, F.frondDark]);
    p.upright(1, 13, F.coconut, middle);
    p.upright(3, 13, F.coconut, middle);
  } },
  // a tall palm in a barrel, coconuts under its crown, the ship's parrot perched on a perch nailed to the barrel
  bigPlant: { height: 50, paint(p) {
    const middle = { x: 0.5, y: 0.5 };
    p.shadow(0.5, 0.5, 8, 4);
    barrel(p, middle, 0, 8, 5, F.soil);
    for (let up = 7; up < 34; up++) {
      const sway = Math.round(Math.sin((up - 7) / 9) * 2.4);
      const ring = up % 3 === 0;
      p.upright(sway, up, ring ? tones(F.palmTrunk).dark : F.palmTrunk, middle);
      p.upright(sway + 1, up, ring ? tones(F.palmTrunk).dark : tones(F.palmTrunk).shade, middle);
      if (up < 15) p.upright(sway - 1, up, tones(F.palmTrunk).light, middle);
    }
    const crown = { x: 0.5 + 0.06, y: 0.5 - 0.06 };
    fronds(p, crown, 34, 8, [F.frond, F.frondLight, F.frondDark]);
    for (const across of [0, 2, 1]) p.ball(crown.x, crown.y, 32 - (across === 1 ? 1 : 0), 1.2, 1.2, F.coconut);
    // the perch: a crossbar on a stick against the trunk, the parrot on it
    for (let up = 8; up < 25; up++) p.upright(-5, up, F.darkWood, middle);
    for (let across = -8; across <= -3; across++) p.upright(across, 25, F.oak, middle);
    sprite(p, PARROT, PARROT_COLOURS, middle, 23, -6);
  } },
  // two sea chests one on the other, a rack of rolled charts beside them
  bookshelf: { height: 28, paint(p) {
    chest(p, 0.04, 0.04, 1, 0.52, 0, 12);
    chest(p, 0.1, 0.08, 0.86, 0.44, 12, 12);
    p.box(1.08, 0, 0.9, 0.6, 0, 24, F.darkWood, F.oakTop);
    p.onFront(0.6, 1.14, 1.92, 1, 23, tones(F.darkWood).dark);
    for (const z of [8, 16]) p.onFront(0.6, 1.1, 1.96, z, z + 1, F.oak);
    for (const x of [1.36, 1.64]) p.onFront(0.6, x, x + 0.04, 1, 23, F.oak);
  }, fine(p) {
    // the charts' ends: rolls of parchment, a dark hole in the middle, a few tied with red
    for (const [low, high] of [[1, 8], [9, 16], [17, 23]] as const) for (const x of [1.18, 1.42, 1.7]) for (let z = low + 2; z < high - 1; z += 3) {
      const seed = pick(`roll${x}${z}`, 5);
      if (seed === 0) continue;
      for (const [across, up] of [[0, 0], [0.06, 0], [0.12, 0], [0, 1], [0.12, 1], [0.06, 1.5], [0, 2], [0.06, 2], [0.12, 2]] as const) p.pixel(x + across, 0.6, z + up - 1, seed === 1 ? P.cross : P.parchment);
      p.pixel(x + 0.06, 0.6, z, P.parchmentBurnt);
    }
  } },
  // a long sea chest along the wall for a bench, its cushions, bolsters against the wall, the far end board
  sofa: { height: 22, paint(p, { depth }) {
    p.box(0.04, 0, 0.12, depth, 0, 18, F.darkWood, F.oakTop);
    p.box(0.3, 0.05, 0.66, depth - 0.1, 0, 5, F.oak, F.oakTop);
    const seat = (depth - 0.22) / depth;
    for (let index = 0; index < depth; index++) {
      const y = 0.22 + index * seat;
      p.onSide(0.96, y + seat / 2 - 0.06, y + seat / 2 + 0.06, 2, 4, F.gold);
      p.onSide(0.96, y + 0.02, y + 0.06, 0, 5, F.hoop);
      p.box(0.16, y + 0.03, 0.2, seat - 0.08, 5, 8, F.velvet);
      p.box(0.32, y, 0.64, seat - 0.03, 5, SEAT_TOP - 5, F.cushion, tones(F.cushion).light);
      p.onSide(0.96, y + 0.04, y + seat - 0.06, 5.5, 6, F.cushionStripe);
    }
    p.box(0.04, 0, 0.92, 0.22, 0, 12, F.darkWood, F.oakTop);
  } },
  sofaArm: { height: 16, paint(p) {
    p.box(0.04, 0, 0.92, 0.22, 0, 12, F.darkWood, F.oakTop);
    p.onSide(0.96, 0.04, 0.18, 9, 10, F.gold);
  } },
  // the same bench facing the room, its back board on the back wall's side
  couch: { height: 22, paint(p, { width }) {
    p.box(0, 0.04, width, 0.12, 0, 18, F.darkWood, F.oakTop);
    p.onFront(0.16, 0, width, 16, 17, P.rope);
    p.box(0.05, 0.3, width - 0.1, 0.62, 0, 5, F.oak, F.oakTop);
    for (let index = 0; index < width; index++) {
      p.onFront(0.92, index + 0.45, index + 0.55, 2, 4, F.gold);
      p.onFront(0.92, index + 0.04, index + 0.08, 0, 5, F.hoop);
      p.box(index + 0.07, 0.16, 0.86, 0.2, 5, 8, F.velvet);
      p.box(index + 0.05, 0.34, 0.9, 0.58, 5, SEAT_TOP - 5, F.cushion, tones(F.cushion).light);
      p.onFront(0.92, index + 0.08, index + 0.92, 5.5, 6, F.cushionStripe);
    }
    p.box(0, 0.04, 0.2, 0.9, 0, 12, F.darkWood, F.oakTop);
  } },
  couchArm: { height: 16, paint(p) {
    p.box(0, 0.04, 0.2, 0.9, 0, 12, F.darkWood, F.oakTop);
    p.onFront(0.94, 0.04, 0.16, 9, 10, F.gold);
  } },
  // a treasure chest, open: its lid up at the back lined with velvet, gold heaped level with the office table's top
  lowTable: { height: 22, paint(p, { width, depth }) {
    const along = width >= depth;
    p.shadow(width / 2, depth / 2, 4 + (width + depth) * 3, 3 + (width + depth));
    if (along) p.box(0.15, 0.06, width - 0.3, 0.12, 6, 9, F.oak, F.oakTop);
    else p.box(0.06, 0.15, 0.12, depth - 0.3, 6, 9, F.oak, F.oakTop);
    p.box(0.15, 0.15, width - 0.3, depth - 0.3, 0, 6, F.oak, F.goldDark);
    // the inside of the lid: bare oak, a gilded rim, two iron straps
    const lining = (from: number, to: number, low: number, high: number, colour: string) => (along ? p.onFront(0.18, from, to, low, high, colour) : p.onSide(0.18, from, to, low, high, colour));
    const span = along ? width : depth;
    lining(0.18, span - 0.18, 6, 15, F.oakTop);
    lining(0.18, span - 0.18, 14, 15, F.gold);
    for (const share of [0.25, 0.75]) lining(span * share - 0.05, span * share + 0.05, 6, 14, F.hoop);
    p.box(0.25, 0.25, width - 0.5, depth - 0.5, 6, 1, F.gold, F.goldLight);
    for (const share of [0.15, 0.85]) {
      p.onFront(depth - 0.15, 0.15 + (width - 0.3) * share - 0.03, 0.15 + (width - 0.3) * share + 0.03, 0, 6, F.hoop);
      p.onSide(width - 0.15, 0.15 + (depth - 0.3) * share - 0.03, 0.15 + (depth - 0.3) * share + 0.03, 0, 6, F.hoop);
    }
    p.onFront(depth - 0.15, width / 2 - 0.07, width / 2 + 0.07, 2, 5, F.gold);
  }, fine(p, { width, depth }) {
    // coins, jewels and a string of pearls spilling over the front
    for (let index = 0; index < 14; index++) {
      const x = 0.3 + (pick(`coin${width}${index}`, 100) / 100) * (width - 0.6), y = 0.3 + (pick(`coiny${depth}${index}`, 100) / 100) * (depth - 0.6);
      p.pixel(x, y, 7, index % 4 === 0 ? F.jewels[index % F.jewels.length] : index % 2 ? F.goldLight : F.goldDark);
    }
    for (let step = 0; step < 6; step++) p.pixel(width * 0.3 + step * 0.06, depth - 0.15, 6 - Math.abs(step - 2.5) * 0.8, F.pearl);
    p.pixel(width * 0.7, depth + 0.05, 0, F.gold);
    p.pixel(width * 0.75, depth + 0.1, 0, F.goldDark);
  } },
  // a lantern hung from the arm of a post, a coil of rope at its foot
  floorLamp: { height: 36, paint(p) {
    const middle = { x: 0.5, y: 0.5 };
    p.shadow(0.5, 0.5, 6, 3);
    p.box(0.2, 0.42, 0.6, 0.16, 0, 2, F.darkWood);
    p.box(0.42, 0.2, 0.16, 0.6, 0, 2, F.darkWood);
    cylinder(p, middle, 2, 2, 3, P.rope, P.ropeShade);
    p.box(0.45, 0.45, 0.1, 0.1, 2, 28, F.oak, F.oakTop);
    p.box(0.46, 0.12, 0.08, 0.4, 28, 1.5, F.darkWood);
    p.box(0.4, 0.12, 0.2, 0.18, 16, 1, P.lanternFrame);
    p.box(0.42, 0.14, 0.16, 0.14, 17, 6, P.lanternGlassDim, P.lanternFrame);
    p.box(0.4, 0.12, 0.2, 0.18, 23, 1, P.lanternFrame);
    p.box(0.46, 0.18, 0.08, 0.06, 24, 1, P.lanternFrame);
  }, fine(p) {
    for (const z of [17, 18, 19, 20, 21, 22]) {
      p.pixel(0.47, 0.32, z, P.lanternGlass);
      p.pixel(0.53, 0.32, z, P.lanternGlass);
    }
    p.pixel(0.5, 0.32, 19, P.flameCore);
    p.pixel(0.5, 0.2, 25, P.iron);
    p.pixel(0.5, 0.2, 26, P.iron);
    p.pixel(0.5, 0.2, 27, P.iron);
  } },
  // a barrel of rum lying on its cradle, a brass tap in its end, a tin cup under it
  cooler: { height: 22, paint(p) {
    for (const y of [0.3, 0.66]) {
      p.box(0.24, y, 0.52, 0.07, 0, 3, F.darkWood);
      p.box(0.22, y, 0.1, 0.07, 3, 2, F.darkWood);
      p.box(0.68, y, 0.1, 0.07, 3, 2, F.darkWood);
    }
    const radius = 6, center = 9;
    for (let slice = 0; slice <= 9; slice++) {
      const y = 0.2 + slice * 0.065;
      const end = slice === 9;
      const reach = radius - (slice === 0 || end ? 1 : 0);
      for (let across = -reach; across <= reach; across++) for (let up = -reach; up <= reach; up++) {
        if (across * across + up * up > reach * reach + 1) continue;
        const hoop = slice === 2 || slice === 7;
        let colour = up > reach * 0.4 ? tones(F.stave).light : up < -reach * 0.4 ? tones(F.stave).shade : F.stave;
        if (hoop) colour = F.hoop;
        if (end) colour = across * across + up * up > (reach - 1) ** 2 ? F.hoop : (across + 20) % 3 === 0 ? tones(F.staveTop).shade : F.staveTop;
        p.pixel(0.5 + across / 8, y, center + up, colour);
      }
    }
  }, fine(p) {
    p.pixel(0.5, 0.84, 7, F.gold);
    p.pixel(0.5, 0.88, 7, F.gold);
    p.pixel(0.5, 0.88, 6, F.goldDark);
    for (const [x, z] of [[0.45, 9], [0.5, 10], [0.55, 9], [0.5, 11]] as const) p.pixel(x, 0.85, z, F.rum);
    for (let up = 0; up < 3; up++) for (const across of [-0.04, 0, 0.04]) p.pixel(0.5 + across, 0.96, up, up === 2 ? F.rum : F.tin);
  } },
  // the galley: a plank on three barrels, an iron stove and its kettle, two mugs of grog, a crate of fruit, a bottle
  counter: { height: 26, paint(p) {
    for (const x of [0.5, 1.5, 2.5]) barrel(p, { x, y: 0.55 }, 0, 11, 6);
    p.box(0, 0.1, 3, 0.85, 11, 1, F.oak, F.oakTop);
    p.onFront(0.95, 0, 3, 11, 11.5, F.darkWood);
    p.box(0.3, 0.3, 0.5, 0.4, 12, 6, F.stove, tones(F.stove).light);
    p.onFront(0.7, 0.4, 0.68, 13, 16, F.eye);
    cylinder(p, KETTLE, 18, 1, 2, F.tin);
    for (const x of [1.2, 1.45]) p.box(x, 0.5, 0.14, 0.14, 12, 3, F.tin, F.grog);
    p.box(2.05, 0.3, 0.55, 0.45, 12, 3, F.oak, F.darkWood);
    p.box(2.75, 0.25, 0.1, 0.1, 12, 5, F.bottle);
    p.box(2.77, 0.27, 0.06, 0.06, 17, 2, F.bottle, F.oakTop);
  }, fine(p) {
    for (const [x, y, colour] of [[2.15, 0.4, F.orange], [2.25, 0.5, F.orange], [2.35, 0.4, F.lime], [2.45, 0.55, F.orange], [2.3, 0.62, F.lime], [2.5, 0.42, F.orange], [2.18, 0.6, F.lime]] as const) {
      p.pixel(x, y, 15, colour);
      p.pixel(x + 0.04, y, 15, tones(colour).shade);
    }
    for (const x of [0.48, 0.55, 0.62]) p.pixel(x, 0.7, 13.5, F.fire);
  } },
  // a sea chart on an easel: the notes are written on it in ink
  whiteboard: { height: 70, paint(p, _piece, board) {
    paintEasel(p);
    if (board.kind === 'birthday') for (const [x, z, colour] of BOARD_BALLOONS) p.ball(x, 0.3, z, 3.5, 4.5, ROOM_PALETTE.festive.balloons[colour]);
  }, fine(p, _piece, board) {
    paintChart(p);
    // pins at its corners, and on an ordinary day a coast and a compass rose in its free top right corner
    for (const [x, z] of [[0.24, 41], [3.76, 41], [0.24, 16], [3.76, 16]]) p.pixel(x, CHART.y, z, F.gold);
    if (board.kind === 'notes') {
      for (let column = 0; column < 12; column++) p.pixel(2.4 + column / 8, CHART.y, 38 - Math.round(Math.sin(column / 2) * 1.5 + column * 0.25), P.inkFaint);
      const rose = { x: 3.4, z: 30 };
      for (let reach = -2; reach <= 2; reach++) {
        p.pixel(rose.x + reach / 8, CHART.y, rose.z, P.inkFaint);
        p.pixel(rose.x, CHART.y, rose.z + reach, reach > 0 ? P.cross : P.inkFaint);
      }
    }
    writeOnBoard(p, board);
    if (board.kind === 'birthday') for (const [x, z] of BOARD_BALLOONS) for (let up = 48; up < z - 4; up++) p.pixel(0.1 + (x - 0.1) * (up - 48) / (z - 52), 0.3, up, ROOM_PALETTE.festive.white);
  }, clickable(p) {
    paintEasel(p);
    p.onFront(CHART.y, CHART.fromX, CHART.toX, CHART.low, CHART.high, P.parchment);
  } },
};

/* What moves on the furniture every frame, in room pixels */

/** A point of a piece in room pixels: (x, y) in tiles from its corner, `z` art pixels up. */
function pointOf(piece: FurniturePiece, x: number, y: number, z: number): Point {
  const point = toScreen({ x: piece.x + x, y: piece.y + y });
  return { x: point.x, y: point.y - z * ART_SCALE };
}

/** An art pixel at a room point, on the art grid. */
function dot(context: Context, point: Point, colour: string, alpha: number) {
  if (alpha <= 0.01) return;
  context.globalAlpha = Math.min(1, alpha);
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x / ART_SCALE) * ART_SCALE, Math.round(point.y / ART_SCALE) * ART_SCALE, ART_SCALE, ART_SCALE);
}

/** A soft round glow of art pixels around a room point, fading out to `radius`. */
export function glowAround(context: Context, center: Point, radius: number, colour: string, alpha: number) {
  for (let up = -radius; up <= radius; up++) for (let across = -radius; across <= radius; across++) {
    const distance = Math.hypot(across, up * 1.2);
    if (distance > radius) continue;
    dot(context, { x: center.x + across * ART_SCALE, y: center.y + up * ART_SCALE }, colour, alpha * (1 - distance / radius) ** 1.5);
  }
}

/** How bright a flame is at `time`: a flicker that never goes out. */
export const flicker = (seed: number, time: number) => 0.7 + 0.3 * Math.sin(time / 90 + seed) * Math.sin(time / 230 + seed * 2);

/** A colour as the light of the hour shows it, for what is drawn after the light but should not glow; `lamp`: how much a lamp nearby lights it at night. */
export const litBy = (colour: string, lighting: Lighting, lamp = 0) =>
  css(rgb(colour).map((channel, index) => Math.round(channel * Math.min(1, lighting.tint[index] / 255 + lamp * lighting.glow))) as unknown as Rgb);

export function paintPieceEffects(context: Context, piece: FurniturePiece, time: number, lighting: Lighting) {
  const seed = piece.x * 3 + piece.y;
  const night = lighting.glow;
  if (piece.kind === 'floorLamp') {
    const shine = flicker(seed, time);
    glowAround(context, pointOf(piece, 0.5, 0.3, 20), 7, F.halo, (0.12 + night * 0.35) * shine);
    dot(context, pointOf(piece, 0.5, 0.32, 19), P.flameCore, 0.6 + shine * 0.4);
    dot(context, pointOf(piece, 0.5, 0.32, 20), P.flame, shine * 0.8);
  }
  if (piece.kind === 'lowTable') {
    // a coin or a jewel catching the light now and then
    for (let glint = 0; glint < 2; glint++) {
      const beat = Math.floor(time / 700 + glint * 0.5 + seed);
      if (pick(`glint${seed},${glint},${beat}`, 3)) continue;
      const point = pointOf(piece, 0.3 + (pick(`gx${seed}${beat}${glint}`, 100) / 100) * (piece.width - 0.6), 0.3 + (pick(`gy${seed}${beat}${glint}`, 100) / 100) * (piece.depth - 0.6), 7.5);
      dot(context, point, P.glint, 0.9);
      dot(context, { x: point.x - ART_SCALE, y: point.y }, P.glint, 0.35);
      dot(context, { x: point.x + ART_SCALE, y: point.y }, P.glint, 0.35);
    }
    if (night > 0.05) glowAround(context, pointOf(piece, piece.width / 2, piece.depth / 2, 8), 6, F.gold, 0.12 * night);
  }
  if (piece.kind === 'counter') {
    const shine = flicker(seed, time);
    for (const [x, z] of [[0.48, 13.5], [0.55, 14], [0.62, 13.5], [0.55, 13]] as const) dot(context, pointOf(piece, x, 0.7, z), z > 13.6 ? F.fireCore : F.fire, 0.4 + shine * 0.6);
    glowAround(context, pointOf(piece, 0.55, 0.72, 14), 4, F.fire, (0.15 + night * 0.3) * shine);
  }
  if (piece.kind === 'cooler') {
    // a drop of rum falling from the tap into the cup
    const fall = (time / 1600 + seed / 5) % 1;
    if (fall < 0.5) dot(context, pointOf(piece, 0.5, 0.9, 6 - fall * 8), F.rum, 0.9);
  }
  if (piece.kind === 'bigPlant') {
    // the parrot blinks, and now and then ruffles its wing
    const middle = { x: piece.width / 2, y: piece.depth / 2 };
    const head = pointOf(piece, middle.x, middle.y, 30);
    if (Math.floor(time / 180) % 23 === 0) dot(context, { x: head.x - 6 * ART_SCALE, y: head.y }, litBy(F.parrot, lighting), 1);
    if (Math.floor(time / 300) % 17 === 0) dot(context, { x: head.x - 8 * ART_SCALE, y: head.y + 3 * ART_SCALE }, litBy(F.parrotWing, lighting), 1);
  }
}

/** The furniture's own lights at night: the lanterns, the galley's fire, the gold in the chests. */
export function pirateFurnitureLights(layout: Layout): ThemeLight[] {
  const lights: ThemeLight[] = [];
  const add = (piece: FurniturePiece, x: number, y: number, height: number, radius: number, colour: string, strength: number) =>
    lights.push({ x: piece.x + x, y: piece.y + y, height, radius, colour, strength });
  for (const piece of layout.furniture) {
    if (piece.kind === 'floorLamp') add(piece, 0.5, 0.3, 40, 140, F.lightLantern, 1);
    if (piece.kind === 'bossDesk') add(piece, 2.8, 0.2, 32, 90, F.lightLantern, 0.9);
    if (piece.kind === 'counter') add(piece, 0.55, 0.8, 28, 80, F.lightFire, 0.8);
    if (piece.kind === 'lowTable') add(piece, piece.width / 2, piece.depth / 2, 16, 50, F.lightGold, 0.45);
  }
  return lights;
}
