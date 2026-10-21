// The room dressed as a pirate galleon (themes/kit.ts), at art resolution like backdrop.ts: the hull's planks inside,
// sagging with the ship's sheer, its ribs and beams, lanterns, a net with its floats, cannons at their gun ports, the
// black flag and a treasure map; a tarred deck with a hatch, coils of rope and plundered carpets; the hull outside with
// its painted band and gun ports; a studded cabin door, stern windows on the sea, the wheel for a clock, a great map for
// the lounge's screen. The furniture is in pirate-furniture.ts, what moves in pirate-effects.ts, the page in pirate-sky.ts.
import { PIRATE_FURNITURE as F, PIRATE_PALETTE as P } from '../../design/theme-pirate.ts';
import { ROOM, type Layout, type Rug, type WallItem } from '../../../shared/room-layout.ts';
import type { Point } from '../geometry.ts';
import { css, mix, rgb, type Lighting } from '../lighting.ts';
import { fillPolygon, toArt, tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import type { ThemeKit } from './kit.ts';
import { WALL, line, onWallAt, type Context, type Wall } from '../wall-art.ts';
import { FLAG, FLAG_COLOURS, FLAG_ROWS, LANTERNS, MAP, dot, wallDot, wallQuad, wallSprite } from './pirate-art.ts';
import { PIRATE_FURNITURE } from './pirate-furniture.ts';
import { pirateEffects, pirateLights, rememberHull } from './pirate-effects.ts';
import { paintSeaAndSky, paintSeaMotion } from './pirate-sky.ts';

const lift = (point: Point, z: number): Point => ({ x: point.x, y: point.y - z });
const toward = (from: Point, to: Point, share: number): Point => ({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
const lengthOf = (wall: Wall) => (wall === 'back' ? ROOM.width : ROOM.depth);

/* The walls */

const STRAKE = 4;
/** Where the ribs stand along each wall, in tiles. */
const RIBS: Readonly<Record<Wall, readonly number[]>> = { back: [0.6, 3.2, 6.2, 8.7, 11.2, 13.9, 16.5, 19.4], left: [0.6, 3.1, 5.6, 8.1, 11.7, 13.6] };
const BEAM = 45;

/** How far the planks sag towards the middle of a wall, in art pixels: the sheer of the hull. */
const sheer = (wall: Wall, column: number) => Math.round(Math.sin((column / (lengthOf(wall) * 8)) * Math.PI) * 2.4);

/** The hull's planks, a pixel at a time: a tarred seam under each, its top edge lit, joints staggered and pegged, darker near the deck. */
function paintStrakes(context: Context, wall: Wall) {
  const columns = lengthOf(wall) * 8;
  for (let column = 0; column < columns; column++) {
    const sag = sheer(wall, column);
    for (let z = 2; z < BEAM; z++) {
      const row = Math.floor((z + sag) / STRAKE);
      const inRow = z + sag - row * STRAKE;
      const offset = (row * 11) % 30;
      const plank = Math.floor((column + offset) / 30);
      const joint = (column + offset) % 30;
      const base = P.strakes[pick(`${wall}strake${row},${plank}`, P.strakes.length)];
      let colour = inRow === 0 ? P.strakeSeam : inRow === STRAKE - 1 && pick(`${wall}lit${row},${plank}`, 2) === 0 ? P.strakeLight : pick(`${wall}grain${column},${z}`, 17) === 0 ? tones(base).shade : base;
      if (joint === 0) colour = P.strakeSeam;
      if ((joint === 2 || joint === 28) && inRow === 2) colour = P.peg;
      // the lower planks stay in the shade of the deck's furniture
      if (z < 12 && colour !== P.strakeSeam && colour !== P.peg) colour = tones(colour).shade;
      wallDot(context, wall, column, z, colour);
    }
  }
}

/** The ribs up the walls, the beam along their top, the beams' ends over each rib and the knees holding them. */
function paintFrames(context: Context, wall: Wall) {
  const columns = lengthOf(wall) * 8;
  for (let column = 0; column < columns; column++) for (let z = BEAM; z < WALL; z++) {
    wallDot(context, wall, column, z, z === BEAM ? P.ribShade : z === WALL - 1 ? P.ribLight : P.rib);
  }
  for (const along of RIBS[wall]) {
    const middle = Math.round(along * 8);
    for (let z = 2; z < BEAM; z++) {
      wallDot(context, wall, middle - 1, z, P.ribLight);
      wallDot(context, wall, middle, z, P.rib);
      wallDot(context, wall, middle + 1, z, P.ribShade);
    }
    // a knee either side under the beam, and the beam's end over the rib
    for (let step = 0; step < 4; step++) for (const side of [-1, 1]) wallDot(context, wall, middle + side * (2 + step), BEAM - 1 - step, side < 0 ? P.ribLight : P.ribShade);
    for (let column = middle - 2; column <= middle + 2; column++) for (let z = BEAM + 1; z < WALL - 1; z++) {
      wallDot(context, wall, column, z, column === middle - 2 ? P.ribLight : column === middle + 2 ? P.ribShade : P.strakeLight);
    }
    wallDot(context, wall, middle, BEAM + 2, P.peg);
  }
  for (let column = 0; column < columns; column++) for (const z of [0, 1]) wallDot(context, wall, column, z, P.baseboard);
}

const LANTERN = ['..k..', '.kkk.', 'kkkkk', 'kgggk', 'kgfgk', 'kgggk', 'kgggk', 'kkkkk', '.kkk.'];

/** A lantern hung from a hook on a rib, on a short chain (its flame flickers, see pirate-effects.ts). */
function paintLantern(context: Context, wall: Wall, along: number, z: number) {
  wallSprite(context, wall, LANTERN, { k: P.lanternFrame, g: P.lanternGlass, f: P.flameCore }, along, z - 2);
  for (let up = z + 7; up < z + 11; up++) wallDot(context, wall, Math.round(along * 8), up, up % 2 ? P.ironLight : P.iron);
  wallDot(context, wall, Math.round(along * 8) + 1, z + 11, P.iron);
}

/** A fishing net hung in the back corner, sagging over both walls, glass floats caught in it. */
function paintNet(context: Context) {
  for (const wall of ['back', 'left'] as const) for (let column = 0; column < 14; column++) {
    const bottom = Math.round(30 + (column / 14) ** 0.8 * 14 + Math.sin(column * 0.9) * 1.5);
    for (let z = bottom; z < BEAM; z++) {
      if ((column + z) % 4 === 0 || (column - z + 40) % 4 === 0) wallDot(context, wall, column, z, P.net);
    }
    wallDot(context, wall, column, bottom, P.ropeShade);
  }
  for (const [wall, along, z, colour] of [['back', 0.55, 38, 0], ['left', 0.85, 40, 1], ['back', 1.2, 43, 2], ['left', 0.3, 34, 2]] as const) {
    const floatColour = tones(P.floats[colour]);
    for (let up = -2; up <= 2; up++) for (let across = -2; across <= 2; across++) {
      if (across * across + up * up > 5) continue;
      wallDot(context, wall, Math.round(along * 8) + across, z + up, across + up < -1 ? floatColour.light : across - up > 1 ? floatColour.shade : floatColour.base);
    }
    wallDot(context, wall, Math.round(along * 8) - 1, z + 1, P.glint);
  }
}

/** A cannon run out at its gun port, seen from behind: the port on the sea, the breech and its knob, the carriage, its ropes, a pile of balls. */
function paintCannon(context: Context, wall: Wall, along: number) {
  const middle = Math.round(along * 8);
  for (let column = middle - 6; column <= middle + 6; column++) for (let z = 4; z <= 16; z++) {
    const frame = Math.abs(column - middle) >= 5 || z <= 5 || z >= 15;
    wallDot(context, wall, column, z, frame ? (z >= 15 ? P.ribLight : P.rib) : z > 10 ? css(mix(rgb(P.seaLight), rgb(P.sail), (z - 10) / 5)) : z === 10 ? P.seaLight : P.seaDay);
  }
  // the carriage, wider at the bottom, its wheels
  for (let z = 0; z < 7; z++) {
    const half = 5 - Math.floor(z / 3);
    for (let across = -half; across <= half; across++) wallDot(context, wall, middle + across, z, z === 6 ? tones(P.carriage).light : across === half ? tones(P.carriage).shade : P.carriage);
  }
  for (const side of [-4, 4]) for (const [across, up] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 1], [0, 2]] as const) wallDot(context, wall, middle + side + across, up, P.iron);
  // the breech, round, lit from the top left, and its knob
  for (let up = -4; up <= 4; up++) for (let across = -4; across <= 4; across++) {
    const distance = Math.hypot(across, up);
    if (distance > 4.2) continue;
    wallDot(context, wall, middle + across, 10 + up, distance > 3.2 ? P.cannonLight : across - up < -3 ? P.cannonLight : P.cannon);
  }
  wallDot(context, wall, middle, 10, P.cannonLight);
  wallDot(context, wall, middle, 9, P.cannonLight);
  wallDot(context, wall, middle, 8, P.cannon);
  // the breeching ropes to their ring bolts
  for (const side of [-1, 1]) {
    line(context, onWallAt(wall, (middle + side * 4) / 8, 7), onWallAt(wall, (middle + side * 9) / 8, 11), P.rope);
    wallDot(context, wall, middle + side * 9, 11, P.ironLight);
  }
  // a pile of cannon balls beside it
  for (const [across, up] of [[11, 1], [14, 1], [17, 1], [12.5, 4], [15.5, 4], [14, 7]] as const) {
    const column = middle + (wall === 'left' ? -across : across);
    for (const [x, z, colour] of [[0, 0, P.cannon], [1, 0, P.cannon], [0, 1, P.cannonLight], [1, 1, P.cannon], [-1, 1, P.cannon], [2, 1, P.cannon], [0, 2, P.cannon], [1, 2, P.cannon]] as const) {
      wallDot(context, wall, Math.round(column + x), up + z, colour);
    }
  }
}

function paintFlag(context: Context) {
  wallSprite(context, 'left', FLAG_ROWS, FLAG_COLOURS, FLAG.along, FLAG.top - FLAG.rows + 1);
  for (const side of [-1, 1]) wallDot(context, 'left', Math.round(FLAG.along * 8) + side * 9, FLAG.top, P.ironLight);
}

/** A treasure map nailed to the left wall: burnt edges, an island in ink, a path of dashes to a red cross, a compass mark. */
function paintWallMap(context: Context, along: number, bottom: number) {
  const width = 14, height = 13;
  const left = Math.round(along * 8) - width / 2;
  for (let column = 0; column < width; column++) for (let z = 0; z < height; z++) {
    const edge = column === 0 || z === 0 || column === width - 1 || z === height - 1;
    if (edge && pick(`mapedge${column},${z}`, 4) === 0) continue;
    const island = Math.hypot((column - 6.5) / 4.2, (z - 6) / 3.4) + Math.sin(column * 1.7 + z) * 0.12;
    const colour = edge ? P.parchmentBurnt : island < 1 ? (island > 0.82 ? P.ink : P.mapLand) : pick(`mapspot${column},${z}`, 13) === 0 ? P.parchmentDark : P.parchment;
    wallDot(context, 'left', left + width - 1 - column, bottom + z, colour);
  }
  for (const [column, z] of [[3, 3], [4, 4], [6, 5], [7, 6]] as const) wallDot(context, 'left', left + width - 1 - column, bottom + z, P.ink);
  for (const [column, z] of [[8, 6], [10, 8], [9, 7], [8, 8], [10, 6]] as const) wallDot(context, 'left', left + width - 1 - column, bottom + z, P.cross);
  for (const [column, z] of [[11, 10], [11, 11], [10, 10], [12, 10], [11, 9]] as const) wallDot(context, 'left', left + width - 1 - column, bottom + z, P.ink);
  for (const column of [1, width - 2]) wallDot(context, 'left', left + column, bottom + height - 1, P.ironLight);
}

/** Crossed cutlasses over the clock's side of the back wall: two curved blades, brass guards. */
function paintCutlasses(context: Context, wall: Wall, along: number, z: number) {
  const middle = Math.round(along * 8);
  for (const side of [-1, 1]) {
    for (let step = 0; step < 11; step++) {
      const column = middle + side * (step - 5) + (step > 7 ? side : 0);
      wallDot(context, wall, column, z + step, step < 3 ? P.brassDark : P.ironLight);
    }
    wallDot(context, wall, middle + side * -4, z + 2, P.brass);
    wallDot(context, wall, middle + side * -6, z + 2, P.brass);
  }
}

function paintHullInside(context: Context, layout: Layout) {
  for (const wall of ['back', 'left'] as const) {
    paintStrakes(context, wall);
    paintFrames(context, wall);
  }
  paintNet(context);
  paintCannon(context, 'left', 2.6);
  paintCannon(context, 'left', 6.2);
  paintFlag(context);
  paintWallMap(context, 12.6, 21);
  for (const lantern of LANTERNS) paintLantern(context, lantern.wall, lantern.along, lantern.z);
  // the office has the clock beside its middle window, the lounge its map: the cutlasses go over the end of the back wall
  if (layout.wallItems.some((item) => item.kind === 'tv')) paintCutlasses(context, 'back', 13.4, 36);
  paintCutlasses(context, 'back', 19.4, 36);
}

/* The deck */

const floorQuad = (context: Context, x: number, y: number, width: number, depth: number, colour: string) =>
  fillPolygon(context, [toArt({ x, y }), toArt({ x: x + width, y }), toArt({ x: x + width, y: y + depth }), toArt({ x, y: y + depth })], colour);

/** The deck's planks along x, long and staggered, tarred between them, pegged at their ends. */
function paintDeck(context: Context) {
  for (let y = 0; y < ROOM.depth * 2; y++) {
    const row = y / 2;
    let x = -((y * 5) % 4) * 0.75;
    while (x < ROOM.width) {
      const length = 3 + pick(`deck${x},${y}`, 3);
      const from = Math.max(0, x), to = Math.min(ROOM.width, x + length);
      const plank = P.planks[pick(`plank${y}:${x}`, P.planks.length)];
      floorQuad(context, from, row, to - from, 0.5, plank);
      line(context, toArt({ x: from, y: row }), toArt({ x: to, y: row }), P.plankSeam);
      if (to < ROOM.width) {
        line(context, toArt({ x: to, y: row }), toArt({ x: to, y: row + 0.5 }), P.plankSeam);
        for (const side of [-0.18, 0.18]) dot(context, toArt({ x: to + side, y: row + 0.3 }), tones(plank).dark);
      }
      x += length;
    }
  }
}

/** A hatch in the deck: a raised coaming around a grating over the dark hold. */
function paintHatch(context: Context, x: number, y: number, width: number, depth: number) {
  const raise = (point: Point) => lift(point, 2);
  const corners = [toArt({ x, y }), toArt({ x: x + width, y }), toArt({ x: x + width, y: y + depth }), toArt({ x, y: y + depth })];
  fillPolygon(context, [corners[3], corners[2], raise(corners[2]), raise(corners[3])], P.ribLight);
  fillPolygon(context, [corners[1], corners[2], raise(corners[2]), raise(corners[1])], P.rib);
  fillPolygon(context, corners.map(raise), P.wallTopEdge);
  // the grating: oak bars, the dark of the hold showing through a hole between each
  const inset = 0.16;
  fillPolygon(context, [toArt({ x: x + inset, y: y + inset }), toArt({ x: x + width - inset, y: y + inset }), toArt({ x: x + width - inset, y: y + depth - inset }), toArt({ x: x + inset, y: y + depth - inset })].map(raise), P.strakeLight);
  for (let along = x + inset + 0.17; along < x + width - inset - 0.1; along += 0.3) for (let across = y + inset + 0.15; across < y + depth - inset - 0.1; across += 0.3) {
    const hole = raise(toArt({ x: along, y: across }));
    context.fillStyle = P.doorway;
    context.fillRect(Math.round(hole.x) - 1, Math.round(hole.y), 2, 1);
  }
  for (const [cx, cy] of [[x + 0.08, y + 0.08], [x + width - 0.08, y + 0.08], [x + width - 0.08, y + depth - 0.08], [x + 0.08, y + depth - 0.08]]) dot(context, raise(toArt({ x: cx, y: cy })), P.ironLight);
}

/** A coil of rope lying on the deck: a flat spiral from the outside in, its loose end trailing. */
function paintCoil(context: Context, x: number, y: number, radius: number) {
  for (let step = 0; step < 900; step++) {
    const turn = step / 900;
    const angle = turn * Math.PI * 2 * 4.2;
    const reach = radius * (1 - turn * 0.78);
    const point = toArt({ x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach });
    dot(context, lift(point, 1), Math.floor(step / 9) % 2 ? P.rope : P.ropeShade);
  }
  for (let step = 0; step < 14; step++) dot(context, toArt({ x: x + radius + step * 0.04, y: y + step * 0.03 }), step % 2 ? P.rope : P.ropeShade);
}

/** A plundered carpet: a dark border, a light line inside it, its field with a medallion every few tiles, fringes at both ends. */
function paintCarpet(context: Context, rug: Rug) {
  const { x, y, width, depth } = rug;
  const field = P.rugs[rug.colour];
  const colours = tones(field);
  floorQuad(context, x, y, width, depth, colours.dark);
  floorQuad(context, x + 0.14, y + 0.14, width - 0.28, depth - 0.28, P.parchmentDark);
  floorQuad(context, x + 0.2, y + 0.2, width - 0.4, depth - 0.4, field);
  const along = width >= depth;
  const length = along ? width : depth;
  const count = Math.max(1, Math.round(length / 3.5));
  for (let index = 0; index < count; index++) {
    const share = (index + 0.5) / count;
    const cx = along ? x + width * share : x + width / 2, cy = along ? y + depth / 2 : y + depth * share;
    const rx = Math.min(1.1, (along ? width / count : width) * 0.32), ry = Math.min(1.1, (along ? depth : depth / count) * 0.32);
    // a diamond on screen: its long diagonal across (x up, y down), its short one up and down
    const across = Math.min(rx, ry) * 1.2, up = Math.min(rx, ry) * 0.6;
    const diamond = (scale: number) => [toArt({ x: cx - across * scale, y: cy + across * scale }), toArt({ x: cx - up * scale, y: cy - up * scale }), toArt({ x: cx + across * scale, y: cy - across * scale }), toArt({ x: cx + up * scale, y: cy + up * scale })];
    fillPolygon(context, diamond(1), P.parchmentDark);
    fillPolygon(context, diamond(0.8), colours.dark);
    fillPolygon(context, diamond(0.45), colours.light);
    dot(context, toArt({ x: cx, y: cy }), P.parchment);
  }
  // the fringe, out from the two short ends
  for (let step = 0.1; step < (along ? depth : width) - 0.05; step += 0.14) {
    for (const end of [0, 1]) {
      const point = along ? toArt({ x: x + (end ? width + 0.08 : -0.08), y: y + step }) : toArt({ x: x + step, y: y + (end ? depth + 0.08 : -0.08) });
      dot(context, point, P.parchment);
    }
  }
}

function paintDeckFloor(context: Context, layout: Layout) {
  paintDeck(context);
  const lounge = layout.wallItems.some((item) => item.kind === 'tv');
  if (lounge) {
    paintHatch(context, 17, 9.6, 1.6, 1.4);
    paintCoil(context, 3.3, 11.9, 0.45);
    paintCoil(context, 10.5, 12.4, 0.35);
  } else {
    paintHatch(context, 8.6, 9.6, 1.8, 1.4);
    paintCoil(context, 7, 1.1, 0.45);
    paintCoil(context, 12.6, 12, 0.38);
  }
  for (const rug of layout.rugs) paintCarpet(context, rug);
}

/* The hull outside */

/** How deep the hull goes under the slab's underside, into the sea (art pixels). */
const DRAUGHT = 6;

/**
 * Over the slab, the ship's side: the floor's edge becomes a gilded band, the slab dark strakes pierced by gun ports
 * (red lids raised, the muzzles out), the underside the red of the hull under the water, a keel at the bow.
 */
function paintHull(context: Context, left: Point, front: Point, right: Point, height: number, underside: number) {
  const faces = [[left, front, 1], [front, right, 0.78]] as const;
  for (const [from, to, light] of faces) {
    const tint = (colour: string) => (light < 1 ? tones(colour).shade : colour);
    // the band on the floor's edge, above the slab
    fillPolygon(context, [lift(from, 4), lift(to, 4), lift(to, 1), lift(from, 1)], tint(P.hullBand));
    line(context, lift(from, 4), lift(to, 4), tint(P.brassLight));
    line(context, lift(from, 1), lift(to, 1), tint(P.hullBandDark));
    line(context, from, to, tint(P.slabSeam));
    for (const z of [2, 4]) line(context, lift(from, -z), lift(to, -z), tint(P.slabSeam));
    fillPolygon(context, [lift(from, -height), lift(to, -height), lift(to, -height - underside - DRAUGHT), lift(from, -height - underside - DRAUGHT)], tint(P.hullRed));
    line(context, lift(from, -height), lift(to, -height), tint(tones(P.hullRed).light));
    // the gun ports along the side, in painted frames, their lids raised, the muzzles out in the dark
    const steps = Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 14);
    for (let index = 1; index < steps; index++) {
      const at = toward(from, to, index / steps);
      const x = Math.round(at.x), y = Math.round(at.y);
      context.fillStyle = tint(P.portLid);
      context.fillRect(x - 2, y, 5, 1);
      context.fillStyle = tint(P.hullBandDark);
      context.fillRect(x - 2, y + 1, 5, 4);
      context.fillStyle = P.keel;
      context.fillRect(x - 1, y + 2, 3, 2);
      context.fillStyle = P.cannonLight;
      context.fillRect(x, y + 3, 1, 1);
    }
  }
  // the stem at the bow, down from the front corner
  for (let down = 0; down < height + underside + DRAUGHT; down++) dot(context, lift(front, -down), down > height ? P.keel : P.slabLight);
  const waterline = height + underside;
  rememberHull(lift(left, -waterline), lift(front, -waterline), lift(right, -waterline));
}

