// The teleporter as each theme dresses it: its frame (a piece of the theme's furniture, pixel-furniture.ts for the
// painter) and its light (kit.ts, PortalStyle): what turns in its ring, what comes out of it, what glows on its frame.
// The ring keeps its size and place in every theme, and its inside stays free for the vortex (draw.ts, portalEffects).
import { BEACH_PORTAL as B } from '../../design/theme-beach.ts';
import { CELLAR_PORTAL as C } from '../../design/theme-cellar.ts';
import { DUNGEON_PORTAL as D } from '../../design/theme-dungeon.ts';
import { FOREST_PORTAL as F } from '../../design/theme-forest.ts';
import { PIRATE_PORTAL as P } from '../../design/theme-pirate.ts';
import { SPACE_PORTAL as S } from '../../design/theme-space.ts';
import { TOKYO_PORTAL as T } from '../../design/theme-tokyo.ts';
import type { FurniturePiece } from '../../../shared/room-layout.ts';
import type { Point } from '../geometry.ts';
import { ART_SCALE } from '../pixel-art.ts';
import { portalFace, portalPainter, ringAngles, type Design, type Painter, type PortalPainter } from '../pixel-furniture.ts';
import { PORTAL, PORTAL_HEIGHT, SPARK_SOURCE } from '../portal.ts';
import { pick } from '../sky.ts';
import type { Context } from '../wall-art.ts';
import { fire } from './dungeon-effects.ts';
import type { PortalStyle } from './kit.ts';

/** Half the plinth's length along the ring, and how far its face is from the ring's plane, in art pixels and tiles. */
const extent = (piece: FurniturePiece) => ({ half: (piece.turned ? piece.depth : piece.width) * 4, face: portalFace(piece) });
const BACK = -PORTAL.plane;
/** The height of the ring's middle above the floor, and its top. */
const MIDDLE = PORTAL.plinth + PORTAL.up;
const TOP = MIDDLE + PORTAL.up;
const TURN = Math.PI * 2;
const wrap = (angle: number) => ((angle % TURN) + TURN) % TURN;

/** Where a point of the ring is, `shrink` art pixels inside its outer edge: across and up from its middle. */
const onEdge = (shrink: number, angle: number) => ({ across: Math.cos(angle) * (PORTAL.across - shrink), up: Math.sin(angle) * (PORTAL.up - shrink) });

/** A square of light on the grid of art pixels. */
function glow(context: Context, point: Point, colour: string, alpha = 1) {
  context.globalAlpha = Math.max(0, Math.min(1, alpha));
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x / ART_SCALE) * ART_SCALE, Math.round(point.y / ART_SCALE) * ART_SCALE, ART_SCALE, ART_SCALE);
}

/**
 * The ring's band from `outer` to `inner` art pixels inside its edge: its back in `back` first, then its face in the
 * colour given for each pixel (none: nothing there), so that no back pixel lands over a face pixel next to it.
 */
function band(portal: PortalPainter, outer: number, inner: number, back: string, colour: (shrink: number, angle: number) => string | null, steps = 300) {
  const angles = ringAngles(steps);
  for (const out of [-0.08, 0]) for (const angle of angles) for (let shrink = outer; shrink <= inner; shrink++) {
    const face = colour(shrink, angle);
    if (face) portal.ring(shrink, angle, out, out === 0 ? face : back);
  }
}

/** One letter a pixel, upright in the ring's plane, `out` tiles before it: its bottom row at `z`, centred on `across`. */
function sprite(portal: PortalPainter, rows: readonly string[], colours: Readonly<Record<string, string>>, across: number, out: number, z: number) {
  const half = Math.floor(rows[0].length / 2);
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
    const colour = colours[letter];
    if (colour) portal.pixel(across + column - half, out, z + rows.length - 1 - line, colour);
  });
}

/* The dungeon: an arch of stone blocks, a keystone with a rune, moss and ivy, two torches; leaves falling */

