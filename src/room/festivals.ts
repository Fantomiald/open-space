// How the rooms dress up for a festival (shared/festivals.ts), beyond the furniture it adds (shared/room-layout.ts):
// what is painted on the walls and the floor (once, with the backdrop), the lights that glow at night, and what moves
// (twinkling bulbs, snow and fireworks in the windows, notes, hearts, water). The office and the break room do not wear
// the same walls, so going from one to the other changes the view.
import { ROOM_PALETTE } from '../design/room-palette.ts';
import type { Festival } from '../../shared/festivals.ts';
import { ROOM, type FurniturePiece, type Layout } from '../../shared/room-layout.ts';
import { MOON, PAINT as HALLOWEEN_PAINT, PUMPKIN, halloweenBulbs, paintHalloweenWalls, type Room } from './halloween.ts';
import { toScreen, type Point } from './geometry.ts';
import type { Lighting } from './lighting.ts';
import { ART_SCALE, fillPolygon, toArt } from './pixel-art.ts';
import { hash } from './sprites.ts';
import { WALL, bunting, disc, line, onWall, onWallAt, roomPointOnWall, sagging, textLength, wallText, type Context, type Wall } from './wall-art.ts';
import { WINDOW_GLASS } from './backdrop.ts';

export type { Room };
const F = ROOM_PALETTE.festive;

/** A light of the night (see draw.ts): where, how far it reaches in room pixels, its colour and strength (0 to 1). */
export interface Glow { at: Point; radius: number; colour: string; strength: number }

/* Sprites painted on the walls, one letter a pixel */

const WREATH = [
  '...ggggg...',
  '..gGgggGg..',
  '.gg.....gg.',
  'gGg.....gGg',
  'gg.......gg',
  'gg.......gg',
  'gGg.....gGg',
  '.gg..r..gg.',
  '..ggrrrgg..',
  '...rrrrr...',
  '..rr...rr..',
];
const STOCKING = [
  'wwwww',
  'wwwww',
  '.rrr.',
  '.rrr.',
  '.rrr.',
  '.rrrr',
  '.rrrrr',
  '..rrrr',
];
const SNOWFLAKE = ['..w..', 'w.w.w', '.www.', 'w.w.w', '..w..'];
const STAR = ['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'];
const CROWN = [
  'y...y...y',
  'yy.yyy.yy',
  'yyyyyyyyy',
  'yyryyybyy',
  'yyyyyyyyy',
];
const LANTERN = [
  '..yyy..',
  '.rrrrr.',
  'rrdrdrr',
  'rrdrdrr',
  'rrdrdrr',
  'rrdrdrr',
  '.rrrrr.',
  '..yyy..',
  '...y...',
  '..y.y..',
];
const FU = [
  '.....y.....',
  '....yry....',
  '...yrrry...',
  '..yrryrry..',
  '.yrryyyrry.',
  'yrrryryrrry',
  '.yrryyyrry.',
  '..yrryrry..',
  '...yrrry...',
  '....yry....',
  '.....y.....',
];
const HEART = ['.hh.hh.', 'hhhhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...'];
const BIG_HEART = [
  '..hhh...hhh..',
  '.hhhhh.hhhhh.',
  'hhwhhhhhhhhhh',
  'hwhhhhhhhhhhh',
  'hhhhhhhhhhhhh',
  '.hhhhhhhhhhh.',
  '..hhhhhhhhh..',
  '...hhhhhhh...',
  '....hhhhh....',
  '.....hhh.....',
  '......h......',
];
const NOTE = ['..nn', '..nn', '..n.', '..n.', 'nnn.', 'nnn.'];
const DOUBLE_NOTE = ['.nnnnn', '.n...n', '.n...n', '.n...n', 'nn..nn', 'nn..nn'];
const GUITAR = [
  '.......kk',
  '......kk.',
  '.....k...',
  '....k....',
  '..oo.....',
  '.oooo....',
  'oookoo...',
  'oookooo..',
  '.ooooo...',
  '..ooo....',
];
const FLAG = [
  'bbbbwwwwrrrr',
  'bbbbwwwwrrrr',
  'bbbbwwwwrrrr',
  'bbbbwwwwrrrr',
  'bbbbwwwwrrrr',
  'bbbbwwwwrrrr',
  'bbbbwwwwrrrr',
];
const SUN = [
  '...y.y.y...',
  '.y.......y.',
  '....ooo....',
  'y..ooooo..y',
  '..ooooooo..',
  'y.ooooooo.y',
  '..ooooooo..',
  'y..ooooo..y',
  '....ooo....',
  '.y.......y.',
  '...y.y.y...',
];
const PALM = [
  '.gg...gg.',
  'gggg.gggg',
  'g..ggg..g',
  '...gtg...',
  '....t....',
  '....t....',
  '...t.....',
  '...t.....',
  '...t.....',
  '..ttt....',
];
const BUNNY = [
  '.w...w.',
  '.wp.pw.',
  '.wp.pw.',
  '.ww.ww.',
  '.wwwww.',
  'wwkwkww',
  'wwwpwww',
  '.wwwww.',
  'wwwwwww',
  'wwwwwww',
  '.wwwww.',
];
const LILY = [
  '..w.w.',
  '.w.g.w',
  'w..g..',
  '...g.w',
  '..gg..',
  '.g.g..',
  'g..g..',
  '...g..',
];
const PAN = [
  '..ccccc.......',
  '.cyyyyyc......',
  'cyyyyyyyc.....',
  'cyyyyyyyckkkkk',
  'cyyyyyyyc.....',
  '.cyyyyyc......',
  '..ccccc.......',
];
const PAINT: Record<string, string> = {
  g: F.pine, G: F.green, r: F.red, w: F.white, y: F.gold, b: F.tricolor[0], d: F.potRed, h: F.heart, n: F.note, k: F.black,
  o: F.kumquat, t: F.trunk, p: F.earInside, c: F.speakerCone,
};