/* The door */

/** The cabin door: a heavy frame studded with iron, a lantern's glow on the steps inside, its leaf open against the wall. */
function paintCabinDoor(context: Context, from: number, to: number, height: number) {
  wallQuad(context, 'left', from - 0.16, to + 0.16, 0, height + 2, P.rib);
  wallQuad(context, 'left', from - 0.16, to + 0.16, height + 1, height + 2, P.ribLight);
  wallQuad(context, 'left', from, to, 0, height, P.doorway);
  for (let step = 0; step < 5; step++) wallQuad(context, 'left', from + 0.12, to - 0.12, step * 5, step * 5 + 1, tones(P.doorLight).dark);
  wallQuad(context, 'left', from + 0.1, to - 0.1, 0, 2, tones(P.doorLight).shade);
  for (const along of [from - 0.08, to + 0.08]) for (let z = 3; z < height; z += 5) dot(context, onWallAt('left', along, z), P.ironLight);
  for (let along = from; along <= to; along += 0.2) dot(context, onWallAt('left', along, height + 1), P.iron);
  // the leaf, open flat against the wall: planks, two iron straps and their studs, a ring
  const leafFrom = to + 0.22, leafTo = to + 1.32;
  wallQuad(context, 'left', leafFrom, leafTo, 0, height - 1, P.doorWood);
  for (let along = leafFrom + 0.25; along < leafTo; along += 0.25) line(context, onWallAt('left', along, 0), onWallAt('left', along, height - 2), P.doorWoodDark);
  for (const z of [5, height - 7]) {
    wallQuad(context, 'left', leafFrom, leafTo - 0.1, z, z + 2, P.iron);
    for (let along = leafFrom + 0.1; along < leafTo - 0.1; along += 0.22) dot(context, onWallAt('left', along, z + 1), P.ironLight);
  }
  for (const [across, up] of [[0, 0], [1, 1], [0, 2], [-1, 1]] as const) dot(context, onWallAt('left', leafTo - 0.25 + across / 8, height / 2 - 1 + up), P.brass);
  line(context, onWallAt('left', leafTo, 0), onWallAt('left', leafTo, height - 1), P.doorWoodDark);
}

