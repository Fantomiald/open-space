// The furniture of the Tokyo street (tokyo.ts), on the office's footprints and heights (pixel-furniture.ts): black
// lacquer desks with a neon tube along their edge, bar stools, bamboo and cherry trees in bloom, a manga shelf with a
// gashapon machine on top, karaoke booths in red vinyl, kotatsu tables with ramen, paper lanterns on poles, a vending
// machine for the water cooler, a light box for the whiteboard, and a ramen stall for the coffee counter.
import { TOKYO_PALETTE as T } from '../../design/theme-tokyo.ts';
import type { PieceKind } from '../../../shared/room-layout.ts';
import { standing, writeOnBoard, type Design, type Painter } from '../pixel-furniture.ts';
import { tones } from '../pixel-art.ts';
import { glyphRows } from '../wall-art.ts';

const N = T.neon;
/** The desks left of the room glow pink, the others cyan (the lights under them in tokyo.ts match). */
const deskNeon = (x: number) => (x < 10 ? N.pink.colour : N.cyan.colour);

/** A lucky cat waving, its red bib and gold bell, one letter a pixel. */
const LUCKY_CAT = [
  'w......',
  'w.e...e',
  'w.ww.ww',
  'wwwwwww',
  '.wkwkww',
  '.wwnwww',
  '.rrgrr.',
  '.wwwwww',
  '.wwwwww',
];
const CAT_COLOURS = { w: T.catWhite, e: T.catEar, k: T.signBoard, n: T.catEar, r: T.catBib, g: T.gold };

/** A bowl of ramen on a top at `z`: the black bowl and its red rim, broth, noodles, a half egg and nori, chopsticks across. */
function ramen(p: Painter, x: number, y: number, z: number) {
  p.box(x - 0.16, y - 0.13, 0.32, 0.26, z, 2, T.bowl, T.broth);
  p.onFront(y + 0.13, x - 0.16, x + 0.16, z + 1, z + 2, T.bowlRim);
  for (const [u, v] of [[-0.06, -0.02], [0.02, 0.04], [-0.02, 0.06]]) p.pixel(x + u, y + v, z + 2, T.noodles);
  p.pixel(x + 0.07, y - 0.04, z + 2, T.egg);
  p.pixel(x + 0.09, y - 0.02, z + 2, T.eggWhite);
  p.upright(-2, z + 3, T.nori, { x: x - 0.08, y: y - 0.08 });
  for (let along = 0; along < 4; along++) p.pixel(x + 0.12 + along * 0.05, y + 0.1 - along * 0.05, z + 2.5, T.chopsticks);
}

/** The lit front of the vending machine (`paint` takes a column across it and a height): rows of drinks over their buttons. */
function vendingFront(paint: (column: number, z: number, colour: string) => void) {
  for (let row = 0; row < 3; row++) {
    const z = 16 + row * 4;
    for (let column = 0; column < 6; column++) {
      paint(column, z, column % 2 ? T.buttons : T.vendingPanel);
      for (const up of [1, 2]) paint(column, z + up, column % 2 ? T.can[(column + row) % T.can.length] : T.vendingPanel);
    }
  }
}

/** The light box's posts, frame and face (what a click opens: its notes). */
function paintLightBox(p: Painter) {
  for (const x of [0.02, 3.82]) {
    p.box(x, 0.12, 0.16, 0.4, 0, 1.5, T.boardFrame);
    p.box(x + 0.03, 0.27, 0.1, 0.1, 1.5, 43, T.boardFrame);
  }
  p.box(0.1, 0.24, 3.8, 0.1, 13, 32, T.boardFrame);
  p.onFront(0.34, 0.18, 3.82, 15, 43, T.board);
}