const BLOCKS = 14;
/** How wide a joint between two blocks (or plates, or bamboo nodes) is, as an angle round the ring: about an art pixel. */
const JOINT = 0.07;
/** The keystone's half width, as an angle round the ring. */
const KEYSTONE = 0.17;
const RUNE = [[0, 0], [0, 1], [0, 2], [-1, 1], [1, 1], [-1, 3], [1, 3]] as const;
const IVY = [[0.66, 9], [0.8, 6], [0.27, 7], [0.13, 5]] as const;

function paintDungeonPortal(p: Painter, piece: FurniturePiece) {
  const portal = portalPainter(p, piece);
  const { half, face } = extent(piece);
  portal.box(-half + 0.5, half - 0.5, BACK, face, 0, 2, D.stones[1], D.stoneLight);
  portal.box(-half + 3, half - 3, BACK + 0.04, face - 0.04, 2, 2, D.stones[0], D.stoneLight);
  // the blocks of the arch, a line of mortar between them, their outer edge lit at the top; the keystone stands out
  const steps = 360;
  band(portal, -4, 2, D.mortar, (shrink, angle) => {
    const share = (angle / TURN) * BLOCKS;
    const block = Math.floor(share);
    const fromKey = Math.abs(angle - Math.PI / 2);
    if (fromKey <= KEYSTONE) return KEYSTONE - fromKey < JOINT ? D.mortar : shrink === -4 ? D.stoneLight : D.keystone;
    if (shrink < -2) return null;
    if (share - block < JOINT * BLOCKS / TURN) return D.mortar;
    return shrink === -2 && Math.sin(angle) > 0.2 ? D.stoneLight : D.stones[block % D.stones.length];
  }, steps);
  // the rune carved in the keystone, dark until it glows (dungeonFrame)
  for (const [across, up] of RUNE) portal.pixel(across, 0.01, TOP + 1 + up, D.mortar);
  // moss on the top of the arch and in the joints at its foot
  for (const angle of ringAngles(120)) {
    const growth = pick(`moss${angle.toFixed(3)}`, 9);
    if (Math.sin(angle) > 0.35 && growth < 4) portal.ring(-3, angle, 0.01, D.moss[growth % D.moss.length]);
    if (Math.sin(angle) > 0.6 && growth < 2) portal.ring(-2, angle, 0.02, D.moss[(growth + 1) % D.moss.length]);
    if (Math.sin(angle) < -0.5 && growth < 3) portal.ring(1, angle, 0.02, D.moss[growth % D.moss.length]);
  }
  // ivy hanging from the arch: a stem, a leaf on one side then the other
  for (const [turn, length] of IVY) {
    const start = onEdge(-2, turn * Math.PI);
    const z = MIDDLE + start.up;
    for (let down = 0; down < length; down++) {
      const across = Math.round(start.across) + (down % 4 === 3 ? Math.sign(start.across) : 0);
      portal.pixel(across, 0.03, z - down, D.ivy[2]);
      if (down % 2) portal.pixel(across + (down % 4 === 1 ? 1 : -1), 0.03, z - down, D.ivy[down % 3 === 0 ? 1 : 0]);
    }
  }
  // the torches' posts at both ends of the plinth, before the arch, and their iron cups
  for (const side of [-1, 1]) {
    portal.box(side * 12 - 0.8, side * 12 + 0.8, face - 0.14, face - 0.04, 2, 9, D.torch);
    portal.box(side * 12 - 1.6, side * 12 + 1.6, face - 0.17, face - 0.01, 11, 2, D.sconce);
  }
}

const DUNGEON_STYLE: PortalStyle = {
  vortex: 'spiral', tones: D.vortex, light: D.light, core: D.core, particles: 'leaves', colours: D.leaves,
  frame(context, at, time) {
    for (const side of [-1, 1]) {
      const base = at(side * 12, 13 - MIDDLE, 0.12);
      fire(context, { x: Math.round(base.x / ART_SCALE) * ART_SCALE, y: Math.round(base.y / ART_SCALE) * ART_SCALE }, 1, 5, time, side * 7);
    }
    const pulse = 0.55 + 0.45 * Math.sin(time / 650);
    for (const [across, up] of RUNE) glow(context, at(across, PORTAL.up + 1 + up, 0.02), up === 1 && across === 0 ? D.runeCore : D.rune, pulse);
  },
};