/* The stern windows */

type View = 'island' | 'sea' | 'ship';
const GLASS = { low: 16, high: 38, horizon: 25 };

/** What a pane shows at a pixel of the window: the sky of the hour, the sea under it, an island, a ship, the moon on the water. */
function seaView(view: View, gx: number, gz: number, width: number, lighting: Lighting, seed: number): string {
  const night = lighting.stars;
  const z = GLASS.low + gz;
  if (z > GLASS.horizon) {
    if (view === 'ship' && night > 0.3) {
      const distance = Math.hypot(gx - width * 0.72, (z - 34) * 1.1);
      if (distance < 2.6) return P.moonPath;
    }
    if (view === 'island') {
      const hill = Math.round(4 - Math.abs(gx - width * 0.32) / 2.2);
      if (z === GLASS.horizon + 1 && hill >= 0) return css(mix(rgb(P.sand), rgb(P.islandNight), night));
      if (z <= GLASS.horizon + hill) return css(mix(rgb(P.island), rgb(P.islandNight), night));
      // two palms leaning over the island
      for (const [trunk, top] of [[width * 0.29, 8], [width * 0.35, 7]] as const) {
        const rise = z - GLASS.horizon;
        if (rise > 0 && rise < top && Math.round(trunk + rise * 0.4) === gx) return css(mix(rgb(P.palmTrunk), rgb(P.islandNight), night));
        if (rise === top && Math.abs(gx - Math.round(trunk + top * 0.4)) <= 2) return css(mix(rgb(P.palm), rgb(P.islandNight), night));
        if (rise === top - 1 && Math.abs(gx - Math.round(trunk + top * 0.4)) === 3) return css(mix(rgb(P.palm), rgb(P.islandNight), night));
      }
    }
    if (view === 'ship') {
      const x = gx - Math.round(width * 0.3), rise = z - GLASS.horizon;
      if (rise === 1 && x >= -3 && x <= 3) return css(mix(rgb(P.hullFar), rgb(P.islandNight), night));
      if (rise >= 2 && rise <= 5 && (x === -1 || x === 2) ) return css(mix(rgb(P.sail), rgb(P.seaNightLight), night));
      if (rise >= 2 && rise <= 4 && (x === -2 || x === 1)) return css(mix(rgb(P.sail), rgb(P.seaNightLight), night * 0.9));
      if (rise === 6 && x === 2) return P.flag;
    }
    if (night > 0.2 && pick(`pane-star${seed},${gx},${gz}`, 23) === 0) return css(mix(lighting.skyTop, rgb(P.moonPath), night));
    return css(mix(lighting.skyBottom, lighting.skyTop, (z - GLASS.horizon) / (GLASS.high - GLASS.horizon)));
  }
  const depth = (GLASS.horizon - z) / (GLASS.horizon - GLASS.low);
  const sea = mix(mix(rgb(P.seaDay), rgb(P.seaDeep), depth), rgb(P.seaNight), night);
  const near = mix(sea, lighting.skyBottom, (1 - depth) * 0.35);
  const wave = gz % 2 === 0 && pick(`wave${seed},${Math.floor((gx + gz * 3) / 3)},${gz}`, 4) === 0;
  if (view === 'ship' && night > 0.3 && Math.abs(gx - width * 0.72) < 2 + depth * 3 && gz % 2 === 1 && pick(`moonpath${gx},${gz}`, 3)) return P.moonPath;
  if (wave) return css(mix(near, rgb(night > 0.5 ? P.seaNightLight : P.seaLight), 0.75));
  return css(near);
}