export const TOKYO_FURNITURE: Partial<Record<PieceKind, Design>> = {
  // black lacquer on two side panels and a drawer, a neon tube under the front edge; a dark laptop, a cup of noodles, a can
  desk: { height: 22, paint(p, piece) {
    const neon = deskNeon(piece.x);
    for (const x of [0.05, 1.83]) p.box(x, 0.1, 0.12, 0.8, 0, 9, T.lacquer);
    p.box(1.22, 0.15, 0.58, 0.7, 2, 7, T.lacquerLight);
    p.onFront(0.85, 1.35, 1.65, 5, 6, neon);
    p.box(0, 0, 2, 0.95, 9, 2, T.lacquer);
    p.onFront(0.95, 0.04, 1.96, 9, 10, neon);
    // the laptop keeps the office's box: the hand of whoever types is drawn there
    p.box(0.25, 0.2, 0.7, 0.4, 11, 1, T.laptop);
    p.box(0.25, 0.55, 0.7, 0.06, 12, 5, T.laptop);
    p.onFront(0.61, 0.56, 0.64, 14, 15, T.laptopLogo);
    p.box(1.25, 0.32, 0.2, 0.2, 11, 3, T.cupNoodle);
    p.onFront(0.52, 1.25, 1.45, 12, 13, T.cupBand);
    p.box(1.66, 0.22, 0.11, 0.11, 11, 3, T.can[Math.round(piece.x + piece.y) % T.can.length]);
  } },
  // the user's desk: a lacquer block with two neon lines, the laptop, a paper lamp and a lucky cat waving
  bossDesk: { height: 24, paint(p) {
    p.box(0, 0, 3, 0.95, 0, 11, T.lacquer, T.lacquerLight);
    p.onFront(0.95, 0.08, 2.92, 2, 3, N.cyan.colour);
    p.onFront(0.95, 0.08, 2.92, 8, 9, N.pink.colour);
    for (let x = 1.2; x < 1.85; x += 0.15) p.onFront(0.95, x, x + 0.06, 4, 7, T.lacquerLight);
    p.box(1.1, 0.15, 0.8, 0.45, 11, 1, T.laptop);
    p.box(1.1, 0.55, 0.8, 0.06, 12, 5, T.laptop);
    p.onFront(0.61, 1.45, 1.55, 14, 15, T.laptopLogo);
    p.box(2.66, 0.1, 0.26, 0.26, 11, 6, T.paper);
    p.box(2.64, 0.08, 0.3, 0.3, 17, 1, T.lanternCap);
    p.box(2.05, 0.5, 0.45, 0.3, 11, 1, T.cupNoodle);
    standing(p, LUCKY_CAT, CAT_COLOURS, { x: 0.45, y: 0.45 }, 11);
  } },
  // a bar stool: a chrome post on its foot, a ring for the feet, a round red seat
  chair: { height: 16, paint(p) {
    p.box(0.33, 0.33, 0.34, 0.34, 0, 1, T.chrome);
    p.box(0.46, 0.46, 0.08, 0.08, 1, 4, T.chrome);
    p.box(0.36, 0.36, 0.28, 0.28, 2.5, 0.5, T.chrome);
    p.box(0.28, 0.28, 0.44, 0.44, 4.5, 1, T.chrome);
    p.ball(0.5, 0.5, 6.5, 4.5, 2.4, T.vinyl);
  } },
  // bamboo in a black planter of white pebbles
  plant: { height: 34, paint(p) {
    p.shadow(0.5, 0.5, 5, 2.5);
    p.box(0.24, 0.24, 0.52, 0.52, 0, 7, T.planter);
    p.box(0.27, 0.27, 0.46, 0.46, 7, 0.5, T.pebbles);
    for (const [x, y, height] of [[0.35, 0.4, 22], [0.55, 0.32, 26], [0.45, 0.58, 18], [0.62, 0.55, 23]] as const) {
      p.box(x, y, 0.07, 0.07, 7.5, height, T.bamboo);
      for (let z = 12; z < 7.5 + height; z += 5) p.box(x, y, 0.07, 0.07, z, 0.5, T.bambooKnot);
      p.ball(x + 0.03, y + 0.03, 7.5 + height, 3, 2, T.bambooLeaves);
    }
    for (const [across, z] of [[-4, 24], [-5, 23], [4, 27], [5, 26], [3, 18], [-3, 20]] as const) p.upright(across, z, T.bambooLight);
  } },
  // a cherry tree in bloom (its petals fall, see tokyo.ts), in a black planter
  bigPlant: { height: 46, paint(p) {
    p.shadow(0.5, 0.5, 9, 4);
    p.box(0.2, 0.2, 0.6, 0.6, 0, 6, T.planter);
    p.box(0.23, 0.23, 0.54, 0.54, 6, 0.5, T.pebbles);
    p.box(0.44, 0.44, 0.12, 0.12, 6.5, 16, T.bark);
    p.box(0.3, 0.5, 0.16, 0.07, 18, 2, T.bark);
    p.box(0.55, 0.32, 0.07, 0.16, 20, 2, T.bark);
    // clusters of blossom, darker underneath, lit on top
    p.ball(0.5, 0.5, 29, 6.5, 6, T.blossomDark);
    for (const [x, y, z, wide, high] of [[0.34, 0.62, 28, 4, 4], [0.66, 0.36, 29, 4, 4], [0.62, 0.6, 26, 3.5, 3], [0.36, 0.36, 32, 4, 4], [0.5, 0.5, 34, 5, 4], [0.58, 0.44, 37, 3.5, 3], [0.42, 0.56, 36, 3.5, 3]] as const) p.ball(x, y, z, wide, high, T.blossom);
    for (const [x, y, z] of [[0.3, 0.32, 34.5], [0.5, 0.5, 37], [0.72, 0.3, 31], [0.28, 0.66, 30]] as const) p.ball(x - 0.05, y - 0.05, z, 2.2, 1.6, T.blossomLight);
    for (const [across, z] of [[-5, 28], [5, 31], [-3, 34], [4, 36], [-4, 33], [6, 27], [0, 25], [-6, 30]] as const) p.upright(across, z, T.blossomLight);
    for (const [x, y] of [[0.1, 0.9], [0.85, 0.75], [0.95, 0.2]]) p.pixel(x, y, 0, T.petal);
  } },
  // a shelf of manga, their white bands near the top, a violet tube at its foot, a gashapon machine on it
  bookshelf: { height: 36, paint(p) {
    p.box(0, 0, 2, 0.6, 0, 24, T.lacquer);
    for (const shelf of [8, 16]) p.onFront(0.6, 0.05, 1.95, shelf, shelf + 1, T.lacquerLight);
    p.onFront(0.6, 0.05, 1.95, 0.5, 1.5, N.violet.colour);
    let index = 0;
    for (const [fromZ, toZ] of [[2, 7.5], [9, 15.5], [17, 23.5]]) {
      for (let x = 0.08; x < 1.88; x += 0.15) {
        const height = toZ - fromZ - (index * 5) % 2;
        const colour = T.manga[(index * 3) % T.manga.length];
        p.onFront(0.6, x, x + 0.13, fromZ, fromZ + height, colour);
        p.onFront(0.6, x, x + 0.13, fromZ + height - 2, fromZ + height - 1, colour === T.manga[7] ? T.manga[0] : T.mangaBand);
        index++;
      }
    }
    p.box(1.55, 0.15, 0.32, 0.32, 24, 5, T.gashapon);
    p.onFront(0.47, 1.62, 1.8, 25, 27, T.lacquer);
    p.ball(1.71, 0.31, 32, 3, 3, T.gashaponDome);
    for (const [across, z, colour] of [[-1, 30, 0], [1, 31, 1], [0, 33, 2], [-2, 32, 3], [2, 30, 2]] as const) p.upright(across, z, T.capsules[colour], { x: 1.71, y: 0.31 });
  } },
  // a karaoke booth against the left wall: red vinyl, buttoned back, a black base with a pink tube along it
  sofa: { height: 20, paint(p, { depth }) {
    p.box(0.05, 0, 0.9, depth, 0, 3, T.lacquer);
    p.onSide(0.95, 0.05, depth - 0.05, 1, 2, N.pink.colour);
    const seat = (depth - 0.22) / depth;
    for (let index = 0; index < depth; index++) {
      const y = 0.22 + index * seat;
      p.box(0.35, y, 0.6, seat - 0.02, 3, 4, T.vinyl);
      p.box(0.08, y, 0.27, seat - 0.02, 3, 10, T.vinyl);
      for (let row = 0; row < 2; row++) for (let column = 0; column < 3; column++) p.pixel(0.35, y + 0.18 + column * 0.28 + row * 0.14, 8 + row * 3, T.vinylButton);
    }
    p.box(0.05, 0, 0.9, 0.22, 3, 9, T.vinyl, T.vinylDark);
  } },
  sofaArm: { height: 14, paint(p) {
    p.box(0.05, 0, 0.9, 0.22, 0, 3, T.lacquer);
    p.box(0.05, 0, 0.9, 0.22, 3, 9, T.vinyl, T.vinylDark);
  } },
  // the same booth facing the viewer
  couch: { height: 20, paint(p, { width }) {
    p.box(0, 0.05, width, 0.9, 0, 3, T.lacquer);
    p.onFront(0.95, 0.05, width - 0.05, 1, 2, N.pink.colour);
    for (let index = 0; index < width; index++) {
      p.box(index + 0.04, 0.08, 0.92, 0.27, 3, 10, T.vinyl);
      p.box(index + 0.04, 0.35, 0.92, 0.6, 3, 4, T.vinyl);
      for (let row = 0; row < 2; row++) for (let column = 0; column < 3; column++) p.pixel(index + 0.2 + column * 0.28 + row * 0.14, 0.35, 8 + row * 3, T.vinylButton);
    }
    p.box(0, 0.05, 0.2, 0.9, 3, 9, T.vinyl, T.vinylDark);
  } },
  couchArm: { height: 14, paint(p) {
    p.box(0, 0.05, 0.2, 0.9, 0, 3, T.lacquer);
    p.box(0, 0.05, 0.2, 0.9, 3, 9, T.vinyl, T.vinylDark);
  } },
  // a kotatsu: its quilt hanging under a wooden top, ramen on it and a bowl of mandarins
  lowTable: { height: 14, paint(p, { width, depth }) {
    p.box(0.06, 0.06, width - 0.12, depth - 0.12, 0, 6, T.kotatsuQuilt);
    for (let x = 0.2; x < width - 0.1; x += 0.25) for (const z of [1.5, 4]) p.pixel(x + (z > 2 ? 0.12 : 0), depth - 0.06, z, T.kotatsuPattern);
    for (let y = 0.2; y < depth - 0.1; y += 0.25) for (const z of [1.5, 4]) p.pixel(width - 0.06, y + (z > 2 ? 0.12 : 0), z, T.kotatsuPattern);
    p.box(0, 0, width, depth, 6, 1, T.kotatsuTop);
    const wide = width >= depth;
    ramen(p, 0.5, wide ? 0.45 : 0.5, 7);
    const mandarins = wide ? { x: 0.9, y: 0.7 } : { x: 0.5, y: 1.45 };
    p.box(mandarins.x - 0.12, mandarins.y - 0.1, 0.24, 0.2, 7, 1, T.cupNoodle);
    for (const [u, v, z] of [[-0.05, 0, 9], [0.06, -0.02, 9], [0, 0.04, 10.5]] as const) p.ball(mandarins.x + u, mandarins.y + v, z, 1.5, 1.3, T.mikan);
  } },
  // a squat red paper lantern on a short post, low enough to stay below whoever sits behind it
  floorLamp: { height: 20, paint(p) {
    p.shadow(0.5, 0.5, 4, 2);
    p.box(0.34, 0.34, 0.32, 0.32, 0, 1.5, T.pole);
    p.box(0.47, 0.47, 0.06, 0.06, 1.5, 3, T.pole);
    p.box(0.4, 0.4, 0.2, 0.2, 4.5, 1.5, T.lanternCap);
    p.ball(0.5, 0.5, 10, 4.5, 5, T.lantern);
    for (const z of [7, 10, 13]) for (let across = -3; across <= 3; across++) if (Math.abs(across) < 4 - Math.abs(z - 10) / 2) p.upright(across, z, T.lanternRib);
    for (const z of [8, 10, 12]) p.upright(-1, z, T.lanternLit);
    p.box(0.4, 0.4, 0.2, 0.2, 15, 1.5, T.lanternCap);
  } },
  // a vending machine: drinks lit behind glass (they glow at night, see tokyo.ts), its slots, a red header
  cooler: { height: 36, paint(p) {
    p.shadow(0.5, 0.55, 6, 3);
    p.box(0.12, 0.15, 0.76, 0.77, 0, 32, T.vending);
    p.onFront(0.92, 0.15, 0.85, 14, 29, T.vendingPanel);
    vendingFront((column, z, colour) => p.pixel(0.17 + column / 8, 0.92, z, colour));
    p.onFront(0.92, 0.15, 0.85, 29.5, 31.5, N.red.colour);
    p.onFront(0.92, 0.6, 0.8, 8, 12, T.vendingDark);
    p.onFront(0.92, 0.2, 0.55, 2, 5, T.vendingDark);
    p.onSide(0.88, 0.25, 0.85, 22, 24, N.cyan.colour);
    p.onSide(0.88, 0.25, 0.85, 18, 19, N.pink.colour);
  } },
  // a light box on two posts, a pink tube around it, its sign on top (the notes stay where the whiteboard's are)
  whiteboard: { height: 68, paint(p) {
    paintLightBox(p);
    p.box(1.3, 0.24, 1.4, 0.1, 45, 9, T.boardFrame);
  }, fine(p, _piece, board) {
    writeOnBoard(p, board);
    for (const [fromZ, toZ, fromX, toX] of [[43, 44, 0.16, 3.84], [14, 15, 0.16, 3.84], [14, 44, 0.16, 0.18], [14, 44, 3.82, 3.84]] as const) {
      for (let x = fromX; x <= toX; x += 0.125) for (let z = fromZ; z < toZ; z++) p.pixel(x, 0.34, z, N.pink.colour);
    }
    const word = glyphRows('MEMO');
    for (const [line, row] of word.entries()) [...row].forEach((letter, column) => { if (letter === '#') p.pixel(1.4 + (column + 0.5) / 8, 0.34, 51 - line, N.cyan.colour); });
  }, clickable: paintLightBox },
  // a ramen stall: a wooden counter, the stock pot on its stove and two bowls (the steam rises from them), sake, a
  // roof on two posts with lanterns at its corners and a short noren
  counter: { height: 46, paint(p) {
    for (const x of [0.02, 2.9]) p.box(x, 0.12, 0.08, 0.08, 12, 26, T.pole);
    p.box(0, 0.1, 3, 0.85, 0, 11, T.counterWood);
    for (let x = 0.3; x < 3; x += 0.3) p.onFront(0.95, x, x + 0.03, 1, 10, T.counterDark);
    p.box(-0.02, 0.08, 3.04, 0.89, 11, 1, T.counterDark);
    p.box(0.25, 0.25, 0.6, 0.5, 12, 2, T.stove);
    p.onFront(0.75, 0.35, 0.75, 12.5, 13.5, T.flame);
    p.box(0.3, 0.3, 0.5, 0.4, 14, 6, T.pot, T.broth);
    for (const x of [1.2, 1.45]) {
      p.box(x, 0.5, 0.14, 0.14, 12, 3, T.bowl, T.broth);
      p.onFront(0.64, x, x + 0.14, 14, 15, T.bowlRim);
    }
    p.box(2.15, 0.35, 0.13, 0.13, 12, 6, T.sake);
    p.onFront(0.48, 2.15, 2.28, 14, 16, T.sakeLabel);
    p.box(2.18, 0.38, 0.07, 0.07, 18, 2, T.sake);
    for (const x of [2.4, 2.55]) p.box(x, 0.5, 0.08, 0.08, 12, 1.5, T.sake);
    p.box(2.7, 0.3, 0.12, 0.12, 12, 3, T.counterDark);
    // the roof: its eaves over the counter, a ridge, and a lit sign along it
    p.box(-0.12, -0.05, 3.24, 1.1, 38, 1.5, T.roof, tones(T.roof).light);
    p.box(0.1, 0.25, 2.8, 0.5, 39.5, 1.5, tones(T.roof).dark);
    p.box(0.2, 0.42, 2.6, 0.12, 41, 5, T.board);
    const panel = 0.9;
    for (let index = 0; index < 3; index++) p.onFront(1.05, 0.15 + index * panel + 0.03, 0.15 + (index + 1) * panel - 0.03, 33, 38, T.lantern);
    for (const x of [0.05, 2.95]) {
      p.ball(x, 1.05, 34, 2, 2.6, T.lantern);
      p.pixel(x, 1.05, 34, T.lanternLit);
    }
  }, fine(p) {
    // the stall's crest on its middle panel: a bowl with chopsticks
    const bowl = ['....#.#', '...#.#.', '#######', '.#####.', '..###..'];
    for (const [line, row] of bowl.entries()) [...row].forEach((letter, column) => { if (letter === '#') p.pixel(1.5 + (column - 3) / 8, 1.05, 37 - line, T.norenCrest); });
    // ramen, in red on the lit sign of the roof
    const word = glyphRows('RAMEN');
    for (const [line, row] of word.entries()) [...row].forEach((letter, column) => { if (letter === '#') p.pixel(0.32 + (column + 0.5) / 8, 0.54, 45 - line, T.lantern); });
  } },
};
