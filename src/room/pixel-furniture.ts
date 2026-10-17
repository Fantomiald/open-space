// The office's furniture in pixel art: each piece is a few boxes on the isometric grid (a lit top and the two faces
// turned to the viewer), with its details, drawn once at art resolution on its own canvas, outlined, and kept.
import { ROOM_PALETTE } from '../design/room-palette.ts';
import type { FurniturePiece } from '../../shared/room-layout.ts';
import { toScreen, type Point } from './geometry.ts';
import { ART_SCALE, artCanvas, fillPolygon, outline, shadedBall, tones } from './pixel-art.ts';

const C = ROOM_PALETTE.furniture;
const H = ROOM_PALETTE.halloween;
const F = ROOM_PALETTE.festive;
/** Art pixels of one tile along x (right and down) and y (left and down). */
const TILE = { x: 8, y: 4 };
const MARGIN = 3;

interface Painter {
  /** a box from (x, y) to (x + width, y + depth) in tiles, from `z` to `z + height` in art pixels */
  box(x: number, y: number, width: number, depth: number, z: number, height: number, colour: string, top?: string): void;
  /** a flat shape on the +y face (the one turned to the bottom left) of the plane y = `y` */
  onFront(y: number, fromX: number, toX: number, fromZ: number, toZ: number, colour: string): void;
  /** a shaded ball centred above a floor point */
  ball(x: number, y: number, z: number, radiusX: number, radiusY: number, colour: string): void;
  /** a soft shadow on the floor around a point (too faint to be outlined) */
  shadow(x: number, y: number, radiusX: number, radiusY: number): void;
  pixel(x: number, y: number, z: number, colour: string): void;
  /** a pixel `across` art pixels right of the middle of the footprint (left when negative), `z` up: for upright shapes */
  upright(across: number, z: number, colour: string, middle?: { x: number; y: number }): void;
}

/** `fine`: thin details painted after the outline, so they stay one pixel wide (strings). */
interface Design { height: number; paint: (paint: Painter, piece: FurniturePiece) => void; fine?: (paint: Painter, piece: FurniturePiece) => void }

/** Where a prop stands on its desk or table, by footprint: the user's desk is three tiles wide, the others two. */
function propSpot(piece: FurniturePiece) {
  if (piece.width === 3) return { x: 0.55, y: 0.55 };
  return piece.top === 11 ? { x: 1.45, y: 0.3 } : { x: 1.35, y: 0.5 };
}

/** A gift box with a ribbon across its top and down its two visible faces. */
function gift(p: Painter, x: number, y: number, size: number, height: number, z: number, colour: string) {
  p.box(x, y, size, size, z, height, colour);
  p.box(x + size / 2 - 0.04, y, 0.08, size, z + height, 0.5, F.gold);
  p.box(x, y + size / 2 - 0.04, size, 0.08, z + height, 0.5, F.gold);
  p.onFront(y + size, x + size / 2 - 0.04, x + size / 2 + 0.04, z, z + height, F.gold);
  p.pixel(x + size / 2 - 0.06, y + size / 2, z + height + 1.5, F.gold);
  p.pixel(x + size / 2 + 0.06, y + size / 2, z + height + 1.5, F.gold);
}

/** Candles on a cake: thin sticks and their flames (they flicker in the light, see festivals.ts). */
function candles(p: Painter, middle: { x: number; y: number }, z: number, count: number) {
  for (let index = 0; index < count; index++) {
    const across = (index - (count - 1) / 2) * 3;
    for (let up = 0; up < 3; up++) p.upright(across, z + up, F.candle, middle);
    p.upright(across, z + 3, F.flame, middle);
  }
}

/** Two eyes, a nose and a toothy grin, one letter a pixel. */
const PUMPKIN_FACE = [
  '.k.....k.',
  'kkk...kkk',
  '....k....',
  'k.......k',
  '.kkkkkkk.',
  '..k.k.k..',
];

/** A short woody stalk curling to the right, and a leaf at its foot; its last row sinks into the top of the pumpkin. */
const PUMPKIN_STALK = [
  '...hs',
  '..hs.',
  '..hs.',
  'llhs.',
  '.lss.',
];