const viewOf = (index: number, count: number): View => (index === 0 ? 'island' : index === count - 1 ? 'ship' : 'sea');

/** A stern window: a carved frame with a gilded cornice, small panes between mullions, the sea through them. */
function paintSternWindow(context: Context, item: WallItem, lighting: Lighting, view: View) {
  const from = item.fromX, to = item.fromX + item.width;
  const width = Math.round(item.width * 8);
  wallQuad(context, 'back', from - 0.25, to + 0.25, GLASS.low - 3, GLASS.high + 3, P.windowFrame);
  for (let column = 0; column < width; column++) for (let gz = 0; gz < GLASS.high - GLASS.low; gz++) {
    wallDot(context, 'back', Math.round(from * 8) + column, GLASS.low + gz, seaView(view, column, gz, width, lighting, item.fromX));
  }
  // the panes' mullions and bars, and a shine on a few of them
  for (let column = 6; column < width - 2; column += 6) for (let z = GLASS.low; z < GLASS.high; z++) wallDot(context, 'back', Math.round(from * 8) + column, z, P.windowFrame);
  for (const z of [22, 29]) for (let column = 0; column < width; column++) wallDot(context, 'back', Math.round(from * 8) + column, z, P.windowFrame);
  for (let column = 1; column < width; column += 12) for (let step = 0; step < 3; step++) {
    context.globalAlpha = 0.3;
    wallDot(context, 'back', Math.round(from * 8) + column + step, 32 + step, P.glint);
    context.globalAlpha = 1;
  }
  // the cornice: a carved band and its gilded line, the sill below
  wallQuad(context, 'back', from - 0.4, to + 0.4, GLASS.high + 3, GLASS.high + 6, P.rib);
  wallQuad(context, 'back', from - 0.4, to + 0.4, GLASS.high + 3, GLASS.high + 4, P.brass);
  wallQuad(context, 'back', from - 0.4, to + 0.4, GLASS.high + 6, GLASS.high + 7, P.ribLight);
  for (let along = from - 0.2; along < to + 0.3; along += 0.5) dot(context, onWallAt('back', along, GLASS.high + 5), P.brassDark);
  wallQuad(context, 'back', from - 0.35, to + 0.35, GLASS.low - 4, GLASS.low - 2, P.windowSill);
  wallQuad(context, 'back', from - 0.35, to + 0.35, GLASS.low - 2, GLASS.low - 1, tones(P.windowSill).light);
}

