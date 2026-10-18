// What the office's whiteboard shows (it is drawn in pixel-furniture.ts, and a click on it opens its notes): a few
// scribbled lines on an ordinary day, "HBD <first name> !!" at a birthday of the crew (balloons tied to it), and
// doodles that fit the other festivals. Pure, so the tests read it without a browser.
import type { Festival } from '../../shared/festivals.ts';

/** The board's writing surface, in art pixels: columns along it (8 a tile) and rows up. */
export const BOARD = { columns: 28, rows: 24 };
/** A letter of the wall font (wall-art.ts) takes 3 columns and a gap, 5 rows; lines of words are 2 rows apart. */
const LETTER = 4;
export const LINE_HEIGHT = 7;
export const lettersPerLine = Math.floor((BOARD.columns + 1) / LETTER);

/**
 * Small marker drawings, one letter a pixel: k black, b blue, r red, g green, y yellow, o orange, t brown (the colours
 * are in pixel-furniture.ts); a dot is the white of the board.
 */
export const DOODLES = {
  pumpkin: ['....g....', '...g.....', '.ooooooo.', 'ooooooooo', 'oo.ooo.oo', 'ooooooooo', 'oo.....oo', '.ooooooo.'],
  ghost: ['..kkk..', '.k...k.', 'k.k.k.k', 'k.....k', 'k.....k', 'k.....k', 'k.k.k.k', 'kk.k.kk'],
  tree: ['....y....', '...ggg...', '..ggggg..', '...ggg...', '..ggrgg..', '.ggggggg.', '..ggggg..', '.ggggrgg.', 'ggggggggg', '....t....', '....t....'],
  star: ['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'],
  lantern: ['...k...', '..yyy..', '.rrrrr.', 'rr.r.rr', 'rr.r.rr', 'rr.r.rr', '.rrrrr.', '..yyy..', '...y...', '..y.y..'],
  drop: ['..b..', '.bbb.', '.bbb.', 'bbbbb', 'bb.bb', '.bbb.'],
  tricolour: ['kkkkkkkkkkkk', 'bbbb....rrrr', 'bbbb....rrrr', 'bbbb....rrrr', 'bbbb....rrrr', 'bbbb....rrrr', 'kkkkkkkkkkkk'],
  heart: ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  crown: ['y...y...y', 'yy.yyy.yy', 'yyyyyyyyy', 'yyryyybyy', 'yyyyyyyyy'],
  crepe: ['.kkkkk.....', 'kyyyyyk....', 'kyyyyykkkkk', 'kyyyyyk....', '.kkkkk.....'],
  egg: ['.bbb.', 'bbbbb', 'rrrrr', 'bbbbb', 'bbbbb', '.bbb.'],
  lily: ['..k.k.', '.k.g.k', 'k..g..', '...g.k', '..gg..', '.g.g..', 'g..g..', '...g..'],
  note: ['..kk', '..kk', '..k.', '..k.', 'kkk.', 'kkk.'],
  sun: ['...y.y.y...', '.y.......y.', '....ooo....', 'y..ooooo..y', '..ooooooo..', 'y.ooooooo.y', '..ooooooo..', 'y..ooooo..y', '....ooo....', '.y.......y.', '...y.y.y...'],
  firework: ['....r....', '.r..r..r.', '..r.r.r..', '...rrr...', 'rrrr.rrrr', '...rrr...', '..r.r.r..', '.r..r..r.', '....r....'],
} as const satisfies Record<string, readonly string[]>;
export type Doodle = keyof typeof DOODLES;

/** Doodles side by side are this many columns apart. */
export const DOODLE_GAP = 2;

export type BoardContent =
  | { kind: 'notes' }
  /** lines of words in the wall font, capitals only; balloons are tied to the board */
  | { kind: 'birthday'; lines: string[] }
  | { kind: 'doodles'; doodles: Doodle[] };

const FESTIVAL_DOODLES: Readonly<Record<Exclude<Festival, 'birthday'>, readonly Doodle[]>> = {
  newYear: ['firework', 'star', 'firework'],
  epiphany: ['crown'],
  chineseNewYear: ['lantern', 'lantern'],
  candlemas: ['crepe'],
  valentine: ['heart', 'heart'],
  songkran: ['drop', 'drop', 'drop'],
  easter: ['egg', 'egg', 'egg'],
  mayDay: ['lily', 'lily'],
  music: ['note', 'note', 'note'],
  bastille: ['tricolour'],
  summer: ['sun'],
  halloween: ['ghost', 'pumpkin'],
  christmas: ['tree', 'star'],
};

/** A name as the wall font writes it: capitals without accents, what it cannot write left out. */
const plain = (name: string) => name.toUpperCase().normalize('NFD').replace(/[^A-Z0-9 -]/g, '').replace(/\s+/g, ' ').trim();

/** "HBD", then the first name with "!!" on its line when it fits, or below it; a long name is cut to the board. */
export function birthdayLines(guests: readonly string[]): string[] {
  const name = plain(guests[0] ?? '').slice(0, lettersPerLine).trim();
  if (!name) return ['HBD !!'];
  return `${name} !!`.length <= lettersPerLine ? ['HBD', `${name} !!`] : ['HBD', name, '!!'];
}

/** What the board shows on a day: the festival's (and who it is for), or notes. */
export function boardContent(festival: Festival | null, guests: readonly string[]): BoardContent {
  if (!festival) return { kind: 'notes' };
  if (festival === 'birthday') return { kind: 'birthday', lines: birthdayLines(guests) };
  return { kind: 'doodles', doodles: [...FESTIVAL_DOODLES[festival]] };
}

/** How many columns a line of words or a row of doodles takes. */
export const textWidth = (text: string) => text.length * LETTER - 1;
export const doodlesWidth = (doodles: readonly Doodle[]) => doodles.reduce((sum, doodle) => sum + DOODLES[doodle][0].length, 0) + DOODLE_GAP * (doodles.length - 1);