/** An egg, standing: one letter a pixel (l lit, o its colour, s shaded). */
const EGG = [
  '.loo.',
  'looos',
  'looos',
  'ooooo',
  'looos',
  'looos',
  '.oos.',
];

/** The balloons of a bunch: how far right of its weight, how high, and their colour. */
const BALLOON_BUNCH = [[-5, 52, 0], [4, 56, 1], [-1, 62, 2], [6, 64, 3], [-7, 64, 4]] as const;

const DESIGNS: Record<FurniturePiece['kind'], Design> = {
  desk: { height: 22, paint(p) {
    for (const [x, y] of [[0.06, 0.08], [1.84, 0.08], [0.06, 0.82], [1.84, 0.82]]) p.box(x, y, 0.1, 0.1, 0, 9, C.metal);
    p.box(1.25, 0.12, 0.65, 0.7, 2, 7, C.darkWood);
    p.box(0, 0, 2, 0.95, 9, 2, C.wood);
    // a laptop in front of whoever works here (they sit behind the desk's first tile and face +y, down and to the left
    // on screen), low enough for their face to show above its lid; its screen faces them, so from here only its silver
    // back and its logo show, and their hands on the keys are behind it (a screen in use shows by its light, see draw.ts)
    p.box(0.25, 0.2, 0.7, 0.4, 11, 1, C.lightMetal);
    p.box(0.25, 0.55, 0.7, 0.06, 12, 5, C.lightMetal);
    p.onFront(0.61, 0.55, 0.65, 14, 15, C.paper);
    p.box(1.25, 0.45, 0.45, 0.3, 11, 1, C.paper);
    p.box(1.65, 0.2, 0.14, 0.14, 11, 3, C.mug);
  } },
  // the user's desk: a laptop turned to the user (its back to us), a lamp, papers
  bossDesk: { height: 22, paint(p) {
    p.box(0, 0, 3, 0.95, 0, 11, C.boss);
    p.onFront(0.95, 0.1, 2.9, 4, 6, C.bossStripe);
    p.box(1.1, 0.15, 0.8, 0.45, 11, 1, C.lightMetal);
    p.box(1.1, 0.55, 0.8, 0.06, 12, 5, C.monitor);
    p.onFront(0.61, 1.45, 1.55, 14, 15, C.lightMetal);
    p.box(2.3, 0.4, 0.2, 0.2, 11, 4, C.lampShade);
    p.box(0.3, 0.5, 0.5, 0.3, 11, 1, C.paper);
  } },
  chair: { height: 20, paint(p) {
    p.box(0.3, 0.3, 0.4, 0.4, 0, 1, C.metal);
    p.box(0.45, 0.45, 0.1, 0.1, 1, 4, C.metal);
    p.box(0.2, 0.2, 0.6, 0.6, 5, 2, C.chair);
    p.box(0.2, 0.08, 0.6, 0.12, 7, 11, C.chair);
  } },
  // the leaves sit on the pot (the small plant) or on a real trunk (the big one), and both cast a shadow
  plant: { height: 24, paint(p) {
    p.shadow(0.5, 0.5, 6, 3);
    p.box(0.28, 0.28, 0.44, 0.44, 0, 6, C.pot);
    p.box(0.3, 0.3, 0.4, 0.4, 6, 1, C.soil);
    p.ball(0.5, 0.5, 11, 6, 5, C.darkLeaves);
    p.ball(0.38, 0.6, 13, 4, 3.5, C.leaves);
    p.ball(0.62, 0.4, 16, 3, 3, C.leaves);
  } },
  bigPlant: { height: 40, paint(p) {
    p.shadow(0.5, 0.5, 8, 4);
    p.box(0.22, 0.22, 0.56, 0.56, 0, 8, C.pot);
    p.box(0.25, 0.25, 0.5, 0.5, 8, 1, C.soil);
    p.box(0.43, 0.43, 0.14, 0.14, 9, 13, C.trunk);
    p.box(0.36, 0.5, 0.2, 0.08, 15, 2, C.trunk);
    p.ball(0.5, 0.5, 26, 8, 6.5, C.darkLeaves);
    p.ball(0.4, 0.62, 28, 5, 4.5, C.leaves);
    p.ball(0.62, 0.38, 32, 5, 4, C.leaves);
    p.ball(0.5, 0.5, 35, 3, 2.5, C.leaves);
  } },
  bookshelf: { height: 26, paint(p) {
    p.box(0, 0, 2, 0.6, 0, 24, C.darkWood);
    for (const shelf of [8, 16]) p.onFront(0.6, 0.05, 1.95, shelf, shelf + 1, C.wood);
    let index = 0;
    for (const [fromZ, toZ] of [[1, 7], [9, 15], [17, 23]]) {
      for (let x = 0.1; x < 1.85; x += 0.17) {
        const height = toZ - fromZ - ((index * 7) % 3);
        p.onFront(0.6, x, x + 0.13, fromZ, fromZ + height, C.books[index % C.books.length]);
        index++;
      }
    }
  } },
  // against the left wall, facing the room: a dark frame, two seat cushions, two back cushions along the wall, and
  // the far arm (the near one is sofaArm, drawn over whoever sits there)
  sofa: { height: 20, paint(p, { depth }) {
    const dark = tones(C.sofa).dark;
    p.box(0.05, 0, 0.9, depth, 0, 3, dark);
    const seat = (depth - 0.22) / depth;
    for (let index = 0; index < depth; index++) {
      const y = 0.22 + index * seat;
      p.box(0.35, y, 0.6, seat - 0.02, 3, 4, C.sofa);
      p.box(0.08, y, 0.27, seat - 0.02, 3, 10, C.sofa);
    }
    p.box(0.05, 0, 0.9, 0.22, 3, 9, C.sofa);
  } },
  sofaArm: { height: 14, paint(p) {
    p.box(0.05, 0, 0.9, 0.22, 0, 3, tones(C.sofa).dark);
    p.box(0.05, 0, 0.9, 0.22, 3, 9, C.sofa);
  } },
  // facing the viewer, its back on the back wall's side: a dark frame, one cushion per seat, the left arm (the right
  // one is couchArm, drawn after whoever sits at that end)
  couch: { height: 20, paint(p, { width }) {
    const colour = C.couch;
    p.box(0, 0.05, width, 0.9, 0, 3, tones(colour).dark);
    for (let index = 0; index < width; index++) {
      p.box(index + 0.04, 0.08, 0.92, 0.27, 3, 10, colour);
      p.box(index + 0.04, 0.35, 0.92, 0.6, 3, 4, colour);
    }
    p.box(0, 0.05, 0.2, 0.9, 3, 9, colour);
  } },
  couchArm: { height: 14, paint(p) {
    p.box(0, 0.05, 0.2, 0.9, 0, 3, tones(C.couch).dark);
    p.box(0, 0.05, 0.2, 0.9, 3, 9, C.couch);
  } },
  lowTable: { height: 12, paint(p, { width, depth }) {
    for (const [x, y] of [[0.12, 0.12], [width - 0.22, 0.12], [0.12, depth - 0.22], [width - 0.22, depth - 0.22]]) p.box(x, y, 0.1, 0.1, 0, 5, C.darkWood);
    p.box(0.08, 0.08, width - 0.16, depth - 0.16, 5, 2, C.wood);
    p.box(width * 0.3, depth * 0.4, 0.14, 0.14, 7, 3, C.mug);
    p.box(width * 0.55, depth * 0.3, 0.4, 0.3, 7, 1, C.paper);
  } },
  floorLamp: { height: 34, paint(p) {
    p.box(0.3, 0.3, 0.4, 0.4, 0, 1, C.metal);
    p.box(0.46, 0.46, 0.08, 0.08, 1, 22, C.metal);
    p.box(0.25, 0.25, 0.5, 0.5, 23, 7, C.lampShade);
  } },
  // a fir tree on a stump: three tiers, lit from the left, baubles and a star (its lights twinkle, see festivals.ts)
  christmasTree: { height: 64, paint(p) {
    p.shadow(1, 1, 16, 7);
    p.box(0.85, 0.85, 0.3, 0.3, 0, 6, F.trunk);
    const tiers = [[6, 24, 17], [20, 38, 13], [34, 52, 9]] as const;
    for (const [from, to, wide] of tiers) for (let z = from; z <= to; z++) {
      const half = Math.round(1 + (wide - 1) * (to - z) / (to - from));
      for (let across = -half; across <= half; across++) p.upright(across, z, across < -half / 3 ? F.pine : across > half / 2 ? F.pineDark : tones(F.pine).shade);
    }
    // a garland of tinsel winding down, and baubles (the lights that twinkle are drawn every frame, see festivals.ts)
    for (let z = 8; z < 50; z++) { const across = Math.round(Math.sin(z / 3.2) * (16 - z * 0.28)); p.upright(across, z, F.gold); }
    for (const [across, z, colour] of [[-10, 9, F.bulbs[0]], [7, 11, F.bulbs[2]], [-2, 15, F.red], [11, 17, F.bulbs[4]], [-7, 22, F.bulbs[1]], [5, 26, F.red], [-3, 31, F.bulbs[2]], [3, 36, F.red], [-5, 40, F.bulbs[4]], [1, 45, F.bulbs[1]]] as const) {
      for (const [x, z2] of [[0, 0], [1, 0], [0, 1], [1, 1]]) p.upright(across + x, z + z2, colour);
    }
    for (const [across, z] of [[0, 53], [-1, 54], [0, 54], [1, 54], [0, 55], [-2, 54], [2, 54], [0, 56], [-1, 53], [1, 53], [-1, 55], [1, 55]] as const) p.upright(across, z, F.gold);
  } },
  gifts: { height: 16, paint(p) {
    p.shadow(0.5, 0.5, 6, 3);
    gift(p, 0.12, 0.18, 0.42, 7, 0, F.gifts[0]);
    gift(p, 0.55, 0.45, 0.36, 5, 0, F.gifts[1]);
    gift(p, 0.2, 0.62, 0.3, 4, 0, F.gifts[2]);
  } },
  // a table under a pink cloth, a birthday cake on it with its candles, plates and a gift
  partyTable: { height: 34, paint(p) {
    p.box(0, 0.05, 2, 0.9, 0, 10, F.tablecloth);
    for (let x = 0.15; x < 2; x += 0.3) p.onFront(0.95, x, x + 0.04, 1, 9, tones(F.tablecloth).shade);
    const middle = { x: 1, y: 0.5 };
    p.box(0.65, 0.25, 0.7, 0.5, 10, 7, F.cake);
    p.box(0.65, 0.25, 0.7, 0.5, 17, 2, F.icing);
    p.onFront(0.75, 0.7, 1.3, 14, 15, F.icing);
    candles(p, middle, 19, 4);
    for (const x of [0.2, 1.55]) p.box(x, 0.35, 0.3, 0.3, 10, 1, F.plate);
    gift(p, 1.6, 0.15, 0.25, 4, 10, F.gifts[3]);
  } },
  // a bunch of balloons tied to a little weight, floating above heads
  balloons: { height: 76, paint(p) {
    p.box(0.42, 0.42, 0.16, 0.16, 0, 2, F.gold);
    for (const [across, z, colour] of BALLOON_BUNCH) {
      const middle = { x: 0.5 + across / 16, y: 0.5 - across / 16 };
      p.ball(middle.x, middle.y, z, 4.5, 5.5, F.balloons[colour]);
      p.upright(0, z - 6, F.balloons[colour], middle);
    }
  }, fine(p) {
    for (const [across, z] of BALLOON_BUNCH) for (let up = 2; up < z - 6; up++) p.upright(Math.round(across * (up / z)), up, F.white);
  } },
  // an inflatable paddling pool, striped, a rubber duck afloat (the water ripples, see festivals.ts)
  pool: { height: 12, paint(p, { width, depth }) {
    const rim = 0.28;
    const stripes = (x: number, y: number, w: number, d: number) => {
      const along = w > d;
      const count = Math.round((along ? w : d) / 0.3);
      for (let index = 0; index < count; index++) {
        const colour = index % 2 ? F.poolStripe : F.poolRim;
        if (along) p.box(x + index * w / count, y, w / count, d, 0, 6, colour);
        else p.box(x, y + index * d / count, w, d / count, 0, 6, colour);
      }
    };
    stripes(0, 0, width, rim);
    stripes(0, rim, rim, depth - rim);
    p.box(rim, rim, width - rim * 2, depth - rim * 2, 0, 4, F.water, F.water);
    for (const [x, y] of [[0.8, 0.6], [1.6, 0.9], [2.2, 0.55], [1.1, 1.15]]) { p.pixel(x, y, 4, F.waterLight); p.pixel(x + 0.08, y - 0.08, 4, F.waterLight); }
    p.ball(1.9, 0.75, 6, 2.2, 1.8, F.duck);
    p.ball(1.95, 0.72, 8.5, 1.4, 1.4, F.duck);
    p.upright(-3, 8, F.duckBeak, { x: 1.95, y: 0.72 });
    stripes(width - rim, rim, rim, depth - rim);
    stripes(rim, depth - rim, width - rim * 2, rim);
  } },
  speaker: { height: 32, paint(p) {
    p.shadow(0.5, 0.5, 6, 3);
    p.box(0.22, 0.25, 0.56, 0.5, 0, 26, F.speaker);
    p.ball(0.5, 0.78, 9, 3.2, 3.2, F.speakerCone);
    p.ball(0.5, 0.78, 20, 2, 2, F.speakerCone);
    p.pixel(0.5, 0.78, 9, F.speaker);
  } },
  fan: { height: 36, paint(p) {
    p.box(0.3, 0.3, 0.4, 0.4, 0, 1, F.fan);
    p.box(0.46, 0.46, 0.08, 0.08, 1, 20, F.fan);
    p.ball(0.5, 0.55, 27, 6, 6, F.fanBlade);
    p.ball(0.5, 0.55, 27, 4, 4, F.fan);
    for (const [across, z] of [[-4, 27], [4, 27], [0, 23], [0, 31], [-3, 30], [3, 24]] as const) p.upright(across, z, F.fanBlade, { x: 0.5, y: 0.55 });
    p.ball(0.5, 0.55, 27, 1.2, 1.2, F.speaker);
  } },
  // a kumquat tree in a red pot with a gold band, for luck
  kumquat: { height: 36, paint(p) {
    p.shadow(0.5, 0.5, 7, 3);
    p.box(0.25, 0.25, 0.5, 0.5, 0, 8, F.potRed);
    p.onFront(0.75, 0.25, 0.75, 5, 6, F.gold);
    p.box(0.45, 0.45, 0.1, 0.1, 8, 8, F.trunk);
    p.ball(0.5, 0.5, 21, 7, 6, F.pineDark);
    p.ball(0.42, 0.6, 23, 5, 4, F.green);
    for (const [across, z] of [[-5, 19], [3, 18], [-2, 24], [5, 23], [0, 27], [-4, 26], [2, 21]] as const) { p.upright(across, z, F.kumquat); p.upright(across + 1, z, F.kumquat); }
    p.upright(4, 15, F.red);
    p.upright(4, 14, F.red);
  } },
  // three painted eggs lying in the grass of the floor: rounder at the bottom, a band across each
  eggs: { height: 12, paint(p, piece) {
    const seed = Math.round(piece.x * 7 + piece.y * 3);
    [[0.15, 0.9], [0.5, 0.5], [0.9, 0.15]].forEach(([x, y], index) => {
      const colours = tones(F.eggs[(seed + index) % F.eggs.length]);
      const band = F.eggs[(seed + index + 2) % F.eggs.length];
      for (const [line, row] of EGG.entries()) [...row].forEach((letter, column) => {
        if (letter === '.') return;
        const colour = line === 3 ? band : letter === 'l' ? colours.light : letter === 's' ? colours.shade : colours.base;
        p.upright(column - 2, EGG.length - 1 - line, colour, { x, y });
      });
    });
  } },
  /* props, on a desk (top 11) or a low table (top 7): see propSpot */
  crepes: { height: 34, paint(p, piece) {
    const { x, y } = propSpot(piece), z = piece.top ?? 0;
    p.box(x - 0.3, y - 0.25, 0.6, 0.5, z, 1, F.plate);
    for (let layer = 0; layer < 7; layer++) {
      const shift = (layer % 3 - 1) * 0.03;
      p.box(x - 0.24 + shift, y - 0.2, 0.48, 0.4, z + 1 + layer, 1, layer % 2 ? F.crepe : F.crepeDark);
    }
    p.box(x - 0.08, y - 0.06, 0.16, 0.12, z + 8, 1, F.jam);
    p.box(x + 0.32, y - 0.12, 0.1, 0.1, z, 4, F.glass);
  } },
  galette: { height: 30, paint(p, piece) {
    const { x, y } = propSpot(piece), z = piece.top ?? 0;
    p.box(x - 0.3, y - 0.25, 0.6, 0.5, z, 1, F.plate);
    p.box(x - 0.24, y - 0.2, 0.48, 0.4, z + 1, 2, F.galette);
    for (const offset of [-0.1, 0.05]) p.box(x + offset, y - 0.18, 0.02, 0.36, z + 3, 0.2, tones(F.galette).dark);
    // its paper crown, beside it
    p.box(x + 0.32, y - 0.1, 0.24, 0.06, z, 2, F.gold);
    for (const across of [0, 2, 4]) p.upright(across - 2, z + 3, F.gold, { x: x + 0.44, y: y - 0.07 });
  } },
  rose: { height: 30, paint(p, piece) {
    const { x, y } = propSpot(piece), z = piece.top ?? 0;
    p.box(x - 0.07, y - 0.07, 0.14, 0.14, z, 5, F.glass);
    for (let up = 5; up < 11; up++) p.upright(0, z + up, F.leaf, { x, y });
    p.upright(1, z + 8, F.leaf, { x, y });
    p.ball(x, y, z + 12, 1.8, 1.6, F.rose);
    p.box(x + 0.22, y - 0.05, 0.16, 0.2, z, 1, F.heart);
  } },
  lilyOfTheValley: { height: 28, paint(p, piece) {
    const { x, y } = propSpot(piece), z = piece.top ?? 0;
    p.box(x - 0.06, y - 0.06, 0.12, 0.12, z, 3, F.plate);
    for (let up = 3; up < 9; up++) { p.upright(0, z + up, F.leaf, { x, y }); if (up > 4) p.upright(-1, z + up - 1, F.leaf, { x, y }); }
    p.upright(1, z + 6, F.leaf, { x, y });
    for (const [across, up] of [[1, 8], [2, 7], [2, 6], [-2, 7], [-3, 6]] as const) p.upright(across, z + up, F.lily, { x, y });
  } },
  chocolateBunny: { height: 32, paint(p, piece) {
    const { x, y } = propSpot(piece), z = piece.top ?? 0;
    p.box(x - 0.12, y - 0.1, 0.24, 0.2, z, 3, F.gold);
    p.ball(x, y, z + 5, 2.4, 2.8, F.chocolate);
    p.ball(x, y, z + 9, 1.8, 1.8, F.chocolate);
    for (const across of [-1, 1]) for (let up = 10; up < 14; up++) p.upright(across, z + up, F.chocolate, { x, y });
    p.upright(0, z + 7, F.red, { x, y });
  } },
  champagne: { height: 30, paint(p, piece) {
    const { x, y } = propSpot(piece), z = piece.top ?? 0;
    p.box(x - 0.06, y - 0.06, 0.12, 0.12, z, 7, F.bottle);
    for (let up = 7; up < 10; up++) p.upright(0, z + up, F.bottle, { x, y });
    p.upright(0, z + 10, F.gold, { x, y });
    p.upright(0, z + 4, F.gold, { x, y });
    for (const shift of [0.25, 0.4]) {
      p.upright(0, z + 1, F.glass, { x: x + shift, y });
      for (let up = 2; up < 5; up++) p.upright(0, z + up, F.bubbly, { x: x + shift, y });
    }
  } },
  cake: { height: 30, paint(p, piece) {
    const { x, y } = propSpot(piece), z = piece.top ?? 0;
    p.box(x - 0.3, y - 0.25, 0.6, 0.5, z, 1, F.plate);
    p.box(x - 0.24, y - 0.2, 0.48, 0.4, z + 1, 5, F.cake);
    p.box(x - 0.24, y - 0.2, 0.48, 0.4, z + 6, 1, F.icing);
    candles(p, { x, y }, z + 7, 3);
  } },
  redEnvelope: { height: 24, paint(p, piece) {
    const { x, y } = propSpot(piece), z = piece.top ?? 0;
    for (const [shift, up] of [[0, 0], [0.08, 1], [-0.05, 2]] as const) {
      p.box(x - 0.15 + shift, y - 0.1, 0.3, 0.2, z + up, 1, F.envelope);
      p.pixel(x + shift, y, z + up + 1, F.gold);
    }
  } },
  // a carved pumpkin, its face turned to the room, lit from inside
  pumpkin: { height: 16, paint(p) {
    p.shadow(0.5, 0.5, 6, 3);
    p.ball(0.5, 0.5, 6, 7, 6, H.pumpkin);
    // the face and the stalk are laid out on the screen around the ball's centre: along x - y, 8 art pixels per tile
    const onScreen = (rows: readonly string[], middle: number, top: number, paints: Readonly<Record<string, string>>) => {
      for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
        const colour = paints[letter];
        if (!colour) return;
        const across = (column - middle) / 16;
        p.pixel(0.5 + across, 0.5 - across, top - line, colour);
      });
    };
    onScreen(PUMPKIN_FACE, 4, 8, { k: H.glow });
    onScreen(PUMPKIN_STALK, 2, 15, { s: H.stalk, h: H.stalkLight, l: H.leaf });
  } },
  cooler: { height: 26, paint(p) {
    p.box(0.25, 0.25, 0.5, 0.5, 0, 13, C.cooler);
    p.onFront(0.75, 0.35, 0.45, 9, 10, C.ledRed);
    p.onFront(0.75, 0.55, 0.65, 9, 10, C.ledBlue);
    p.box(0.32, 0.32, 0.36, 0.36, 13, 9, C.water);
  } },
  printer: { height: 18, paint(p) {
    p.box(0.1, 0.15, 0.8, 0.7, 0, 8, C.metal);
    p.box(0.15, 0.2, 0.7, 0.6, 8, 6, C.printer);
    p.box(0.3, 0.6, 0.4, 0.2, 14, 1, C.paper);
    p.onFront(0.8, 0.7, 0.78, 11, 12, C.ledGreen);
  } },
  server: { height: 34, paint(p) {
    p.box(0.1, 0.1, 0.8, 0.8, 0, 32, C.server);
    for (let z = 4; z < 30; z += 4) p.onFront(0.9, 0.15, 0.85, z, z + 1, C.metal);
  } },
  counter: { height: 24, paint(p) {
    p.box(0, 0.1, 3, 0.85, 0, 11, C.counter);
    for (const x of [1, 2]) p.onFront(0.95, x - 0.02, x + 0.02, 1, 10, tones(C.counter).shade);
    p.box(0, 0.1, 3, 0.85, 11, 1, C.wood);
    p.box(0.3, 0.3, 0.5, 0.4, 12, 8, C.coffee);
    p.onFront(0.7, 0.45, 0.6, 15, 16, C.ledRed);
    for (const x of [1.2, 1.45]) p.box(x, 0.5, 0.14, 0.14, 12, 3, C.mug);
    p.box(2.1, 0.35, 0.4, 0.4, 12, 6, C.lightMetal);
  } },
};