/* The wheel and the map */

/** The ship's wheel as the clock: eight spokes with their handles, a rim, a brass hub with the hours' face. */
function paintWheel(context: Context, item: WallItem, hour: number) {
  const center = item.fromX + item.width / 2, z = 30;
  const at = (across: number, up: number) => onWallAt('back', center + across / 8, z + up);
  const wood: { across: number; up: number; colour: string }[] = [];
  for (let spoke = 0; spoke < 8; spoke++) {
    const angle = (spoke / 8) * Math.PI * 2 + Math.PI / 8;
    for (let reach = 3; reach <= 10; reach += 0.5) wood.push({ across: Math.round(Math.cos(angle) * reach), up: Math.round(Math.sin(angle) * reach), colour: reach > 8.2 ? P.wheelLight : P.wheel });
  }
  for (let up = -8; up <= 8; up++) for (let across = -8; across <= 8; across++) {
    const distance = Math.hypot(across, up);
    if (distance <= 7.6 && distance >= 6.2) wood.push({ across, up, colour: across + up > 4 ? tones(P.wheel).shade : P.wheelLight });
  }
  // a dark line around the wood, so the wheel stands out from the planks
  for (const { across, up } of wood) for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(context, at(across + x, up + y), P.keel);
  for (const { across, up, colour } of wood) dot(context, at(across, up), colour);
  for (let up = -5; up <= 5; up++) for (let across = -5; across <= 5; across++) {
    const distance = Math.hypot(across, up);
    if (distance > 4.6) continue;
    dot(context, at(across, up), distance > 4 ? P.keel : distance > 3.1 ? P.brass : P.clock);
  }
  const hand = (turns: number, length: number) => {
    for (let step = 0; step <= length; step += 0.5) dot(context, at(Math.sin(turns * Math.PI * 2) * step, Math.cos(turns * Math.PI * 2) * step), P.clockHands);
  };
  hand((hour % 12) / 12, 2);
  hand(hour % 1, 3);
}