/* The forest: two branches twisted into a ring on a mossy stump, leaves and flowers, glowing mushrooms; fireflies */

const LEAF_CLUSTERS = [0.12, 0.3, 0.44, 0.62, 0.86, 1.08, 1.82] as const;
const FOREST_FLOWERS = [0.52, 0.74] as const;
/** The glowing mushrooms at the ring's foot: across, and how tall their stem. */
const MUSHROOMS = [[-9, 3], [-6.5, 1], [9, 2]] as const;
const CAP = ['.ccc.', 'ccccc', '..s..'];

function paintForestPortal(p: Painter, piece: FurniturePiece) {
  const portal = portalPainter(p, piece);
  const { half, face } = extent(piece);
  // the stump: its bark down the front, its cut top with rings, moss over its edge, roots on the floor
  portal.box(-half + 1, half - 1, BACK, face, 0, PORTAL.plinth, F.stump, F.stumpTop);
  for (let across = -half + 2; across < half - 1; across += 3) for (let z = 0; z < PORTAL.plinth; z++) portal.pixel(across, face, z, F.barkDark);
  for (let across = -half + 2; across < half - 1; across++) {
    const growth = pick(`stump${across}`, 6);
    if (growth < 3) portal.pixel(across, face, PORTAL.plinth - 1, F.moss[growth]);
    if (growth === 4) portal.pixel(across, face - 0.12, PORTAL.plinth, F.ring);
  }
  for (const side of [-1, 1]) for (let reach = 0; reach < 4; reach++) portal.pixel(side * (half - 1 + reach), face - 0.05 + reach * 0.04, 0, F.barkDark);
  // the two branches twisting round each other, a groove between them
  band(portal, -2, 2, F.barkDark, (shrink, angle) => {
    const twist = Math.sin(angle * 9 + shrink * 0.8);
    return Math.abs(twist) < 0.25 ? F.barkDark : twist > 0 ? F.barkLight : F.bark;
  });
  // tufts of leaves growing out of it, and two flowers
  for (const [index, turn] of LEAF_CLUSTERS.entries()) {
    const angle = turn * Math.PI;
    for (const [shrink, shift] of [[-3, 0], [-4, 0.05], [-3, 0.1], [-4, -0.06], [-5, 0.02], [-2, 0.12]] as const) portal.ring(shrink, angle + shift, 0.02, F.leaves[(index + Math.round(shift * 50)) % F.leaves.length]);
  }
  for (const turn of FOREST_FLOWERS) {
    const { across, up } = onEdge(-3, turn * Math.PI);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, 1], [0, -1]] as const) portal.pixel(Math.round(across) + dx, 0.03, Math.round(MIDDLE + up) + dz, F.flower);
    portal.pixel(Math.round(across), 0.03, Math.round(MIDDLE + up), F.flowerHeart);
  }
  for (const [across, stem] of MUSHROOMS) sprite(portal, [...CAP.slice(0, 2), ...Array.from({ length: stem }, () => CAP[2])], { c: F.capDark, s: F.stumpTop }, across, face - 0.06, PORTAL.plinth);
}

const FOREST_STYLE: PortalStyle = {
  vortex: 'spiral', tones: F.vortex, light: F.light, core: F.core, particles: 'fireflies', colours: F.fireflies,
  frame(context, at, time) {
    for (const [index, [across, stem]] of MUSHROOMS.entries()) {
      const pulse = 0.55 + 0.45 * Math.sin(time / 900 + index * 2);
      const cap = PORTAL.plinth + stem - MIDDLE;
      for (let dx = -2; dx <= 2; dx++) glow(context, at(across + dx, cap + 1, 0.22), Math.abs(dx) < 2 ? F.cap : F.capDark, pulse);
      for (let dx = -1; dx <= 1; dx++) glow(context, at(across + dx, cap + 2, 0.22), dx ? F.cap : F.capGlow, pulse);
    }
  },
};

/* Tokyo: a vermilion torii round a ring of pink neon; cherry petals falling */

const PILLAR = 12.5;

