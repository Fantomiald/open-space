// The office's furniture in pixel art: each piece is a few boxes on the isometric grid (a lit top and the two faces
// turned to the viewer), with its details, drawn once at art resolution on its own canvas, outlined, and kept.
import { ROOM_PALETTE } from '../design/room-palette.ts';
import { reducedMotion } from '../lib/motion.ts';
import { TOPS, type FurniturePiece, type PieceKind } from '../../shared/room-layout.ts';
import { toScreen, type Point } from './geometry.ts';
import { ART_SCALE, artCanvas, fillPolygon, outline, ring, shadedBall, tones } from './pixel-art.ts';
import { themeKit } from './themes/index.ts';
import { glyphRows } from './wall-art.ts';
import { BOARD, DOODLES, DOODLE_GAP, LINE_HEIGHT, doodlesWidth, textWidth, type BoardContent } from './whiteboard.ts';

const C = ROOM_PALETTE.furniture;
const H = ROOM_PALETTE.halloween;
const F = ROOM_PALETTE.festive;
/** Art pixels of one tile along x (right and down) and y (left and down). */
const TILE = { x: 8, y: 4 };
const MARGIN = 3;

export interface Painter {
  /** a box from (x, y) to (x + width, y + depth) in tiles, from `z` to `z + height` in art pixels */
  box(x: number, y: number, width: number, depth: number, z: number, height: number, colour: string, top?: string): void;
  /** a flat shape on the +y face (the one turned to the bottom left) of the plane y = `y` */
  onFront(y: number, fromX: number, toX: number, fromZ: number, toZ: number, colour: string): void;
  /** a flat shape on the +x face (the one turned to the bottom right) of the plane x = `x`: what hangs on the left wall */
  onSide(x: number, fromY: number, toY: number, fromZ: number, toZ: number, colour: string): void;
  /** a shaded ball centred above a floor point */
  ball(x: number, y: number, z: number, radiusX: number, radiusY: number, colour: string): void;
  /** a soft shadow on the floor around a point (too faint to be outlined) */
  shadow(x: number, y: number, radiusX: number, radiusY: number): void;
  pixel(x: number, y: number, z: number, colour: string): void;
  /** a pixel `across` art pixels right of the middle of the footprint (left when negative), `z` up: for upright shapes */
  upright(across: number, z: number, colour: string, middle?: { x: number; y: number }): void;
}

/** The user's laptop on their desk, keyboard and lid (floor.ts finds the same box under the pointer). */
function paintLaptop(p: Painter) {
  p.box(1.1, 0.15, 0.8, 0.45, 11, 1, C.lightMetal);
  p.box(1.1, 0.55, 0.8, 0.06, 12, 5, C.monitor);
}

/* The drafts of the numbers object (METRICS_OBJECT in shared/room-layout.ts; floor.ts finds the same boxes under the pointer) */

/**
 * At the left end of the user's desk (they sit behind its middle, so nothing of theirs hides it): a pile of banknote
 * bundles, and a notepad standing in front of it with a rising curve. Both face the viewer, one letter a pixel.
 */
const BANKNOTES = [
  '..lllwlll.',
  '..gggwgggd',
  '.lllwlllld',
  '.gggwggggd',
  'lllwlllld.',
  'gggwggggd.',
  '.lllwllll.',
  '.gggwggggd',
  'lllwllllld',
  'gggwgggggd',
  'gggwgggggd',
  'gggwgggggd',
];
const NOTEPAD = [
  '.k.k.k.k.',
  'nnnnnnnnn',
  'nnnnnnrrn',
  'nnnnnnnrn',
  'nnnnnnrnn',
  'nnnnnrnnn',
  'nnnnrnnnn',
  'nnrrnnnnn',
  'nrnnnnnnn',
  'nnnnnnnnn',
];
const CASH_COLOURS: Readonly<Record<string, string>> = { l: tones(C.cash).light, g: C.cash, d: tones(C.cash).dark, w: C.cashBand, k: C.spiral, n: C.notepad, r: C.rising };
/** Where each stands on the desk (from its corner, in tiles). */
const CASH_SPOTS = { banknotes: { x: 0.3, y: 0.3 }, notepad: { x: 0.35, y: 0.82 } };