/** A bulb hung on a wall: where along it and how high, and its colour. */
interface Bulb { wall: Wall; along: number; z: number; colour: string }

/** A sagging wire with bulbs at each low point and hook. */
function bulbGarland(wall: Wall, from: number, to: number, z: number, colours: readonly string[]): Bulb[] {
  const bulbs: Bulb[] = [];
  for (let index = 0; from + index * 0.5 <= to; index++) bulbs.push({ wall, along: from + index * 0.5, z: z - (index % 2 ? 2 : 0), colour: colours[index % colours.length] });
  return bulbs;
}

/** The bulbs of a festival in a room: painted with the walls, lit at night, twinkling. */
function bulbsOf(festival: Festival, room: Room): Bulb[] {
  switch (festival) {
    case 'christmas': return room === 'office' ? bulbGarland('back', 0.4, ROOM.width - 0.4, WALL - 4, F.bulbs) : bulbGarland('left', 0.4, 8.6, WALL - 4, F.bulbs);
    case 'newYear': return room === 'office' ? bulbGarland('left', 0.4, 8.6, WALL - 4, [F.gold, F.silver]) : bulbGarland('back', 0.4, ROOM.width - 0.4, WALL - 4, [F.gold, F.silver]);
    case 'birthday': return room === 'lounge' ? bulbGarland('left', 0.4, 8.6, WALL - 6, F.balloons) : [];
    case 'songkran': return bulbGarland(room === 'office' ? 'left' : 'back', 0.4, room === 'office' ? 8.6 : ROOM.width - 0.4, WALL - 3, F.bulbs);
    default: return [];
  }
}

/** Red lanterns along the back wall for the Chinese New Year: where they hang, in tiles along it. */
const LANTERNS: Readonly<Record<Room, readonly number[]>> = { office: [0.4, 6.0, 12.0, 13.7, 19.2], lounge: [0.4, 6.4, 9.5, 13.1, 19.2] };
const LANTERN_TOP = WALL - 6;

function paintBulbs(context: Context, bulbs: readonly Bulb[]) {
  bulbs.forEach((bulb, index) => { if (index && bulbs[index - 1].wall === bulb.wall) line(context, onWallAt(bulb.wall, bulbs[index - 1].along, bulbs[index - 1].z + 1), onWallAt(bulb.wall, bulb.along, bulb.z + 1), F.black); });
  for (const { wall, along, z, colour } of bulbs) { const at = onWallAt(wall, along, z); context.fillStyle = colour; context.fillRect(Math.round(at.x), Math.round(at.y), 2, 2); }
}