function paintTokyoPortal(p: Painter, piece: FurniturePiece) {
  const portal = portalPainter(p, piece);
  const { half, face } = extent(piece);
  portal.box(-half + 1, half - 1, BACK, face, 0, 2, T.step, T.stepTop);
  portal.box(-half + 3, half - 3, BACK + 0.04, face - 0.04, 2, 2, T.step, T.stepTop);
  // the pillars on their black feet, the tie beam, the lintel curving up at both ends, the plaque between them
  for (const side of [-1, 1]) {
    portal.box(side * PILLAR - 2, side * PILLAR + 2, -0.1, 0.1, 0, 3, T.foot);
    portal.box(side * PILLAR - 1.5, side * PILLAR + 1.5, -0.08, 0.08, 3, 33, T.pillar, T.pillarLight);
  }
  portal.box(-15, 15, -0.06, 0.06, TOP + 1.5, 2, T.pillar, T.pillarLight);
  portal.box(-15.5, 15.5, -0.08, 0.08, TOP + 5, 1.5, T.pillar, T.pillarLight);
  portal.box(-16.5, 16.5, -0.1, 0.1, TOP + 6.5, 1.5, T.lintel, T.lintelTop);
  for (const side of [-1, 1]) for (const [across, z] of [[17, 8], [17, 9], [16, 8.5]] as const) portal.box(side * across - 0.5, side * across + 0.5, -0.1, 0.1, TOP + z - 0.5, 1, T.lintel, T.lintelTop);
  portal.box(-2, 2, 0.08, 0.14, TOP + 2, 4, T.plaque);
  for (const z of [TOP + 2, TOP + 5.5]) for (let across = -2; across <= 2; across++) portal.pixel(across, 0.15, z, T.plaqueRim);
  // the ring: a dark housing round a tube of neon, unlit until tokyoFrame lights it
  band(portal, 0, PORTAL.band - 1, T.housing, (shrink) => (shrink === 1 ? T.tubeOff : T.housing));
}

const TOKYO_STYLE: PortalStyle = {
  vortex: 'tunnel', tones: T.vortex, light: T.light, core: T.core, particles: 'leaves', colours: T.petals,
  frame(context, at, time) {
    // the tube flickers now and then, and a stretch of it stays dimmer
    const flicker = Math.floor(time / 90) % 41 === 0 || Math.floor(time / 90) % 41 === 2 ? 0.25 : 1;
    for (const angle of ringAngles(160)) {
      const tired = wrap(angle - 4.1) < 0.5 && Math.floor(time / 140) % 9 === 0 ? 0.4 : 1;
      const tube = onEdge(1, angle);
      glow(context, at(tube.across, tube.up, 0.01), T.tube, flicker * tired);
      if (Math.sin(angle) > 0.5) glow(context, at(tube.across, tube.up, 0.01), T.tubeCore, flicker * tired * 0.5);
      for (const shrink of [0, 2]) { const halo = onEdge(shrink, angle); glow(context, at(halo.across, halo.up, 0.01), T.tube, 0.3 * flicker); }
    }
  },
};

/* The shuttle: an airlock ring of hull plates with clamps, a chasing light and beacons; stars */

const CLAMPS = [0.25, 0.75, 1, 0, 0.5, 1.25, 1.75].map((turn) => turn * Math.PI);
const PLATES = 12;

