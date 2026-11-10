// The mods object of each theme (the office's is the dashboard screen, pixel-furniture.ts): on the left wall where the
// screen is, a little lower; a click opens the mods' panel. Boxes like the rest of the furniture (a lit top, two faces),
// with what shows on their front drawn a letter an art pixel (FACES). Colours in ROOM_PALETTE.mods.
import { ROOM_PALETTE } from '../../design/room-palette.ts';
import type { Design, Painter } from '../pixel-furniture.ts';
import type { RoomTheme } from '../../../shared/room-themes.ts';

type Themed = Exclude<RoomTheme, 'office'>;
const M = ROOM_PALETTE.mods;
/** the bottom of the objects, in art pixels above the floor */
const LOW = 22;

/** What shows on a front face, the +x face at `x`: its first column at `toY` (going right along the wall, an art pixel each), its bottom row at `low`. */
export const FACES = {
  holo: [
    'wwwwww.......',
    '..........bb.',
    'wwww......bb.',
    '.......bb.bb.',
    'wwwww..bb.bb.',
    '....bb.bb.bb.',
    'www.bb.bb.bb.',
  ],
  arcade: [
    '..g.....g...',
    '.ggg...ggg..',
    'g.g.g.g.g.g.',
    '............',
    '.....p......',
    '....ppp.....',
    '............',
    'yy.yyy...yy.',
  ],
  map: [
    '.............',
    '.ggg....r....',
    'ggggg..r..x.x',
    '.ggg..r....x.',
    '..g..r....x.x',
    '....r........',
    '...r....ggg..',
    '..r....ggggg.',
    '.............',
  ],
  hole: [
    '.hh.',
    'hhhh',
    'hhhh',
    '.hh.',
  ],
  terminal: [
    'ffffffffffffff',
    'fssssssssssssf',
    'fsllllllsssssf',
    'fssssssssssssf',
    'fsllllsllllssf',
    'fssssssssssssf',
    'fsllllllllsssf',
    'fssssssssssssf',
    'fslscssssssssf',
    'ffffffffffffff',
  ],
} as const;

function face(p: Painter, x: number, toY: number, low: number, rows: readonly string[], colours: Readonly<Record<string, string>>) {
  for (const [row, line] of rows.entries()) [...line].forEach((letter, column) => {
    const colour = colours[letter];
    if (colour) p.pixel(x, toY - (column + 0.5) / 8, low + rows.length - 1 - row, colour);
  });
}