/** One letter a pixel, facing the viewer, its bottom row on the desk's top above `middle`. */
export function standing(p: Painter, rows: readonly string[], colours: Readonly<Record<string, string>>, middle: { x: number; y: number }, z: number) {
  const half = Math.floor(rows[0].length / 2);
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
    const colour = colours[letter];
    if (colour) p.upright(column - half, z + rows.length - 1 - line, colour, middle);
  });
}

function paintCash(p: Painter) {
  standing(p, BANKNOTES, CASH_COLOURS, CASH_SPOTS.banknotes, TOPS.desk);
  standing(p, NOTEPAD, CASH_COLOURS, CASH_SPOTS.notepad, TOPS.desk);
}

/** The dashboard screen on the left wall: its frame and its face (the chart is drawn on it, see drawChart). */
const TV_FACE = { fromY: 0.12, toY: 2.38, low: 27, high: 41 };
function paintMetricsTv(p: Painter) {
  p.box(0, 0, 0.12, 2.5, 26, 16, C.screenBezel);
  p.onSide(0.12, TV_FACE.fromY, TV_FACE.toY, TV_FACE.low, TV_FACE.high, C.screenFace);
}

/** Bars of a chart (their heights), and the trend line over them: columns along the screen from its left on screen. */
const BARS = [3, 5, 4, 7, 9] as const;
function drawChart(p: Painter) {
  // a column on screen goes left along y; rows go up from the face's bottom
  const at = (column: number, row: number, colour: string) => p.pixel(0.12, TV_FACE.toY - (column + 0.5) / 8, TV_FACE.low + 1 + row, colour);
  for (let column = 0; column < 17; column++) { at(column, 0, C.screenGrid); if (column % 2) at(column, 6, C.screenGrid); }
  BARS.forEach((height, index) => {
    for (let row = 1; row <= height; row++) for (const shift of [0, 1]) at(2 + index * 3 + shift, row, C.bars[index % 2]);
  });
  for (const [index, height] of BARS.entries()) at(2 + index * 3, height + 2, C.trend);
  for (const [column, row] of [[3, 7], [4, 7], [6, 7], [7, 7], [9, 8], [10, 9], [12, 10], [13, 11]] as const) at(column, row, C.trend);
  for (let column = 1; column < 6; column++) at(column, 12, C.screenGrid);
}

/** A stock ticker along the left wall: a strip of lights (what it shows: writeOnTicker). */
const TICKER = { fromY: 0.1, toY: 4.1, low: 36, high: 42 };
function paintTicker(p: Painter) {
  p.box(0, 0, 0.1, 4.2, 35, 8, C.screenBezel);
  p.onSide(0.1, TICKER.fromY, TICKER.toY, TICKER.low, TICKER.high, C.ticker);
}

/** What the ticker shows, one letter a pixel: prices going up and down (letters would not read on the slanting wall). */
const ARROW_UP = ['..#..', '.###.', '#####', '..#..', '..#..'];
const ARROW_DOWN = [...ARROW_UP].reverse();
const DASH = ['.....', '.....', '#####', '.....', '.....'];
function writeOnTicker(p: Painter) {
  const at = (column: number, row: number, colour: string) => p.pixel(0.1, TICKER.toY - (column + 0.5) / 8, TICKER.low + row, colour);
  const signs = [[ARROW_UP, C.tickerGreen], [DASH, C.tickerAmber], [ARROW_UP, C.tickerGreen], [ARROW_DOWN, C.tickerRed], [ARROW_UP, C.tickerGreen]] as const;
  signs.forEach(([rows, colour], index) => {
    for (const [line, text] of rows.entries()) [...text].forEach((letter, across) => { if (letter === '#') at(1 + index * 6 + across, rows.length - line, colour); });
  });
}