function paintSpacePortal(p: Painter, piece: FurniturePiece) {
  const portal = portalPainter(p, piece);
  const { half, face } = extent(piece);
  portal.box(-half + 0.5, half - 0.5, BACK, face, 0, 2, S.hull, S.hullLight);
  portal.box(-half + 3, half - 3, BACK + 0.04, face - 0.04, 2, 2, S.hull, S.hullLight);
  // the stripes of danger along the plinth's front
  for (let across = -half + 1; across < half - 0.5; across++) for (let z = 0; z < 2; z++) portal.pixel(across, face, z, Math.floor((across + z + 40) / 2) % 2 ? S.hazard : S.hazardDark);
  // the plates of the ring, a seam between them, their bevel lit at the top and in shade inside; its light strip
  band(portal, -1, 2, S.hullDark, (shrink, angle) => {
    const share = (angle / TURN) * PLATES;
    if (shrink === 2) return S.ledOff;
    if (share - Math.floor(share) < JOINT * PLATES / TURN) return S.seam;
    return shrink === -1 && Math.sin(angle) > 0.2 ? S.hullLight : shrink === 1 ? S.hullDark : S.hull;
  });
  // the clamps holding it, standing out of the ring
  for (const angle of CLAMPS) for (const turn of [-0.12, -0.08, -0.04, 0, 0.04, 0.08, 0.12]) for (const shrink of [-2, -3, -4]) {
    if (shrink === -4 && Math.abs(turn) > 0.05) continue;
    portal.ring(shrink, angle + turn, 0.01, shrink < -2 && Math.abs(turn) < 0.1 ? S.clampLight : S.clamp);
  }
}

const SPACE_STYLE: PortalStyle = {
  vortex: 'warp', tones: S.vortex, light: S.light, core: S.core, particles: 'stars', colours: S.stars,
  frame(context, at, time) {
    // a light running round the strip, a fading tail behind it
    const head = (time / 900) % 1;
    for (const angle of ringAngles(150)) {
      const behind = wrap((head * TURN) - angle) / TURN;
      if (behind > 0.3) continue;
      const strip = onEdge(2, angle);
      glow(context, at(strip.across, strip.up, 0.01), behind < 0.03 ? S.ledCore : S.led, 1 - behind / 0.3);
    }
    // a beacon on each clamp, red and green in turn
    const beat = Math.floor(time / 700) % 2;
    for (const [index, angle] of CLAMPS.entries()) {
      const beacon = onEdge(-3, angle);
      glow(context, at(beacon.across, beacon.up, 0.02), (index + beat) % 2 ? S.beaconRed : S.beaconGreen, 0.9);
    }
  },
};

/* The beach: a hoop of bamboo lashed with rope on a mound of sand, a garland of hibiscus, a palm frond; bubbles */

const STARFISH = ['..o..', 'ooooo', '.ooo.', '.o.o.'];
const LASHINGS = [0, 1, 1.3, 1.7].map((turn) => turn * Math.PI);
const FROND = [[-6, 31], [-8, 32], [-10, 32], [-12, 31], [-14, 30], [-15, 28], [-16, 26]] as const;

function paintBeachPortal(p: Painter, piece: FurniturePiece) {
  const portal = portalPainter(p, piece);
  const { half, face } = extent(piece);
  // the sand heaped under the hoop, a little more in the middle, shells in it, a starfish against the hoop
  portal.box(-half + 0.5, half - 0.5, BACK, face, 0, 2, B.sand, B.sandLight);
  portal.box(-half + 3.5, half - 3.5, BACK + 0.03, face - 0.03, 2, 2, B.sand, B.sandLight);
  for (let across = -half + 1; across < half; across++) {
    const grain = pick(`sand${across}`, 8);
    if (grain < 2) portal.pixel(across, face, 1, B.sandDark);
    if (grain === 3) portal.pixel(across, face - 0.1, 2, B.shells[across % 2 ? 0 : 1]);
  }
  // the bamboo: lit along its top, ringed at its nodes
  band(portal, -1, 2, B.bambooNode, (shrink, angle) => {
    const share = (angle / TURN) * 13;
    if (share - Math.floor(share) < JOINT * 13 / TURN) return B.bambooNode;
    return shrink === -1 && Math.sin(angle) > -0.2 ? B.bambooLight : B.bamboo;
  });
  // the rope lashings, crossing over the bamboo
  for (const angle of LASHINGS) for (let shrink = -1; shrink <= 2; shrink++) for (const turn of [-0.05, 0.05]) portal.ring(shrink, angle + turn * (shrink % 2 ? 1 : -1), 0.02, B.rope);
  // the palm frond over the top left, its leaflets hanging down
  for (const [index, [across, z]] of FROND.entries()) {
    portal.pixel(across, 0.03, z, B.frond[1]);
    for (let down = 1; down <= 1 + (index % 3); down++) portal.pixel(across - (down > 1 ? 1 : 0), 0.03, z - down, B.frond[(index + down) % B.frond.length]);
  }
  // the garland of hibiscus round its top, a leaf between two flowers
  for (let index = 0; index < 6; index++) {
    const angle = (0.2 + index * 0.12) * Math.PI;
    const { across, up } = onEdge(-2, angle);
    const [x, z] = [Math.round(across), Math.round(MIDDLE + up)];
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, 1], [0, -1], [1, 1]] as const) portal.pixel(x + dx, 0.04, z + dz, B.flowers[index % B.flowers.length]);
    portal.pixel(x, 0.04, z, B.flowerHeart);
    const leaf = onEdge(-1, angle + 0.06 * Math.PI);
    portal.pixel(Math.round(leaf.across), 0.03, Math.round(MIDDLE + leaf.up), B.frond[0]);
  }
  sprite(portal, STARFISH, { o: B.starfish }, -9, face - 0.04, 2);
}