/** A banner of words above the back wall's windows, centred on `middle` (in tiles). */
function banner(context: Context, text: string, middle: number, ink: string, ribbon: string) {
  wallText(context, text, 'back', middle - textLength(text) / 2, WALL - 8, ink, ribbon);
}

/** The year a New Year's banner wishes a good one for: the coming one on December 31. */
const newYear = () => { const now = new Date(); return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear(); };

/** The longest banner the back wall holds above its windows, in tiles. */
const BANNER_TILES = 18.5;

/** The birthday wishes on a banner: with the names of whose birthday it is when they fit. */
export function birthdayWish(guests: readonly string[], greeting = 'JOYEUX ANNIVERSAIRE', room = BANNER_TILES): string {
  const names = guests.length > 1 ? `${guests.slice(0, -1).join(' ')} ET ${guests.at(-1)}` : guests[0] ?? '';
  for (const text of [`${greeting} ${names}`, `${greeting} ${guests[0] ?? ''}`]) if (textLength(text.trim()) <= room) return text.trim();
  return greeting;
}

/** What a festival paints on the walls of a room, at art resolution, over the backdrop's walls. `guests`: who the day is for. */
export function paintFestivalWalls(context: Context, festival: Festival, room: Room, guests: readonly string[] = []) {
  const office = room === 'office';
  switch (festival) {
    case 'halloween': paintHalloweenWalls(context, room); return;
    case 'christmas':
      if (office) {
        onWall(context, WREATH, PAINT, 'left', 3.2, 22);
        for (const [y, z] of [[1.4, 34], [6.2, 38], [7.6, 24]] as const) onWall(context, SNOWFLAKE, PAINT, 'left', y, z);
      } else {
        // stockings hanging from a shelf above the sofa
        line(context, onWallAt('left', 1.6, 40), onWallAt('left', 7.6, 40), F.trunk);
        for (const y of [2, 3.6, 5.2, 6.8]) onWall(context, STOCKING, PAINT, 'left', y, 31);
        for (const [x, z] of [[3.2, 42], [16.6, 43]] as const) onWall(context, SNOWFLAKE, PAINT, 'back', x, z);
      }
      break;
    case 'newYear':
      if (office) {
        banner(context, `BONNE ANNEE ${newYear()}`, 10, F.gold, F.black);
        for (const [y, z] of [[2, 36], [5.4, 30], [7.4, 40]] as const) onWall(context, STAR, PAINT, 'left', y, z);
      } else {
        bunting(context, 'left', 0.5, 8.5, WALL - 3, [F.gold, F.silver, F.black], F.goldDark);
      }
      break;
    case 'epiphany':
      if (office) {
        onWall(context, CROWN, PAINT, 'left', 4, 30);
        for (const [y, z] of [[2, 38], [6.6, 40], [7.6, 22]] as const) onWall(context, STAR, PAINT, 'left', y, z);
      } else {
        banner(context, 'VIVE LES ROIS', 10, F.gold, F.blue);
      }
      break;
    case 'chineseNewYear':
      for (const along of LANTERNS[room]) {
        line(context, onWallAt('back', along + 3 / 8, WALL), onWallAt('back', along + 3 / 8, LANTERN_TOP), F.gold);
        onWall(context, LANTERN, PAINT, 'back', along, LANTERN_TOP - LANTERN.length);
      }
      if (office) {
        // red couplets on either side of the door
        for (const y of [8.2, 10.6]) for (let z = 8; z < 34; z++) for (let column = 0; column < 4; column++) {
          const at = onWallAt('left', y + column / 8, z);
          context.fillStyle = (z % 6 === 3 && column > 0 && column < 3) ? F.gold : F.envelope;
          context.fillRect(Math.round(at.x), Math.round(at.y), 1, 1);
        }
        onWall(context, FU, PAINT, 'left', 4, 24);
      } else {
        // strings of firecrackers down the left wall
        for (const y of [2, 4.4, 6.8]) {
          line(context, onWallAt('left', y, WALL - 2), onWallAt('left', y, 18), F.gold);
          for (let z = 20; z < WALL - 4; z += 3) for (const side of [-1, 1]) { const at = onWallAt('left', y + side / 8, z); context.fillStyle = F.red; context.fillRect(Math.round(at.x), Math.round(at.y), 1, 2); }
        }
      }
      break;
    case 'candlemas':
      if (office) bunting(context, 'back', 0.5, ROOM.width - 0.5, WALL - 3, [F.crepe, F.gold, F.crepeDark], F.trunk);
      else bunting(context, 'left', 0.5, 8.5, WALL - 3, [F.crepe, F.gold, F.crepeDark], F.trunk);
      break;
    case 'valentine':
      if (office) {
        const points = sagging(context, 'back', 0.5, ROOM.width - 0.5, WALL - 3, 1.2, 2, F.rose);
        points.forEach((point, index) => { if (index % 2) onWall(context, HEART, { h: index % 4 === 1 ? F.heart : F.pink }, 'back', point.along - 3 / 8, point.z - 6); });
      } else {
        for (const [y, z] of [[1.2, 40], [3.4, 42], [5.6, 40], [7.6, 42]] as const) onWall(context, HEART, { h: y > 3 && y < 6 ? F.heart : F.pink }, 'left', y, z);
      }
      break;
    case 'songkran':
      if (office) { onWall(context, SUN, PAINT, 'left', 4, 30); bunting(context, 'back', 0.5, ROOM.width - 0.5, WALL - 3, [F.red, F.gold, F.blue, F.green, F.pink], F.white); }
      else bunting(context, 'left', 0.5, 8.5, WALL - 6, [F.red, F.gold, F.blue, F.green, F.pink], F.white);
      break;
    case 'easter':
      if (office) bunting(context, 'back', 0.5, ROOM.width - 0.5, WALL - 3, F.eggs, F.white);
      else {
        const points = sagging(context, 'left', 0.5, 8.5, WALL - 3, 1, 2, F.white);
        points.forEach((point, index) => { if (index % 2) disc(context, 'left', point.along, point.z - 3, 2, F.eggs[index % F.eggs.length]); });
      }
      break;
    case 'mayDay':
      if (office) onWall(context, LILY, PAINT, 'left', 4.2, 26);
      else for (const y of [1.2, 3.4, 5.6, 7.6]) onWall(context, LILY, PAINT, 'left', y, 38);
      break;
    case 'music':
      if (office) {
        for (const [y, z, double] of [[1.6, 34, false], [3.0, 40, true], [6.6, 38, false], [7.4, 28, true]] as const) onWall(context, double ? DOUBLE_NOTE : NOTE, PAINT, 'left', y, z);
        onWall(context, GUITAR, PAINT, 'left', 4.2, 20);
        for (const along of [6.0, 12.2]) { disc(context, 'back', along + 0.3, 30, 4, F.black); disc(context, 'back', along + 0.3, 30, 1, F.red); }
      } else {
        for (const [x, z] of [[3.2, 42], [9.8, 44], [16.4, 42]] as const) onWall(context, NOTE, PAINT, 'back', x, z);
      }
      break;
    case 'bastille':
      if (office) { bunting(context, 'back', 0.5, ROOM.width - 0.5, WALL - 3, F.tricolor, F.white); onWall(context, FLAG, { b: F.tricolor[0], w: F.tricolor[1], r: F.tricolor[2] }, 'left', 4, 28); }
      else bunting(context, 'left', 0.5, 8.5, WALL - 3, F.tricolor, F.white);
      break;
    case 'summer':
      if (office) { onWall(context, SUN, PAINT, 'left', 2.4, 30); onWall(context, PALM, PAINT, 'left', 5.8, 18); }
      else bunting(context, 'left', 0.5, 8.5, WALL - 3, [F.gold, F.blue, F.white, F.kumquat], F.white);
      break;
    case 'birthday':
      if (office) {
        banner(context, birthdayWish(guests), 10, F.white, F.rose);
        bunting(context, 'left', 0.5, 8.5, WALL - 3, F.balloons, F.white);
      } else {
        banner(context, birthdayWish(guests, 'BON ANNIV'), 10, F.gold, F.blue);
        for (const [y, z, colour] of [[1.2, 42, 0], [2.6, 44, 1], [6.2, 42, 2], [7.6, 44, 3]] as const) { disc(context, 'left', y, z, 3, F.balloons[colour]); line(context, onWallAt('left', y, z - 3), onWallAt('left', y + 0.1, z - 9), F.white); }
      }
      break;
  }
  paintBulbs(context, bulbsOf(festival, room));
}