/** A piggy bank on the bookshelf, seen from its side, a coin going into its slot: one letter a pixel (see PIGGY_COLOURS). */
const PIGGY = [
  '.......cc....',
  '.......cc....',
  '......kk.....',
  '...pppppp.d..',
  '.dppwwppppdp.',
  '..pwppppppkpp',
  '..pppppppppnn',
  '..pppppppppnn',
  '...ssppppss..',
  '...dd....dd..',
];
const PIGGY_COLOURS: Readonly<Record<string, string>> = { c: C.coin, k: C.spiral, p: C.piggy, w: C.cashBand, d: C.piggyShade, s: C.piggyShade, n: C.piggySnout };
const PIGGY_SPOT = { x: 1, y: 0.3 };
const paintPiggy = (p: Painter) => standing(p, PIGGY, PIGGY_COLOURS, PIGGY_SPOT, TOPS.bookshelf);

/** The whiteboard's writing surface: its plane, and where its first column and its bottom row are (see BOARD). */
const SURFACE = { y: 0.34, fromX: 0.25, bottom: 17 };

/** The whiteboard on wheels without what is written on it: casters, feet, posts, the board in its frame, the marker tray. */
function paintWhiteboard(p: Painter) {
  for (const x of [0.02, 3.82]) {
    for (const y of [0.02, 0.5]) p.box(x + 0.02, y, 0.12, 0.08, 0, 2, C.caster);
    p.box(x, 0, 0.16, 0.6, 2, 1.5, C.metal);
    p.box(x + 0.04, 0.26, 0.08, 0.08, 3, 41, C.boardFrame);
  }
  p.box(0.1, 0.24, 3.8, 0.1, 14, 30, C.boardFrame);
  p.onFront(SURFACE.y, 0.18, 3.82, 15, 43, C.whiteboard);
  p.box(0.3, SURFACE.y, 3.4, 0.1, 13, 1, C.boardFrame);
}

/** A pixel of the writing surface: `column` along it from its left, `row` up from its bottom. */
const onBoard = (p: Painter, column: number, row: number, colour: string) => p.pixel(SURFACE.fromX + column / 8, SURFACE.y, SURFACE.bottom + row, colour);

/** A marker drawing (whiteboard.ts) with its bottom left pixel at (column, row). */
function drawSprite(p: Painter, rows: readonly string[], column: number, row: number) {
  for (const [line, text] of rows.entries()) [...text].forEach((letter, across) => {
    const colour = C.markers[letter as keyof typeof C.markers];
    if (colour) onBoard(p, column + across, row + rows.length - 1 - line, colour);
  });
}

/**
 * Scribbled notes: a title underlined, then items with a bullet, one ticked. The lines slant with the board, so they
 * are drawn whole (a gap between words would read as a broken diagonal).
 */
function scribbleNotes(p: Painter) {
  const line = (from: number, to: number, row: number, colour: string) => { for (let column = from; column <= to; column++) onBoard(p, column, row, colour); };
  line(1, 11, 22, C.markers.k);
  line(1, 11, 21, C.markers.k);
  line(0, 13, 18, C.markers.k);
  for (const [row, end] of [[13, 21], [8, 15], [3, 23]] as const) {
    // the bullet two rows lower than its line: the line goes down half a row a column, and starts four columns right
    line(1, 2, row - 2, C.markers.b);
    line(1, 2, row - 1, C.markers.b);
    line(5, end, row, C.markers.b);
  }
  for (const [column, row] of [[19, 9], [20, 8], [21, 9], [22, 10], [23, 11], [24, 12]] as const) onBoard(p, column, row, C.markers.r);
}