const BEACH_STYLE: PortalStyle = { vortex: 'ripple', tones: B.vortex, light: B.light, core: B.core, particles: 'bubbles', colours: B.bubbles };

/* The galleon: a ship's wheel with its handles and brass studs, on the deck with a coil of rope; spray */

const SPOKES = Array.from({ length: 8 }, (_, index) => (index + 0.5) * (TURN / 8));
const COIL = ['.rrrr.', 'rsssr.', 'rrrrrr', 'srrrrs'];

function paintPiratePortal(p: Painter, piece: FurniturePiece) {
  const portal = portalPainter(p, piece);
  const { half, face } = extent(piece);
  portal.box(-half + 0.5, half - 0.5, BACK, face, 0, 3, P.deck, P.deckTop);
  for (let across = -half + 3; across < half; across += 4) for (let z = 0; z < 3; z++) portal.pixel(across, face, z, P.rimDark);
  // the handles of the spokes round the rim (not those that would go through the deck): a shaft, then a knob
  for (const angle of SPOKES) {
    if (Math.sin(angle) < -0.5) continue;
    for (let shrink = -2; shrink >= -6; shrink--) {
      const knob = shrink <= -4;
      for (const turn of knob ? [-0.045, 0, 0.045] : [0]) portal.ring(shrink, angle + turn, 0, knob && turn === 0 && shrink === -5 ? P.handleLight : P.handle);
    }
  }
  // the rim, lit along its top; brass studs where the spokes meet it
  band(portal, -1, 2, P.rimDark, (shrink, angle) => (shrink === -1 && Math.sin(angle) > 0.1 ? P.rimLight : shrink === 2 ? P.rimDark : P.rim));
  for (const angle of SPOKES) for (const shrink of [0, 1]) portal.ring(shrink, angle, 0.02, P.brass);
  sprite(portal, COIL, { r: P.rope, s: P.ropeShade }, 10, face - 0.06, 3);
}

const PIRATE_STYLE: PortalStyle = {
  vortex: 'spiral', tones: P.vortex, light: P.light, core: P.core, particles: 'spray', colours: P.spray,
  frame(context, at, time) {
    // a glint passing from one brass stud to the next
    const stud = SPOKES[Math.floor(time / 450) % SPOKES.length];
    const shine = Math.sin(((time % 450) / 450) * Math.PI);
    const { across, up } = onEdge(0.5, stud);
    glow(context, at(across, up, 0.03), P.brassLight, shine);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1]] as const) glow(context, at(across + dx, up + dy, 0.03), P.brassLight, shine * 0.45);
  },
};

/* The cellar: a ring of steel pipe wrapped in cables and tape, blinking diodes, on a steel case; sparks */

const TAPES = [0.3, 1.15, 1.72].map((turn) => turn * Math.PI);
const DIODES = [[-7, 0], [-5, 1], [-3, 2]] as const;
const RING_DIODES = [0.9, 1.35, 1.6, 0.05].map((turn) => turn * Math.PI);
/** The frayed cable: from the ring's edge out to its bare end, where the sparks come from (SPARK_SOURCE). */
const CABLE = [[7, 12], [8, 12], [9, 11], [10, 11], [10, 10]] as const;