/** Confetti on the floor, for the parties. */
export function paintFestivalFloor(context: Context, festival: Festival) {
  if (festival !== 'newYear' && festival !== 'birthday') return;
  for (let index = 0; index < 260; index++) {
    const seed = hash(`confetti${index}`);
    const at = toArt({ x: 0.3 + (seed % 1940) / 100, y: 0.3 + ((seed >>> 11) % 1340) / 100 });
    context.fillStyle = F.confetti[(seed >>> 5) % F.confetti.length];
    context.fillRect(Math.round(at.x), Math.round(at.y), (seed >>> 3) % 2 ? 2 : 1, 1);
  }
}

/* What glows and moves, in room pixels, drawn every frame */

const middleOf = (piece: FurniturePiece) => toScreen({ x: piece.x + piece.width / 2, y: piece.y + piece.depth / 2 });
const upright = (base: Point, across: number, z: number): Point => ({ x: base.x + across * ART_SCALE, y: base.y - z * ART_SCALE });

/** Candle flames on the cakes: positions in room pixels (see candles in pixel-furniture.ts). */
function flames(layout: Layout): Point[] {
  const points: Point[] = [];
  for (const piece of layout.furniture) {
    if (piece.kind === 'partyTable') {
      const base = toScreen({ x: piece.x + 1, y: piece.y + 0.5 });
      for (let index = 0; index < 4; index++) points.push(upright(base, (index - 1.5) * 3, 22));
    }
    if (piece.kind === 'cake') {
      const base = toScreen({ x: piece.x + 1.35, y: piece.y + 0.5 });
      for (let index = 0; index < 3; index++) points.push(upright(base, (index - 1) * 3, (piece.top ?? 0) + 10));
    }
  }
  return points;
}