const DESIGNS: Readonly<Record<Themed, (p: Painter) => void>> = {
  // a hologram floating over its emitter on a bracket
  space: (p) => {
    const C = M.space;
    p.box(0, 0.8, 0.35, 0.9, LOW, 4, C.metal, C.metalTop);
    p.box(0.08, 0.5, 0.22, 1.5, LOW + 4, 2, C.beam);
    p.box(0.14, 0.15, 0.1, 2.2, LOW + 8, 16, C.holo, C.holoEdge);
    face(p, 0.24, 2.2, LOW + 11, FACES.holo, { w: C.text, b: C.bars });
  },
  // a small arcade cabinet hung on the wall: its marquee, its screen, its controls
  tokyo: (p) => {
    const C = M.tokyo;
    p.box(0, 0.4, 0.45, 1.7, LOW - 2, 24, C.cabinet, C.neon);
    p.box(0, 0.3, 0.6, 1.9, LOW + 22, 5, C.marquee, C.neon);
    p.box(0.45, 0.6, 0.22, 1.3, LOW + 3, 3, C.panel, C.panelTop);
    p.box(0.44, 0.55, 0.02, 1.4, LOW + 8, 12, C.screen);
    face(p, 0.46, 1.9, LOW + 10, FACES.arcade, { g: C.alien, p: C.ship, y: C.score });
    face(p, 0.6, 2.05, LOW + 24, ['y.yy.y.yy.y.y'], { y: C.score });
    for (const [y, colour] of [[0.95, C.button], [1.25, C.buttonBlue], [1.45, C.button]] as const) p.box(0.52, y, 0.08, 0.08, LOW + 6, 1, colour);
  },
  // an open grimoire and a candle on a wall shelf
  dungeon: (p) => {
    const C = M.dungeon;
    for (const y of [0.3, 1.95]) p.box(0, y, 0.35, 0.14, LOW - 6, 6, C.bracket);
    p.box(0, 0.1, 0.5, 2.3, LOW, 3, C.shelf, C.shelfTop);
    p.box(0.06, 0.4, 0.38, 1.6, LOW + 3, 1, C.cover);
    p.box(0.08, 0.45, 0.34, 0.72, LOW + 4, 2, C.pageShade, C.page);
    p.box(0.08, 1.23, 0.34, 0.72, LOW + 4, 3, C.pageShade, C.page);
    p.box(0.18, 2.1, 0.14, 0.14, LOW + 3, 9, C.wax, C.wax);
    p.ball(0.25, 2.17, LOW + 14, 1.5, 2.5, C.flame);
  },
  // two surfboards hung on the wall, a stripe down each
  beach: (p) => {
    const C = M.beach;
    const board = (y: number, low: number, tall: number, colour: string, top: string, stripe: string) => {
      p.box(0.03, y + 0.18, 0.12, 0.34, low - 3, 3, colour, top);
      p.box(0.03, y, 0.12, 0.7, low, tall, colour, top);
      p.box(0.03, y + 0.12, 0.12, 0.46, low + tall, 3, colour, top);
      p.box(0.03, y + 0.24, 0.12, 0.22, low + tall + 3, 2, colour, top);
      face(p, 0.15, y + 0.4, low, Array.from({ length: tall }, () => 's'), { s: stripe });
    };
    p.box(0, 0.35, 0.05, 1.9, LOW + 6, 2, C.peg);
    board(0.25, LOW - 4, 26, C.teal, C.tealTop, C.white);
    board(1.35, LOW - 1, 22, C.coral, C.coralTop, C.sun);
  },
  // a treasure map pinned with a dagger
  pirate: (p) => {
    const C = M.pirate;
    p.box(0, 0.25, 0.05, 2.0, LOW + 1, 16, C.edge, C.edge);
    p.box(0.01, 0.35, 0.05, 1.8, LOW + 3, 12, C.parchment);
    face(p, 0.06, 2.0, LOW + 4, FACES.map, { g: C.island, r: C.path, x: C.path });
    p.box(0.06, 1.15, 0.4, 0.07, LOW + 14, 1, C.blade, C.blade);
    p.box(0.42, 1.1, 0.14, 0.17, LOW + 12, 5, C.hilt, C.hiltTop);
  },
  // a birdhouse, little notes pinned around it
  forest: (p) => {
    const C = M.forest;
    p.box(0, 0.85, 0.6, 0.85, LOW, 13, C.wood, C.woodTop);
    p.box(0, 0.72, 0.72, 1.11, LOW + 13, 3, C.roof, C.roofTop);
    p.box(0, 0.86, 0.72, 0.83, LOW + 16, 3, C.roof, C.roofTop);
    p.box(0, 1.02, 0.72, 0.51, LOW + 19, 2, C.roof, C.roofTop);
    face(p, 0.6, 1.5, LOW + 6, FACES.hole, { h: C.hole });
    p.box(0.6, 1.22, 0.16, 0.06, LOW + 3, 1, C.perch);
    p.box(0, 0.1, 0.03, 0.55, LOW + 5, 8, C.note, C.note);
    p.box(0, 1.95, 0.03, 0.45, LOW + 9, 7, C.note, C.note);
    face(p, 0.03, 0.6, LOW + 7, ['llll', '....', 'lll.'], { l: C.writing });
    face(p, 0.03, 2.35, LOW + 11, ['lll', '...', 'll.'], { l: C.writing });
  },
  // an old terminal on a bracket, green text on its screen
  cellar: (p) => {
    const C = M.cellar;
    p.box(0.1, 0.85, 0.5, 0.7, LOW - 3, 3, C.casingDark, C.casing);
    p.box(0, 0.25, 0.7, 2.0, LOW, 18, C.casing, C.casingTop);
    face(p, 0.7, 2.05, LOW + 3, FACES.terminal, { f: C.casingDark, s: C.screen, l: C.text, c: C.cursor });
    p.box(0.7, 0.4, 0.02, 0.08, LOW + 2, 1, C.led);
  },
};

export const modsObject = (theme: Themed): Design => ({ height: 56, paint: DESIGNS[theme] });