function paintCellarPortal(p: Painter, piece: FurniturePiece) {
  const portal = portalPainter(p, piece);
  const { half, face } = extent(piece);
  portal.box(-half + 1, half - 1, BACK, face, 0, PORTAL.plinth, C.case, C.caseTop);
  for (const z of [1, 2]) for (let across = -half + 3; across < -1; across++) if (across % 2) portal.pixel(across, face, z, C.vent);
  for (const [across, z] of DIODES) portal.pixel(across + 12, face, z + 0.5, C.steelDark);
  // the pipe, lit along its top and in shade inside, patches of rust
  band(portal, -1, 2, C.steelDark, (shrink, angle) => {
    if (pick(`rust${Math.round(angle * 12)}`, 9) === 0) return C.rust;
    return shrink === -1 && Math.sin(angle) > 0.1 ? C.steelLight : shrink === 2 ? C.steelDark : C.steel;
  });
  // two cables wound round its lower half
  for (const angle of ringAngles(360)) for (let shrink = -1; shrink <= 2; shrink++) for (const [index, cable] of C.cables.slice(1).entries()) {
    if (Math.sin(angle) < 0.3 && wrap(angle * 7 + shrink * 0.7 + index * 3) < 0.35) portal.ring(shrink, angle, 0.01, cable);
  }
  // tape over them
  for (const angle of TAPES) for (const turn of [-0.08, -0.04, 0, 0.04, 0.08]) for (let shrink = -1; shrink <= 2; shrink++) {
    portal.ring(shrink, angle + turn, 0.02, turn === -0.04 ? C.tapeLight : C.tape);
  }
  for (const angle of RING_DIODES) portal.ring(0, angle, 0.03, C.steelDark);
  // the frayed cable, its copper strands bare at the end
  for (const [across, up] of CABLE) for (const thick of [0, 1]) portal.pixel(across, 0.04, MIDDLE + up - thick, C.cables[2]);
  for (const [across, up] of [[SPARK_SOURCE.across, SPARK_SOURCE.up], [SPARK_SOURCE.across - 1, SPARK_SOURCE.up]] as const) portal.pixel(across, 0.04, MIDDLE + up, C.copper);
}

const CELLAR_STYLE: PortalStyle = {
  vortex: 'rain', tones: C.vortex, light: C.light, core: C.core, particles: 'sparks', colours: C.sparks,
  frame(context, at, time) {
    const beat = Math.floor(time / 260);
    const colours = [C.ledGreen, C.ledAmber, C.ledRed];
    for (const [index, [across, z]] of DIODES.entries()) {
      if ((beat + index * 3) % 5 < 3) glow(context, at(across + 12, z + 0.5 - MIDDLE, 0.29), colours[index]);
    }
    for (const [index, angle] of RING_DIODES.entries()) {
      if ((beat * (index + 1)) % 7 < 4) { const { across, up } = onEdge(0, angle); glow(context, at(across, up, 0.04), index % 2 ? C.ledRed : C.ledGreen); }
    }
  },
};

/** Each theme's teleporter: its frame (the height its canvas needs, over the ring's top) and its light. */
const frame = (paint: (p: Painter, piece: FurniturePiece) => void, height = PORTAL_HEIGHT): Design => ({ height, paint });
export const THEME_PORTALS = {
  dungeon: { design: frame(paintDungeonPortal, TOP + 7), style: DUNGEON_STYLE },
  forest: { design: frame(paintForestPortal, TOP + 6), style: FOREST_STYLE },
  tokyo: { design: frame(paintTokyoPortal, TOP + 11), style: TOKYO_STYLE },
  space: { design: frame(paintSpacePortal, TOP + 5), style: SPACE_STYLE },
  beach: { design: frame(paintBeachPortal, TOP + 6), style: BEACH_STYLE },
  pirate: { design: frame(paintPiratePortal, TOP + 8), style: PIRATE_STYLE },
  cellar: { design: frame(paintCellarPortal, TOP + 5), style: CELLAR_STYLE },
} as const;