/** The baubles of the Christmas trees that twinkle (see christmasTree in pixel-furniture.ts). */
const TREE_LIGHTS = [[-11, 16], [10, 18], [-4, 14], [3, 22], [-9, 23], [8, 27], [-3, 26], [6, 33], [-6, 34], [1, 36], [-3, 42], [4, 43], [0, 48], [-12, 20], [12, 13]] as const;

export function festivalGlows(festival: Festival, room: Room, layout: Layout): Glow[] {
  const glows: Glow[] = [];
  const bulbs = festival === 'halloween' ? halloweenBulbs(room) : bulbsOf(festival, room).map((bulb) => ({ at: roomPointOnWall(bulb.wall, bulb.along, bulb.z), colour: bulb.colour }));
  bulbs.forEach(({ at, colour }, index) => { if (index % 3 === 0) glows.push({ at, radius: 40, colour, strength: 0.6 }); });
  for (const piece of layout.furniture) {
    if (piece.kind === 'christmasTree') glows.push({ at: upright(middleOf(piece), 0, 28), radius: 100, colour: F.gold, strength: 0.7 });
    if (piece.kind === 'pool') glows.push({ at: middleOf(piece), radius: 70, colour: F.water, strength: 0.4 });
  }
  if (festival === 'chineseNewYear') for (const along of LANTERNS[room]) glows.push({ at: roomPointOnWall('back', along + 3 / 8, LANTERN_TOP - 5), radius: 46, colour: F.lanternGlow, strength: 0.8 });
  for (const at of flames(layout)) glows.push({ at, radius: 36, colour: F.flame, strength: 0.7 });
  return glows;
}

/** The glass of the windows on the back wall, in tiles along it. */
const windowsOf = (layout: Layout) => layout.wallItems.filter((item) => item.kind === 'window');

function px(context: Context, point: Point, colour: string, size = ART_SCALE) {
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x), Math.round(point.y), size, size);
}

/** Snow falling past the windows. */
function snow(context: Context, layout: Layout, time: number) {
  for (const window of windowsOf(layout)) for (let flake = 0; flake < 16; flake++) {
    const seed = hash(`snow${window.fromX}:${flake}`);
    const span = WINDOW_GLASS.high - WINDOW_GLASS.low - 2;
    const fall = ((time / (55 + seed % 40) + seed) % span);
    const along = window.fromX + 0.1 + ((seed % 100) / 100) * (window.width - 0.2) + Math.sin(time / 900 + seed) * 0.08;
    px(context, roomPointOnWall('back', along, WINDOW_GLASS.high - 1 - fall), F.snow, seed % 3 ? 2 : 1);
  }
}