/** The canvas of a piece, and where its far corner (its x, y) sits on it. */
interface Drawn { canvas: HTMLCanvasElement; corner: Point }

function render(piece: FurniturePiece): Drawn {
  const design = DESIGNS[piece.kind];
  const width = (piece.width + piece.depth) * TILE.x + MARGIN * 2;
  const height = (piece.width + piece.depth) * TILE.y + design.height + MARGIN * 2;
  const corner = { x: piece.depth * TILE.x + MARGIN, y: design.height + MARGIN };
  const { canvas, context } = artCanvas(width, height);
  const at = (x: number, y: number, z: number): Point => ({ x: corner.x + (x - y) * TILE.x, y: corner.y + (x + y) * TILE.y - z });
  const painter: Painter = {
    box(x, y, w, d, z, h, colour, top) {
      const colours = tones(colour);
      const t = z + h;
      fillPolygon(context, [at(x, y + d, z), at(x + w, y + d, z), at(x + w, y + d, t), at(x, y + d, t)], colours.base);
      fillPolygon(context, [at(x + w, y, z), at(x + w, y + d, z), at(x + w, y + d, t), at(x + w, y, t)], colours.shade);
      fillPolygon(context, [at(x, y, t), at(x + w, y, t), at(x + w, y + d, t), at(x, y + d, t)], top ?? colours.light);
    },
    onFront(y, fromX, toX, fromZ, toZ, colour) {
      fillPolygon(context, [at(fromX, y, fromZ), at(toX, y, fromZ), at(toX, y, toZ), at(fromX, y, toZ)], colour);
    },
    ball(x, y, z, radiusX, radiusY, colour) {
      const center = at(x, y, z);
      shadedBall((px, py, shadeColour) => { context.fillStyle = shadeColour; context.fillRect(px, py, 1, 1); }, center.x, center.y, radiusX, radiusY, tones(colour));
    },
    shadow(x, y, radiusX, radiusY) {
      const center = at(x, y, 0);
      context.fillStyle = C.shadow;
      for (let row = -Math.ceil(radiusY); row <= Math.ceil(radiusY); row++) {
        const half = Math.round(radiusX * Math.sqrt(Math.max(0, 1 - (row / radiusY) ** 2)));
        if (half > 0) context.fillRect(Math.round(center.x) - half, Math.round(center.y) + row, half * 2, 1);
      }
    },
    pixel(x, y, z, colour) {
      const point = at(x, y, z);
      context.fillStyle = colour;
      context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
    },
    upright(across, z, colour, middle = { x: piece.width / 2, y: piece.depth / 2 }) {
      const point = at(middle.x, middle.y, z);
      context.fillStyle = colour;
      context.fillRect(Math.round(point.x + across), Math.round(point.y), 1, 1);
    },
  };
  design.paint(painter, piece);
  outline(canvas, C.outline);
  design.fine?.(painter, piece);
  return { canvas, corner };
}

export interface FurnitureSprites {
  draw(context: CanvasRenderingContext2D, piece: FurniturePiece): void;
}

export function pixelFurniture(): FurnitureSprites {
  const drawn = new Map<FurniturePiece, Drawn>();
  return {
    draw(context, piece) {
      let image = drawn.get(piece);
      if (!image) { image = render(piece); drawn.set(piece, image); }
      const far = toScreen({ x: piece.x, y: piece.y });
      context.drawImage(image.canvas, Math.round(far.x - image.corner.x * ART_SCALE), Math.round(far.y - image.corner.y * ART_SCALE), image.canvas.width * ART_SCALE, image.canvas.height * ART_SCALE);
    },
  };
}

/** Draw order of a piece: the depth of its front tile, just before whoever stands or sits on that tile (or, for a piece drawn behind them, before anyone on any of its tiles). */
export function furnitureDepth(piece: FurniturePiece): number {
  if (piece.behind) return piece.x + piece.y - 0.1;
  return (piece.x + piece.width - 0.5) + (piece.y + piece.depth - 0.5) - 0.1;
}