/** What the board shows (see boardContent): notes, the birthday wishes, or the festival's doodles, centred on it. */
export function writeOnBoard(p: Painter, board: BoardContent) {
  if (board.kind === 'notes') { scribbleNotes(p); return; }
  if (board.kind === 'birthday') {
    const height = board.lines.length * LINE_HEIGHT - 2;
    const bottom = Math.floor((BOARD.rows - height) / 2);
    // one line after the other from the top, red then blue
    board.lines.forEach((text, index) => {
      const colour = index % 2 ? C.markers.b : C.markers.r;
      const column = Math.floor((BOARD.columns - textWidth(text)) / 2);
      const lineBottom = bottom + (board.lines.length - 1 - index) * LINE_HEIGHT;
      for (const [line, row] of glyphRows(text).entries()) [...row].forEach((letter, across) => {
        if (letter === '#') onBoard(p, column + across, lineBottom + 4 - line, colour);
      });
    });
    return;
  }
  let column = Math.floor((BOARD.columns - doodlesWidth(board.doodles)) / 2);
  for (const doodle of board.doodles) {
    const rows = DOODLES[doodle];
    drawSprite(p, rows, column, Math.floor((BOARD.rows - rows.length) / 2));
    column += rows[0].length + DOODLE_GAP;
  }
}

/** The balloons tied to the whiteboard's left post at a birthday: how far along it, how high, and their colour. */
const BOARD_BALLOONS = [[0.15, 54, 0], [0.55, 58, 2], [0.3, 63, 1]] as const;

/** What a click opens on a piece, outlined in white under the pointer: the user's laptop on their desk, the whiteboard. */
const CLICKABLE: Partial<Record<PieceKind, (paint: Painter) => void>> = {
  bossDesk: paintLaptop, whiteboard: paintWhiteboard, cash: paintCash, metricsTv: paintMetricsTv, ticker: paintTicker, piggyBank: paintPiggy,
};

/**
 * `fine`: thin details painted after the outline, so they stay one pixel wide (strings). `board`: what the whiteboard
 * shows. `float`: the piece hovers and bobs up and down by that many art pixels, all but `ground` (its glow or shadow
 * on the floor, painted on a canvas of its own that stays still). `clickable`: the part outlined under the pointer, when
 * a theme moves it (see CLICKABLE).
 */
export interface Design {
  height: number;
  paint: (paint: Painter, piece: FurniturePiece, board: BoardContent) => void;
  fine?: (paint: Painter, piece: FurniturePiece, board: BoardContent) => void;
  float?: number;
  ground?: (paint: Painter, piece: FurniturePiece) => void;
  clickable?: (paint: Painter) => void;
}

/** A piece's design in the theme the room is dressed in. */
const designOf = (kind: PieceKind): Design => themeKit()?.furniture?.[kind] ?? DESIGNS[kind];
/** How long a floating piece takes to bob up and back down, in ms. */
const BOB_MS = 3200;
/** How high a floating piece is lifted at `time`, in room pixels: each on its own beat, a whole art pixel at a time. */
export function bobOf(piece: FurniturePiece, float: number, time: number) {
  const phase = ((piece.x * 7 + piece.y * 13) % 10) / 10;
  return Math.round(Math.sin((time / BOB_MS + phase) * Math.PI * 2) * float) * ART_SCALE;
}

/** Where a prop stands on its desk or table, by footprint: the user's desk is three tiles wide, the others two. */
function propSpot(piece: FurniturePiece) {
  if (piece.width === 3) return { x: 2.35, y: 0.6 };
  return piece.top === 11 ? { x: 1.45, y: 0.3 } : { x: 1.35, y: 0.5 };
}