/** Fireworks bursting over the city, in the windows, at night. */
function fireworks(context: Context, layout: Layout, time: number, lighting: Lighting) {
  if (lighting.stars < 0.3) return;
  context.globalAlpha = Math.min(1, lighting.stars);
  windowsOf(layout).forEach((window, index) => {
    const period = 1700 + index * 230;
    const round = Math.floor((time + index * 600) / period);
    const t = ((time + index * 600) % period) / period;
    const seed = hash(`burst${window.fromX}:${round}`);
    const centre = roomPointOnWall('back', window.fromX + 0.5 + ((seed % 100) / 100) * (window.width - 1), 28 + (seed >>> 8) % 7);
    const colour = F.bulbs[(seed >>> 4) % F.bulbs.length];
    if (t < 0.25) { px(context, { x: centre.x, y: centre.y + (0.25 - t) * 70 }, F.flame); return; }
    const spread = (t - 0.25) / 0.75;
    context.globalAlpha = Math.min(1, lighting.stars) * (1 - spread);
    for (let ray = 0; ray < 12; ray++) {
      const angle = (ray / 12) * Math.PI * 2;
      px(context, { x: centre.x + Math.cos(angle) * spread * 16, y: centre.y + Math.sin(angle) * spread * 12 + spread * spread * 4 }, ray % 2 ? colour : F.white);
    }
  });
  context.globalAlpha = 1;
}

/** A tiny sprite in room pixels, one art pixel a letter. */
function sprite(context: Context, rows: readonly string[], at: Point, colour: string) {
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => { if (letter !== '.' && letter !== ' ') px(context, { x: at.x + column * ART_SCALE, y: at.y + line * ART_SCALE }, colour); });
}
const SMALL_HEART = ['h.h', 'hhh', '.h.'];
const SMALL_NOTE = ['.n', '.n', 'nn'];

/** Things rising from a point and fading as they go: notes from the speakers, hearts from the roses. */
function rising(context: Context, from: Point, rows: readonly string[], colour: string, time: number, seed: number, count: number) {
  for (let index = 0; index < count; index++) {
    const age = ((time / 2600) + index / count + (seed % 100) / 100) % 1;
    context.globalAlpha = 1 - age;
    sprite(context, rows, { x: from.x + Math.sin(age * 6 + index * 2) * 8 - 3, y: from.y - age * 46 }, colour);
  }
  context.globalAlpha = 1;
}

/** A jet of water from someone to someone else, its drops along an arc, splashing where it lands. */
function waterJet(context: Context, from: Point, to: Point, progress: number) {
  const height = 26 + Math.abs(to.x - from.x) * 0.15;
  const at = (t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - height * 4 * t * (1 - t) });
  for (let drop = 0; drop < 14; drop++) {
    const t = progress - drop * 0.028;
    if (t < 0 || t > 1) continue;
    px(context, at(t), drop % 3 ? F.squirt : F.waterLight, drop < 6 ? 3 : 2);
  }
  if (progress > 0.95) for (let drop = 0; drop < 6; drop++) {
    const angle = Math.PI + (drop / 5) * Math.PI;
    const spread = (progress - 0.95) * 200;
    px(context, { x: to.x + Math.cos(angle) * spread, y: to.y + Math.sin(angle) * spread * 0.6 }, F.waterLight);
  }
}

export interface EffectContext {
  festival: Festival;
  room: Room;
  layout: Layout;
  time: number;
  lighting: Lighting;
  /** the heads of everyone in the room, in room pixels: who the water flies between (the user first) */
  heads: readonly Point[];
}

