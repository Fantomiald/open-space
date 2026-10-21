// The treehouse's walls (forest.ts), at art resolution: courses of round logs with their bark, knots and moss in the
// gaps; ivy climbing from the floor, a leafy vine draped along the top, a string of fireflies under it, lanterns on
// hooks, shelf mushrooms (some glowing), and a branch growing through the left wall with a nest on it. Where the
// lights and what glows are, for the effects (forest-effects.ts).
import { FOREST_PALETTE as F } from '../../design/theme-forest.ts';
import { ROOM } from '../../../shared/room-layout.ts';
import { tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import { WALL, onWall, onWallAt, type Context, type Wall } from '../wall-art.ts';
import { dot, noise } from './forest-art.ts';

/** A spot on a wall: `along` it in tiles, `z` art pixels up. */
export interface WallSpot { wall: Wall; along: number; z: number }

/** Where each log course starts, from the floor up. */
const COURSES = [0, 7, 14, 21, 28, 35, 42, WALL];

const lengthOf = (wall: Wall) => (wall === 'back' ? ROOM.width : ROOM.depth);

/** The logs of a wall: rounded (lit on top, shaded under), their grain and knots, a gap between them, moss in it. */
function paintLogs(context: Context, wall: Wall) {
  const columns = lengthOf(wall) * 8;
  const colours = wall === 'back' ? F.logs : F.logsSide;
  for (let course = 0; course < COURSES.length - 1; course++) {
    const bottom = COURSES[course], top = COURSES[course + 1], height = top - bottom;
    const log = tones(colours[course % colours.length]);
    // where one log ends and the next starts, staggered from one course to the next
    const joints = new Set<number>();
    for (let column = 20 + pick(`${wall}joint${course}`, 50); column < columns - 8; column += 56 + pick(`${wall}joint${course},${column}`, 40)) joints.add(column);
    for (let column = 0; column < columns; column++) for (let z = bottom; z < top; z++) {
      const row = z - bottom;
      const share = row / (height - 1);
      const grain = pick(`${wall}g${column},${z}`, 23);
      let colour = share > 0.72 ? log.light : share < 0.3 ? log.shade : log.base;
      if (row === 0 && z > 0) colour = F.logGap;
      else if (row === 1) colour = log.dark;
      else if (grain === 0) colour = log.dark;
      else if (grain < 3 && share <= 0.72) colour = log.shade;
      // long streaks of the bark's grain along the log
      if (row > 1 && row < height - 1 && noise(`${wall}streak${z}`, column, 0, 3) > 0.82) colour = log.shade;
      if (joints.has(column)) colour = F.logGap;
      if (joints.has(column - 1) && row > 0) colour = share > 0.5 ? F.logEnd : F.logRing;
      // moss in the gap and on the logs just above it, thicker near the floor and in the corner
      const mossy = noise(`${wall}moss${course}`, column, 0, 7) + (column < 10 ? 0.25 : 0) - z / 160;
      if (row <= 2 && mossy > 0.62 - (row === 0 ? 0.08 : 0)) colour = F.moss[pick(`${wall}m${column},${z}`, F.moss.length)];
      if (row === 3 && mossy > 0.78 && pick(`${wall}tuft${column}`, 2) === 0) colour = F.mossLight;
      dot(context, onWallAt(wall, column / 8, z), colour);
    }
    // a knot here and there
    for (let index = 0; index < lengthOf(wall) / 4; index++) {
      const column = pick(`${wall}knot${course},${index}`, columns - 6) + 3;
      if (pick(`${wall}hasknot${course},${index}`, 3)) continue;
      const z = bottom + Math.floor(height / 2);
      for (const [across, up, colour] of [[-1, 0, F.knot], [0, 0, F.logGap], [1, 0, F.knot], [0, 1, log.light], [0, -1, F.knot]] as const) {
        dot(context, onWallAt(wall, (column + across) / 8, z + up), colour);
      }
    }
  }
}

/** A leaf of ivy: three pixels around a point, lit on one side. */
function ivyLeaf(context: Context, wall: Wall, along: number, z: number, seed: string) {
  const colour = F.ivy[pick(seed, F.ivy.length)];
  dot(context, onWallAt(wall, along, z), colour);
  dot(context, onWallAt(wall, along + 1 / 8, z), tones(colour).shade);
  dot(context, onWallAt(wall, along, z + 1), tones(colour).light);
  if (pick(`${seed}big`, 2)) dot(context, onWallAt(wall, along - 1 / 8, z), colour);
}

/** Ivy climbing a wall from the floor: a stem winding up to `height`, leaves on both sides, a branch or two. */
function paintIvy(context: Context, wall: Wall, along: number, height: number) {
  const stem = (from: number, base: number, length: number, key: string, lean: number) => {
    for (let up = 0; up < length; up++) {
      const sway = Math.round(Math.sin((up + pick(key, 9)) / 4) * 1.5 + (up * lean) / 10);
      const at = from + sway / 8, z = base + up;
      dot(context, onWallAt(wall, at, z), F.ivyStem);
      if (up % 3 === 0) ivyLeaf(context, wall, at + (up % 6 === 0 ? -2 : 2) / 8, z, `${key}${up}`);
    }
    ivyLeaf(context, wall, from + Math.round(Math.sin((length + pick(key, 9)) / 4) * 1.5 + (length * lean) / 10) / 8, base + length, `${key}tip`);
  };
  stem(along, 1, height, `${wall}ivy${along}`, 0);
  stem(along + 0.3, Math.round(height * 0.4), Math.round(height * 0.35), `${wall}ivyb${along}`, 3);
  stem(along - 0.2, Math.round(height * 0.6), Math.round(height * 0.3), `${wall}ivyc${along}`, -3);
}

/** The vine draped along the top of a wall, sagging between hooks, leaves all along it and strands hanging from it. */
function paintDrape(context: Context, wall: Wall) {
  const length = lengthOf(wall);
  const span = 2.5;
  const zOf = (along: number) => WALL - 2 - Math.round(Math.sin(((along % span) / span) * Math.PI) * 3);
  for (let column = 0; column <= length * 8; column++) {
    const along = column / 8, z = zOf(along);
    dot(context, onWallAt(wall, along, z), F.ivyStem);
    if (column % 3 === 0 && pick(`${wall}drapegap${Math.floor(column / 12)}`, 4)) ivyLeaf(context, wall, along, z + (column % 6 === 0 ? 1 : -1), `${wall}drape${column}`);
  }
  // strands hanging down here and there
  for (let along = 0.6; along < length - 0.3; along += 1.6 + pick(`${wall}strand${Math.round(along * 8)}`, 12) / 10) {
    const hang = 3 + pick(`${wall}hang${Math.round(along * 8)}`, 9);
    const top = zOf(along);
    for (let down = 1; down <= hang; down++) {
      dot(context, onWallAt(wall, along, top - down), F.ivyStem);
      if (down % 2 === 0) ivyLeaf(context, wall, along + (down % 4 === 0 ? -1 : 1) / 8, top - down, `${wall}hangleaf${Math.round(along * 8)},${down}`);
    }
  }
}

/** The string of fireflies under the vine: the bulbs' places along each wall (the cord sags between hooks). */
const STRING = { z: 44, span: 2, sag: 3 };
function stringZ(along: number) { return STRING.z - Math.round(Math.sin(((along % STRING.span) / STRING.span) * Math.PI) * STRING.sag); }
export const FIREFLY_BULBS: readonly WallSpot[] = (['back', 'left'] as const).flatMap((wall) => {
  const bulbs: WallSpot[] = [];
  for (let along = 0.25; along < lengthOf(wall); along += 0.5) bulbs.push({ wall, along, z: stringZ(along) - 1 });
  return bulbs;
});

function paintString(context: Context, wall: Wall) {
  for (let column = 0; column <= lengthOf(wall) * 8; column++) dot(context, onWallAt(wall, column / 8, stringZ(column / 8)), F.cord);
  for (const bulb of FIREFLY_BULBS) if (bulb.wall === wall) {
    dot(context, onWallAt(wall, bulb.along, bulb.z), F.fireflyGlow);
    dot(context, onWallAt(wall, bulb.along, bulb.z - 1), tones(F.fireflyGlow).shade);
  }
}

/** The lanterns on their hooks: where their glass is (between the windows, beside the door). */
export const LANTERNS: readonly WallSpot[] = [
  { wall: 'back', along: 6.1, z: 36 },
  { wall: 'back', along: 14.55, z: 36 },
  { wall: 'left', along: 2.4, z: 36 },
  { wall: 'left', along: 6.9, z: 34 },
  { wall: 'left', along: 11.2, z: 30 },
];

const LANTERN = [
  '..hhh..',
  '..h.h..',
  '.iiiii.',
  'iiiiiii',
  '.igwgi.',
  '.iwwgi.',
  '.iggsi.',
  '.igssi.',
  'iiiiiii',
  '..iii..',
  '...i...',
];
function paintLantern(context: Context, { wall, along, z }: WallSpot) {
  const hook = Math.max(z + 8, Math.min(STRING.z - 1, WALL - 3));
  for (let up = z + 9; up <= hook; up++) dot(context, onWallAt(wall, along, up), F.lanternIron);
  onWall(context, LANTERN, { h: F.lanternIron, i: F.lanternIron, g: F.lanternGlass, w: F.lanternCore, s: tones(F.lanternGlass).shade }, wall, along - 3 / 8, z - 2);
}

/** Shelf mushrooms growing out of the wall, in a cluster: some glow in the dark (GLOWING_MUSHROOMS). */
const MUSHROOMS: readonly (WallSpot & { glowing: boolean })[] = [
  { wall: 'back', along: 0.9, z: 18, glowing: false },
  { wall: 'back', along: 18.9, z: 15, glowing: true },
  { wall: 'back', along: 5.4, z: 9, glowing: true },
  { wall: 'left', along: 1.2, z: 12, glowing: false },
  { wall: 'left', along: 7.8, z: 16, glowing: true },
  { wall: 'left', along: 12.9, z: 22, glowing: true },
];
export const GLOWING_MUSHROOMS: readonly WallSpot[] = MUSHROOMS.filter((mushroom) => mushroom.glowing);

const SHELF = [
  '.cccc.',
  'cllllc',
  '.dddd.',
];
function paintMushrooms(context: Context, { wall, along, z, glowing }: WallSpot & { glowing: boolean }) {
  const cap = glowing ? F.glowCap : F.bracket;
  const paint = { c: tones(cap).shade, l: glowing ? tones(cap).light : cap, d: glowing ? F.glowCapDark : F.bracketDark };
  onWall(context, SHELF, paint, wall, along - 0.4, z);
  onWall(context, SHELF.map((row) => row.slice(1, 5)), paint, wall, along - 0.1, z + 4);
  onWall(context, ['.cc.', 'cllc', '.dd.'], paint, wall, along + 0.15, z - 3);
}

/** A branch growing out of the left wall, its leaves, a nest on it with two eggs and a little bird beside it. */
const NEST = [
  '...........bb.',
  '..........bbbk',
  '.........yybb.',
  '.ee.......yb..',
  'neeennnn..tt..',
  'nnnnnnnnmmmm..',
  '.nnmnnmn......',
  '..mmmmm.......',
];
function paintNest(context: Context) {
  const along = 4, z = 33;
  for (let column = -10; column < 14; column++) {
    const up = Math.round(-column / 6);
    dot(context, onWallAt('left', along + column / 8, z + up), F.branch);
    dot(context, onWallAt('left', along + column / 8, z + up - 1), tones(F.branch).dark);
    if (column % 3 === 0) ivyLeaf(context, 'left', along + column / 8, z + up + 2, `branchleaf${column}`);
  }
  for (const [column, up] of [[-12, 4], [-13, 5], [-15, 5], [15, -3], [16, -2]] as const) ivyLeaf(context, 'left', along + column / 8, z + up, `twig${column}`);
  onWall(context, NEST, { n: F.nest, m: F.nestDark, e: F.egg, b: F.bird, y: F.birdBreast, k: F.nestDark, t: F.nestDark }, 'left', along - 0.2, z - 1);
}

export function paintForestWalls(context: Context) {
  for (const wall of ['back', 'left'] as const satisfies readonly Wall[]) {
    paintLogs(context, wall);
    paintDrape(context, wall);
    paintString(context, wall);
  }
  for (const [wall, along, height] of [['back', 0.4, 40], ['back', 5.25, 30], ['back', 19.5, 34], ['left', 0.5, 38], ['left', 7.4, 26], ['left', 12.4, 30]] as const) paintIvy(context, wall, along, height);
  for (const mushroom of MUSHROOMS) paintMushrooms(context, mushroom);
  paintNest(context);
  for (const lantern of LANTERNS) paintLantern(context, lantern);
}