/** The lounge's screen as a great treasure map in a frame: islands, a compass rose, the route (it moves, see pirate-effects.ts). */
function paintTreasureMap(context: Context, item: WallItem) {
  const from = item.fromX, to = item.fromX + item.width;
  wallQuad(context, 'back', from - 0.2, to + 0.2, MAP.low - 2, MAP.high + 2, P.tvFrame);
  wallQuad(context, 'back', from - 0.08, to + 0.08, MAP.low - 1, MAP.high + 1, P.brassDark);
  const width = Math.round(item.width * 8), height = MAP.high - MAP.low;
  const left = Math.round(from * 8);
  const islands = [[0.22, 0.6, 5, 4], [0.62, 0.35, 7, 5], [0.85, 0.75, 4, 3]] as const;
  for (let column = 0; column < width; column++) for (let z = 0; z < height; z++) {
    const edge = column === 0 || z === 0 || column === width - 1 || z === height - 1;
    let colour = edge ? P.parchmentBurnt : pick(`tvmap${column},${z}`, 15) === 0 ? P.parchmentDark : P.parchment;
    for (const [x, y, rx, ry] of islands) {
      const distance = Math.hypot((column - x * width) / rx, (z - y * height) / ry) + Math.sin(column * 1.3 + z * 0.7) * 0.1;
      if (distance < 1) colour = distance > 0.8 ? P.ink : P.mapLand;
      else if (distance < 1.35 && !edge && (column + z) % 3 === 0) colour = P.inkFaint;
    }
    wallDot(context, 'back', left + column, MAP.low + z, colour);
  }
  // a compass rose in the bottom left corner
  const rose = { x: left + 6, z: MAP.low + 6 };
  for (let reach = -4; reach <= 4; reach++) {
    wallDot(context, 'back', rose.x + reach, rose.z, P.ink);
    wallDot(context, 'back', rose.x, rose.z + reach, reach > 0 ? P.cross : P.ink);
  }
  for (const [across, up] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) wallDot(context, 'back', rose.x + across, rose.z + up, P.ink);
  // a sea serpent's humps on the open water, top left
  for (const hump of [0, 4, 8]) for (const [across, up] of [[0, 0], [1, 1], [2, 1], [3, 0]] as const) wallDot(context, 'back', left + 4 + hump + across, MAP.high - 6 + up, P.ink);
}

export const PIRATE: ThemeKit = {
  structure: P,
  paintWalls: paintHullInside,
  paintFloor: paintDeckFloor,
  rugs: false,
  paintSlab: paintHull,
  paintDoor: paintCabinDoor,
  paintWindow: (context, item, lighting, index, count) => paintSternWindow(context, item, lighting, viewOf(index, count)),
  paintClock: paintWheel,
  paintTv: paintTreasureMap,
  paintSky: paintSeaAndSky,
  paintSkyMotion: paintSeaMotion,
  // the gulls flap their wings
  skyFrameMs: 250,
  furniture: PIRATE_FURNITURE,
  lights: pirateLights,
  // its own lanterns and fires instead of the office's lamps (pirate-effects.ts)
  officeLamps: false,
  effects: pirateEffects,
  screenLight: F.lightLantern,
  doorLight: F.lightLantern,
};