/** What moves for a festival, drawn after the light of the hour so it shines in the dark. */
export function paintFestivalEffects(context: Context, { festival, room, layout, time, lighting, heads }: EffectContext) {
  const bulbs = festival === 'halloween' ? halloweenBulbs(room) : bulbsOf(festival, room).map((bulb) => ({ at: roomPointOnWall(bulb.wall, bulb.along, bulb.z), colour: bulb.colour }));
  bulbs.forEach(({ at, colour }, index) => { if ((Math.floor(time / 700) + index) % 5) px(context, at, colour); });
  for (const piece of layout.furniture) {
    if (piece.kind === 'christmasTree') {
      const base = middleOf(piece);
      TREE_LIGHTS.forEach(([across, z], index) => { if ((Math.floor(time / 500) + index * 7) % 4) px(context, upright(base, across, z), F.bulbs[(index + Math.floor(time / 1500)) % F.bulbs.length]); });
      if (Math.floor(time / 400) % 2) px(context, upright(base, 0, 54), F.white);
    }
    if (piece.kind === 'speaker') rising(context, upright(middleOf(piece), 0, 30), SMALL_NOTE, F.note, time, hash(`${piece.x}`), 3);
    if (piece.kind === 'rose') rising(context, upright(toScreen({ x: piece.x + (piece.width === 3 ? 0.55 : 1.35), y: piece.y + 0.5 }), 0, (piece.top ?? 0) + 14), SMALL_HEART, F.heart, time, hash(`${piece.x}${piece.y}`), 2);
    if (piece.kind === 'pool') for (let ripple = 0; ripple < 6; ripple++) {
      const seed = hash(`ripple${ripple}`);
      if ((Math.floor(time / 450) + seed) % 3) continue;
      px(context, upright(toScreen({ x: piece.x + 0.4 + (seed % 100) / 100 * (piece.width - 0.8), y: piece.y + 0.4 + ((seed >>> 7) % 100) / 100 * (piece.depth - 0.8) }), 0, 4), F.waterLight);
    }
  }
  for (const at of flames(layout)) px(context, { x: at.x, y: at.y - (Math.floor(time / 180 + at.x) % 2 ? ART_SCALE : 0) }, Math.floor(time / 240 + at.y) % 3 ? F.flame : F.white);
  if (festival === 'christmas') snow(context, layout, time);
  if (festival === 'newYear' || festival === 'bastille') fireworks(context, layout, time, lighting);
  if (festival === 'valentine' && room === 'lounge') for (const item of layout.wallItems) if (item.kind === 'tv') rising(context, roomPointOnWall('back', item.fromX + item.width / 2, 34), SMALL_HEART, F.heart, time, 7, 3);
  if (festival === 'songkran' && heads.length > 1) {
    // a jet every second and a half: the user aims more often than the others
    const period = 1500;
    const round = Math.floor(time / period);
    const seed = hash(`jet${round}`);
    const shooter = seed % 3 === 0 ? 0 : (seed >>> 3) % heads.length;
    let target = (seed >>> 9) % heads.length;
    if (target === shooter) target = (target + 1) % heads.length;
    waterJet(context, heads[shooter], heads[target], (time % period) / period);
  }
}

/* The break room's TV shows the festival */

/** A sprite centred on the TV's screen, `bottom` art pixels above the floor. */
function onScreen(context: Context, rows: readonly string[], paint: Readonly<Record<string, string>>, middle: number, bottom: number) {
  onWall(context, rows, paint, 'back', middle - Math.max(...rows.map((row) => row.length)) / 16, bottom);
}

const TREE = [
  '....y....',
  '....g....',
  '...ggg...',
  '..gggrg..',
  '...ggg...',
  '..ggggg..',
  '.gyggggg.',
  '..ggggg..',
  '.ggggbgg.',
  'gggrggggg',
  '....t....',
];
const EQUALIZER = [5, 9, 13, 8, 11, 15, 10, 6, 12, 14, 7, 10];