/** The Christmas tree's tiers, from the bottom: centre height, half width and half height, in art pixels. */
const TREE_TIERS = [[17, 14, 8], [28, 11, 7], [38, 8, 6], [46, 5, 4]] as const;

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
    paintLaptop(p);
    p.onFront(0.61, 1.45, 1.55, 14, 15, C.lightMetal);
    p.box(2.7, 0.12, 0.2, 0.2, 11, 4, C.lampShade);
    p.box(2.05, 0.5, 0.5, 0.3, 11, 1, C.paper);
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
  // round, bushy tiers like the office's plants (shaded balls, outlined), in a red pot, a string of gold beads on
  // each tier, baubles and a star (its lights twinkle every frame, see TREE_LIGHTS in festivals.ts)
  christmasTree: { height: 60, paint(p) {
    p.shadow(1, 1, 15, 6);
    p.box(0.66, 0.66, 0.68, 0.68, 0, 7, F.potRed);
    p.box(0.63, 0.63, 0.74, 0.74, 6, 2, F.gold);
    p.box(0.9, 0.9, 0.2, 0.2, 8, 4, F.trunk);
    for (const [z, wide, high] of TREE_TIERS) {
      p.ball(1, 1, z, wide, high, F.pineDark);
      p.ball(0.92, 1.05, z + 1, wide - 2, high - 1, F.pine);
    }
    TREE_TIERS.forEach(([z, wide, high], tier) => {
      for (let across = -wide + 3; across <= wide - 3; across += 2) {
        const sag = (across / wide) ** 2;
        if (tier < 3) p.upright(across, Math.round(z - high * 0.45 + sag * high * 0.5), F.gold);
      }
    });
    for (const [across, z, colour] of [[-8, 13, F.red], [7, 15, F.bulbs[2]], [-2, 20, F.bulbs[1]], [9, 23, F.red], [-7, 27, F.bulbs[4]], [3, 30, F.bulbs[2]], [-4, 37, F.red], [5, 38, F.bulbs[1]], [0, 44, F.bulbs[4]]] as const) {
      for (const [x, z2] of [[0, 0], [1, 0], [0, 1], [1, 1]]) p.upright(across + x, z + z2, colour);
      p.upright(across, z + 1, F.white);
    }
    for (const [across, z] of [[0, 52], [0, 53], [0, 54], [0, 55], [0, 56], [-1, 54], [1, 54], [-2, 54], [2, 54], [-1, 53], [1, 53], [-1, 55], [1, 55]] as const) p.upright(across, z, F.gold);
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
  // a whiteboard on a stand with casters, two markers and an eraser on its tray; balloons tied to it at a birthday
  whiteboard: { height: 68, paint(p, _piece, board) {
    paintWhiteboard(p);
    for (const [x, colour] of [[0.7, C.markers.b], [1.05, C.markers.r]] as const) p.box(x, SURFACE.y + 0.02, 0.28, 0.05, 14, 1, colour);
    p.box(2.9, SURFACE.y + 0.01, 0.4, 0.08, 14, 1.5, C.caster);
    if (board.kind === 'birthday') for (const [x, z, colour] of BOARD_BALLOONS) p.ball(x, 0.3, z, 3.5, 4.5, F.balloons[colour]);
  }, fine(p, _piece, board) {
    writeOnBoard(p, board);
    // the balloons' strings, from the top of the left post
    if (board.kind === 'birthday') for (const [x, z] of BOARD_BALLOONS) for (let up = 44; up < z - 4; up++) p.pixel(0.1 + (x - 0.1) * (up - 44) / (z - 48), 0.3, up, F.white);
  } },
  // the drafts of the numbers object: the details are painted after the outline, one pixel each
  cash: { height: 28, paint: paintCash },
  metricsTv: { height: 46, paint: paintMetricsTv, fine: drawChart },
  ticker: { height: 46, paint: paintTicker, fine: writeOnTicker },
  piggyBank: { height: 40, paint: paintPiggy },
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
interface Drawn { canvas: HTMLCanvasElement; corner: Point; ground?: HTMLCanvasElement; float?: number }

/** A piece drawn on its own canvas; `part`: only that part of it, as a white line around it (see CLICKABLE). */
function render(piece: FurniturePiece, board: BoardContent, part?: (paint: Painter) => void): Drawn {
  const design = designOf(piece.kind);
  const width = (piece.width + piece.depth) * TILE.x + MARGIN * 2;
  const height = (piece.width + piece.depth) * TILE.y + design.height + MARGIN * 2;
  const corner = { x: piece.depth * TILE.x + MARGIN, y: design.height + MARGIN };
  const ground = !part && design.ground ? paintOn(artCanvas(width, height), piece, corner, (p) => design.ground!(p, piece)) : undefined;
  const drawing = artCanvas(width, height);
  const { canvas } = drawing;
  const painter = painterOn(drawing, piece, corner);
  if (part) {
    part(painter);
    ring(canvas, C.highlight);
    return { canvas, corner, float: design.float };
  }
  design.paint(painter, piece, board);
  outline(canvas, C.outline);
  design.fine?.(painter, piece, board);
  return { canvas, corner, ground, float: design.float };
}

function paintOn(drawing: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }, piece: FurniturePiece, corner: Point, paint: (p: Painter) => void) {
  paint(painterOn(drawing, piece, corner));
  return drawing.canvas;
}

function painterOn({ context }: { context: CanvasRenderingContext2D }, piece: FurniturePiece, corner: Point): Painter {
  const at = (x: number, y: number, z: number): Point => ({ x: corner.x + (x - y) * TILE.x, y: corner.y + (x + y) * TILE.y - z });
  return {
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
    onSide(x, fromY, toY, fromZ, toZ, colour) {
      fillPolygon(context, [at(x, fromY, fromZ), at(x, toY, fromZ), at(x, toY, toZ), at(x, fromY, toZ)], colour);
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
}

export interface FurnitureSprites {
  draw(context: CanvasRenderingContext2D, piece: FurniturePiece): void;
  /** The white line around what a click opens on the piece (CLICKABLE), when it has something. */
  drawHighlight(context: CanvasRenderingContext2D, piece: FurniturePiece): void;
}

/** `board`: what the whiteboard shows (the furniture is made again when the festival changes, with the room). */
export function pixelFurniture(board: BoardContent = { kind: 'notes' }): FurnitureSprites {
  const drawn = new Map<FurniturePiece, Drawn>();
  const highlights = new Map<FurniturePiece, Drawn>();
  const place = (context: CanvasRenderingContext2D, piece: FurniturePiece, image: Drawn) => {
    const far = toScreen({ x: piece.x, y: piece.y });
    const left = Math.round(far.x - image.corner.x * ART_SCALE), top = Math.round(far.y - image.corner.y * ART_SCALE);
    const size = [image.canvas.width * ART_SCALE, image.canvas.height * ART_SCALE] as const;
    if (image.ground) context.drawImage(image.ground, left, top, ...size);
    const bob = image.float && !reducedMotion() ? bobOf(piece, image.float, performance.now()) : 0;
    context.drawImage(image.canvas, left, top - bob, ...size);
  };
  return {
    draw(context, piece) {
      let image = drawn.get(piece);
      if (!image) { image = render(piece, board); drawn.set(piece, image); }
      place(context, piece, image);
    },
    drawHighlight(context, piece) {
      const part = designOf(piece.kind).clickable ?? CLICKABLE[piece.kind];
      if (!part) return;
      let image = highlights.get(piece);
      if (!image) { image = render(piece, board, part); highlights.set(piece, image); }
      place(context, piece, image);
    },
  };
}

/** Draw order of a piece: the depth of its front tile, just before whoever stands or sits on that tile (or, for a piece drawn behind them, before anyone on any of its tiles). */
export function furnitureDepth(piece: FurniturePiece): number {
  // on the wall: behind everything in the room
  if (piece.wall) return -1;
  if (piece.behind) return piece.x + piece.y - 0.1;
  return (piece.x + piece.width - 0.5) + (piece.y + piece.depth - 0.5) - 0.1;
}