/** The picture on the screen of a TV hung from `from` to `to` (tiles along the back wall), its glass from z 18 to 36. */
export function paintTvPicture(context: Context, festival: Festival, from: number, to: number, guests: readonly string[] = []) {
  const left = from + 0.12, right = to - 0.12, middle = (from + to) / 2;
  const fill = (fromZ: number, toZ: number, colour: string, x0 = left, x1 = right) =>
    fillPolygon(context, [onWallAt('back', x0, fromZ), onWallAt('back', x1, fromZ), onWallAt('back', x1, toZ), onWallAt('back', x0, toZ)], colour);
  const stars = (colour: string, count: number) => { for (let index = 0; index < count; index++) { const seed = hash(`tv${index}`); const at = onWallAt('back', left + ((seed % 100) / 100) * (right - left), 20 + (seed >>> 8) % 15); context.fillStyle = colour; context.fillRect(Math.round(at.x), Math.round(at.y), 1, 1); } };
  switch (festival) {
    case 'christmas': fill(18, 36, F.blue); stars(F.snow, 22); fill(18, 20, F.snow); onScreen(context, TREE, { ...PAINT, b: F.blue }, middle - 1.1, 20); wallText(context, 'NOEL', 'back', middle - 0.4, 25, F.white); break;
    case 'newYear': fill(18, 36, F.black); for (const [x, z, colour] of [[middle - 1.5, 30, F.bulbs[0]], [middle + 1.4, 31, F.bulbs[2]], [middle, 33, F.gold]] as const) for (let ray = 0; ray < 8; ray++) { const angle = ray / 8 * Math.PI * 2; const at = onWallAt('back', x + Math.cos(angle) * 0.35, z + Math.sin(angle) * 3); context.fillStyle = colour; context.fillRect(Math.round(at.x), Math.round(at.y), 1, 1); } wallText(context, String(newYear()), 'back', middle - textLength(String(newYear())) / 2, 20, F.gold); break;
    case 'epiphany': fill(18, 36, F.blue); stars(F.gold, 10); onScreen(context, CROWN, PAINT, middle, 24); break;
    case 'chineseNewYear': fill(18, 36, F.envelope); onScreen(context, FU, PAINT, middle, 22); break;
    case 'candlemas': fill(18, 36, F.crepeDark); onScreen(context, PAN, PAINT, middle, 23); break;
    case 'valentine': fill(18, 36, F.pink); onScreen(context, BIG_HEART, { h: F.heart, w: F.white }, middle, 21); break;
    case 'songkran': fill(27, 36, F.candle); fill(18, 27, F.water); for (let x = left; x < right; x += 0.5) { const at = onWallAt('back', x, 26); context.fillStyle = F.waterLight; context.fillRect(Math.round(at.x), Math.round(at.y), 2, 1); } onScreen(context, SUN, PAINT, middle + 1.2, 25); break;
    case 'easter': fill(18, 36, F.leaf); fill(18, 22, F.green); onScreen(context, BUNNY, PAINT, middle, 21); for (const [x, colour] of [[-1.5, 0], [1.3, 1], [1.8, 2]] as const) disc(context, 'back', middle + x, 21, 1, F.eggs[colour]); break;
    case 'mayDay': fill(18, 36, F.green); onScreen(context, LILY, PAINT, middle - 0.8, 22); onScreen(context, LILY, PAINT, middle + 0.8, 24); break;
    case 'music': fill(18, 36, F.black); EQUALIZER.forEach((height, index) => { const x = left + 0.25 + index * 0.35; if (x + 0.25 < right) fill(19, 19 + height, F.bulbs[index % F.bulbs.length], x, x + 0.25); }); break;
    case 'bastille': F.tricolor.forEach((colour, index) => { const width = (right - left) / 3; fill(18, 36, colour, left + index * width, left + (index + 1) * width); }); break;
    case 'summer': fill(29, 36, F.candle); fill(23, 29, F.water); fill(18, 23, F.crepe); onScreen(context, SUN, PAINT, middle + 1.4, 25); onScreen(context, PALM, PAINT, middle - 1.2, 19); break;
    case 'halloween': fill(18, 36, F.black); onScreen(context, MOON, HALLOWEEN_PAINT, middle + 1.3, 26); onScreen(context, PUMPKIN, HALLOWEEN_PAINT, middle - 0.6, 20); break;
    case 'birthday': {
      fill(18, 36, F.rose); stars(F.gold, 16);
      const word = guests[0] && textLength(guests[0]) <= right - left - 0.3 ? guests[0] : 'BRAVO';
      wallText(context, word, 'back', middle - textLength(word) / 2, 27, F.white);
      onScreen(context, ['.f.f.f.', '.c.c.c.', 'iiiiiii', 'kkkkkkk', 'kkkkkkk'], { f: F.flame, c: F.candle, i: F.icing, k: F.cake }, middle, 20);
      break;
    }
  }
}
