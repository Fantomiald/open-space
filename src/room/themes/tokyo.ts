// The room dressed as a back street of Tokyo at night (themes/kit.ts), at art resolution like backdrop.ts: raw concrete
// with its tie holes over roll-up shutters, pipes, cables, air conditioners and torn posters, neon signs in katakana and
// pictograms, red lanterns; wet asphalt with its road paint, puddles and a manhole; a sidewalk for a slab with neon
// under it; a sliding door behind a noren; shop windows on the street in the rain; an LED clock, a karaoke screen.
import { TOKYO_PALETTE as T } from '../../design/theme-tokyo.ts';
import { ROOM, type FurniturePiece, type Layout, type Rug, type WallItem } from '../../../shared/room-layout.ts';
import { DOOR_SIZE, toScreen, type Point } from '../geometry.ts';
import { css, mix, rgb, type Lighting } from '../lighting.ts';
import { ART_SCALE, fillPolygon, toArt, tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import { WALL_EFFECT, type ThemeEffect, type ThemeKit, type ThemeLight } from './kit.ts';
import { furnitureDepth } from '../pixel-furniture.ts';
import { TOKYO_FURNITURE } from './tokyo-furniture.ts';
import { PICTOS, boundsOf, glowPlaced, glowRows, glowSign, kana, letters, onWallRows, paintPlaced, paintSign, widthOf, type Placed, type Sign } from './tokyo-signs.ts';
import { paintNeonSky, paintRain } from './tokyo-sky.ts';
import { glyphRows, line, onWallAt, sagging, type Context, type Wall } from '../wall-art.ts';

const WAINSCOT = 12;
/** The glass of the windows, as backdrop.ts's WINDOW_GLASS (the light through them is cast from there). */
const GLASS = { low: 16, high: 38 };
const N = T.neon;

function dot(context: Context, point: Point, colour: string, alpha = 1) {
  context.globalAlpha = alpha;
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
  context.globalAlpha = 1;
}
const quad = (context: Context, wall: Wall, from: number, to: number, low: number, high: number, colour: string) =>
  fillPolygon(context, [onWallAt(wall, from, low), onWallAt(wall, to, low), onWallAt(wall, to, high), onWallAt(wall, from, high)], colour);

/* The signs, the lanterns and what else glows on the walls */

/** A red paper lantern, small (on a string) and big (by the door): k its caps, r paper, R ribs, l and L its glow. */
const LANTERN = ['.kkk.', 'rlLlr', 'rRRRr', 'rlLlr', 'rRRRr', 'rlLlr', '.kkk.'];
const BIG_LANTERN = ['..kkk..', '.rrrrr.', 'rrlLlrr', 'RRRRRRR', 'rllLllr', 'rrlLlrr', 'RRRRRRR', 'rrlLlrr', '.rrrrr.', '..kkk..'];
const LANTERN_DAY = { k: T.lanternCap, r: T.lantern, R: T.lanternRib, l: T.lantern, L: T.lanternLit };
const LANTERN_LIT = { k: T.lanternCap, r: T.lantern, R: T.lanternRib, l: T.lanternLit, L: N.yellow.core };

interface Lantern extends Placed { big: boolean }
/** A lantern hanging from `bottom` to its top, its middle `along` the left wall. */
const lantern = (along: number, bottom: number, big: boolean): Lantern => {
  const rows = big ? BIG_LANTERN : LANTERN;
  return { wall: 'left', from: along + rows[0].length / 16, bottom, glyphs: [rows], big };
};
/** The string of lanterns above the reading corner, and the two on each side of the door. */
const lanternsOf = (door: number): Lantern[] => [
  ...[11, 11.9, 12.8, 13.7].map((along) => lantern(along, 38, false)),
  lantern(door - 0.6, 22, true),
  lantern(door + DOOR_SIZE.width + 0.6, 22, true),
];

/** The signs fixed to the walls, the same in both rooms. */
const WALL_SIGNS: readonly Sign[] = [
  { wall: 'left', from: 5.7, bottom: 35, glyphs: [PICTOS.invader, ...kana('ゲーム')], neon: N.green, board: true },
  { wall: 'left', from: 13.7, bottom: 28, glyphs: [PICTOS.heart], neon: N.pink },
  // a sign for beer, written downwards on the pillar between the first two windows
  { wall: 'back', from: 6.2, bottom: 16, glyphs: kana('ビール', true), down: true, neon: N.yellow, board: true, faulty: true },
];
/** Three arrowheads pointing to the door, lit one after the other (their letters say which). */
const ARROW: Placed = { wall: 'left', from: 8.5, bottom: 32, glyphs: ['1', '2', '3'].map((index) => PICTOS.chevron.map((row) => row.replaceAll('#', index))) };

/** Glyphs centred over a point along the back wall. */
const centred = (glyphs: Sign['glyphs'], along: number) => along - widthOf({ glyphs }) / 16;

/** What each window of the back wall says above it: ramen, games, a bar at the last one. */
function windowSign(item: WallItem, index: number, count: number): Sign {
  const glyphs = index === 0 ? kana('ラーメン') : index === count - 1 ? [PICTOS.cocktail, ...letters('BAR')] : kana('ゲーム');
  const neon = index === 0 ? N.pink : index === count - 1 ? N.cyan : N.yellow;
  return { wall: 'back', from: centred(glyphs, item.fromX + item.width / 2), bottom: 41, glyphs, neon, board: true, faulty: index === 0 };
}
const tvSign = (item: WallItem): Sign => {
  const glyphs = kana('カラオケ');
  return { wall: 'back', from: centred(glyphs, item.fromX + item.width / 2), bottom: 42, glyphs, neon: N.violet, board: true };
};

function signsOf(layout: Layout): Sign[] {
  const windows = layout.wallItems.filter((item) => item.kind === 'window');
  return [
    ...WALL_SIGNS,
    ...windows.map((item, index) => windowSign(item, index, windows.length)),
    ...layout.wallItems.filter((item) => item.kind === 'tv').map(tvSign),
  ];
}

/**
 * Whether a piece standing in front of a wall hides the point `along` it, `z` up (art pixels): what is lit every frame
 * is painted over everything, so it must be in sight. A piece `y` tiles from the back wall shows on it 8y pixels lower.
 */
function hides(piece: FurniturePiece, wall: Wall, along: number, z: number): boolean {
  const height = TOKYO_FURNITURE[piece.kind]?.height ?? 64;
  const [across, away, width, depth] = wall === 'back' ? [piece.x, piece.y, piece.width, piece.depth] : [piece.y, piece.x, piece.depth, piece.width];
  return along > across - away - depth && along < across + width - away && z < height - away * 8;
}
function inSight(layout: Layout, placed: Placed) {
  const { from, to, low, high } = boundsOf(placed);
  return !layout.furniture.some((piece) => [0, 0.25, 0.5, 0.75, 1].map((share) => from + (to - from) * share).some((along) => hides(piece, placed.wall, along, low) || hides(piece, placed.wall, along, high)));
}

const sightCache = new WeakMap<Layout, { signs: Sign[]; lanterns: Lantern[]; arrow: boolean; tv: WallItem | undefined }>();
/** What glows on this room's walls and is not hidden behind its furniture. */
function glowing(layout: Layout) {
  let value = sightCache.get(layout);
  if (!value) {
    const tv = layout.wallItems.find((item) => item.kind === 'tv');
    value = {
      signs: signsOf(layout).filter((sign) => inSight(layout, sign)),
      lanterns: lanternsOf(layout.door.y).filter((each) => inSight(layout, each)),
      arrow: inSight(layout, ARROW),
      tv: tv && inSight(layout, { wall: 'back', from: tv.fromX + 1, bottom: 17, glyphs: [['#'.repeat(Math.round((tv.width - 2) * 8))]] }) ? tv : undefined,
    };
    sightCache.set(layout, value);
  }
  return value;
}

/* The walls */

/** Raw concrete in panels with their tie holes and a stain here and there, over a band of ribbed shutters, a pipe along the top. */
function paintConcrete(context: Context, wall: Wall) {
  const length = wall === 'back' ? ROOM.width : ROOM.depth;
  const seam = wall === 'back' ? T.wallStripe : T.wallSideStripe;
  for (let along = 1.5; along < length; along += 1.5) line(context, onWallAt(wall, along, WAINSCOT + 1), onWallAt(wall, along, 44), seam);
  for (const z of [26, 39]) {
    line(context, onWallAt(wall, 0, z), onWallAt(wall, length, z), seam);
    line(context, onWallAt(wall, 0, z - 1), onWallAt(wall, length, z - 1), T.concreteLight);
  }
  for (let panel = 0; panel * 1.5 < length; panel++) for (const [low, high] of [[13, 26], [26, 39]]) {
    for (const share of [0.3, 1.2]) for (const z of [low + 3, high - 4]) {
      const along = panel * 1.5 + share;
      dot(context, onWallAt(wall, along, z), T.tieHole);
      dot(context, onWallAt(wall, along, z - 1), T.concreteLight);
      if (pick(`stain${wall}${panel}${low}${share}${z}`, 5) === 0) for (let drip = 2; drip < 4 + pick(`drip${along}${z}`, 4); drip++) dot(context, onWallAt(wall, along, z - drip), T.stain);
    }
  }
  // the shutters: ribs, and their rails every few tiles
  for (const z of [4, 7, 10]) {
    line(context, onWallAt(wall, 0, z), onWallAt(wall, length, z), T.wainscotLine);
    line(context, onWallAt(wall, 0, z + 1), onWallAt(wall, length, z + 1), T.shutterLight);
  }
  for (let along = 0.05; along < length; along += 3.3) line(context, onWallAt(wall, along, 2), onWallAt(wall, along, WAINSCOT), T.pipe);
  // a pipe along the top on its brackets, and two cables sagging under it
  line(context, onWallAt(wall, 0, 47), onWallAt(wall, length, 47), T.pipe);
  line(context, onWallAt(wall, 0, 48), onWallAt(wall, length, 48), T.pipeLight);
  for (let along = 1; along < length; along += 2.5) dot(context, onWallAt(wall, along, 46), T.cable);
  sagging(context, wall, 0.2, length - 0.2, 45, 2.6, 2, T.cable);
  sagging(context, wall, 0.9, length - 0.5, 44, 3.4, 3, T.cable);
}

/** An outdoor air conditioner: its box, its round fan grille, its pipe down the wall. */
function paintAircon(context: Context, wall: Wall, from: number, low: number) {
  const to = from + 0.8;
  quad(context, wall, from, to, low, low + 8, T.aircon);
  quad(context, wall, from, to, low, low + 1, T.airconShade);
  const middle = from + 0.3;
  for (let up = -3; up <= 3; up++) for (let across = -3; across <= 3; across++) {
    const distance = Math.hypot(across, up);
    if (distance > 3.2) continue;
    dot(context, onWallAt(wall, middle + across / 8, low + 4 + up), distance > 2.4 ? T.airconShade : (across + up) % 2 ? T.airconGrille : T.airconShade);
  }
  for (let z = 1; z <= 6; z += 2) line(context, onWallAt(wall, to - 0.25, low + z), onWallAt(wall, to - 0.08, low + z), T.airconShade);
  line(context, onWallAt(wall, to - 0.05, low - 1), onWallAt(wall, to - 0.05, 2), T.pipe);
}

/** Posters pasted over each other, one letter a pixel: b their paper, i ink, a their picture, w white, t a torn corner. */
const POSTERS = [
  ['bbbbbbb', 'bwbbbwb', 'bwwwwwb', 'bwiwiwb', 'bwwawwb', 'bbwwwbb', 'bbbbbbb', 'biiibib', 'bbbbbbb', 'biibiit', 'bbbbbtt'],
  ['bbbbbbb', 'bbbabbb', 'bbaaabb', 'baaaaab', 'bbaaabb', 'bbbabbb', 'bbbbbbb', 'bwwwwwb', 'bbbbbbb', 'bwwbwwb', 'bbbbbbb'],
  ['tbbbbbb', 'biiiiib', 'bbbbbbb', 'baabaab', 'baaaaab', 'bbaaabb', 'bbbabbb', 'bbbbbbb', 'biibiib', 'bbbbbbb'],
  ['bbbbbb', 'baaaab', 'bawwab', 'baaaab', 'bbbbbb', 'biiiib', 'bbbbbb', 'bibiib', 'bbbbbt'],
] as const;
const POSTER_COLOURS = [
  { b: T.posters[1], w: T.posters[0], i: T.posterInk, a: T.posters[2], t: T.posterTorn },
  { b: T.posters[2], a: T.posters[3], w: T.posters[0], i: T.posterInk, t: T.posterTorn },
  { b: T.posters[0], i: T.posterInk, a: T.posters[2], t: T.posterTorn, w: T.posters[0] },
  { b: T.posters[5], a: T.posters[4], w: T.posters[0], i: T.posterInk, t: T.posterTorn },
];
function paintPoster(context: Context, wall: Wall, from: number, bottom: number, which: number) {
  onWallRows(context, POSTERS[which], POSTER_COLOURS[which], wall, from, bottom);
}

/** A bright menu of pictures by the door: a bowl of ramen, skewers, a glass of beer, on a lit panel. */
const MENU = [
  'fffffffffffffff',
  'f.....f.......f',
  'f.r.r.f..s.s..f',
  'fbbbbbf..s.s..f',
  'f.bbb.f.ooooo.f',
  'f.....f..s.s..f',
  'fffffffffffffff',
  'f.....f.......f',
  'f.yyy.f.ppppp.f',
  'f.yyyhf.p.p.p.f',
  'f.yyy.f.ppppp.f',
  'f.....f.......f',
  'fffffffffffffff',
];
const MENU_COLOURS = { f: T.signBoard, '.': T.board, r: T.chopsticks, b: T.bowlRim, s: T.chopsticks, o: T.lanternLit, y: N.yellow.colour, h: T.board, p: T.posters[2] };

/** The walls: concrete and shutters, then what is fixed to them in both rooms (the windows paint their own signs). */
export function paintTokyoWalls(context: Context, layout: Layout) {
  paintConcrete(context, 'back');
  paintConcrete(context, 'left');
  paintAircon(context, 'back', 0.08, 34);
  paintAircon(context, 'left', 1.15, 32);
  // the pillar between the first two windows: posters under the beer sign
  paintPoster(context, 'back', 5.7, 3, 2);
  // an electricity meter and its conduit right of the clock, a drain pipe in the far right corner
  quad(context, 'back', 13.55, 14.15, 22, 30, T.meter);
  quad(context, 'back', 13.65, 14.05, 25, 28, T.signBoard);
  line(context, onWallAt('back', 13.85, 22), onWallAt('back', 13.85, 2), T.pipe);
  line(context, onWallAt('back', 19.6, 48), onWallAt('back', 19.6, 0), T.pipe);
  line(context, onWallAt('back', 19.7, 48), onWallAt('back', 19.7, 0), T.pipeLight);
  // the left wall: posters under the arcade's sign, the menu and the arrow to the door, lanterns over the reading corner
  for (const [from, bottom, which] of [[5.1, 15, 0], [4.25, 18, 1], [3.3, 14, 3], [2.45, 17, 2]]) paintPoster(context, 'left', from, bottom, which);
  onWallRows(context, MENU, MENU_COLOURS, 'left', 7.85, 14);
  paintPlaced(context, ARROW, { 1: N.pink.colour, 2: N.pink.colour, 3: N.pink.colour });
  sagging(context, 'left', 10.7, 14, 46, 0.9, 1, T.cable);
  // a sign partly behind a piece is left out whole (and its glow with it), not cut like a stray letter
  for (const sign of glowing(layout).signs) paintSign(context, sign);
  for (const each of lanternsOf(9)) if (!each.big) paintLantern(context, each);
}

/** A lantern and the cord it hangs from. */
function paintLantern(context: Context, each: Lantern) {
  const { from, to, high } = boundsOf(each);
  line(context, onWallAt(each.wall, (from + to) / 2, high), onWallAt(each.wall, (from + to) / 2, high + 2), T.cable);
  paintPlaced(context, each, LANTERN_DAY);
}

/* The floor */

const floorQuad = (context: Context, x: number, y: number, width: number, depth: number, colour: string) =>
  fillPolygon(context, [toArt({ x, y }), toArt({ x: x + width, y }), toArt({ x: x + width, y: y + depth }), toArt({ x, y: y + depth })], colour);

/** A blot on the floor around a point (tiles), `radius` art pixels across, flattened like the floor; `colour` per pixel. */
function blot(context: Context, middle: Point, radius: number, seed: string, colour: (x: number, y: number, edge: boolean) => string | null) {
  const center = toArt(middle);
  for (let y = -radius; y <= radius; y++) for (let x = -radius * 2; x <= radius * 2; x++) {
    const reach = radius * (0.75 + pick(`${seed}${Math.round(Math.atan2(y * 2, x) * 3)}`, 25) / 100);
    const distance = Math.hypot(x / 2, y);
    if (distance > reach) continue;
    const paint = colour(x, y, distance > reach - 1);
    if (paint) dot(context, { x: center.x + x, y: center.y + y }, paint);
  }
}

/** Where the puddles are: the neon of the signs shows in them. */
const PUDDLES = [[6.5, 1.3, 5], [12.8, 1.4, 6], [3.2, 11.2, 4], [16.5, 7.4, 5], [11.5, 9.6, 4]] as const;
const REFLECTED = [N.pink.colour, N.cyan.colour, N.yellow.colour, N.violet.colour];

/** The road paint around a rug's place: a crossing for the user's, dashed white or yellow lines for the others. */
function paintMarking(context: Context, rug: Rug) {
  const { x, y, width, depth } = rug;
  if (rug.colour === 'amber') {
    for (let stripe = x + 0.25; stripe + 0.3 <= x + width - 0.1; stripe += 0.6) floorQuad(context, stripe, y + 0.3, 0.3, depth - 0.6, T.roadWhite);
    return;
  }
  const colour = rug.colour === 'green' ? T.roadYellow : T.roadWhite;
  const dashed = rug.colour !== 'green';
  const edge = (from: Point, to: Point) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    for (let at = 0; at < length; at += dashed ? 0.6 : 0.25) {
      const share = at / length, next = Math.min(1, (at + (dashed ? 0.35 : 0.25)) / length);
      line(context, toArt({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }), toArt({ x: from.x + (to.x - from.x) * next, y: from.y + (to.y - from.y) * next }), colour);
    }
  };
  const inset = 0.15;
  const corners = [{ x: x + inset, y: y + inset }, { x: x + width - inset, y: y + inset }, { x: x + width - inset, y: y + depth - inset }, { x: x + inset, y: y + depth - inset }];
  for (const [index, corner] of corners.entries()) edge(corner, corners[(index + 1) % 4]);
}

/** Wet asphalt: its grit and shine, the road paint where the rugs would be, puddles with the neon in them, a manhole cover. */
export function paintAsphalt(context: Context, layout: Layout) {
  for (let y = 0; y < ROOM.depth; y++) for (let x = 0; x < ROOM.width; x++) {
    floorQuad(context, x, y, 1, 1, T.planks[pick(`tile${x},${y}`, T.planks.length)]);
    // grit, and now and then a glint of wet
    for (let grain = 0; grain < 5; grain++) {
      const at = toArt({ x: x + pick(`gx${x},${y},${grain}`, 100) / 100, y: y + pick(`gy${x},${y},${grain}`, 100) / 100 });
      dot(context, at, grain < 2 ? T.grit : grain < 4 ? T.gritDark : pick(`glint${x},${y}`, 3) ? T.grit : T.wet);
    }
  }
  // the seams of the paving, a little lighter, every few tiles
  for (let x = 4; x < ROOM.width; x += 5) line(context, toArt({ x, y: 0 }), toArt({ x, y: ROOM.depth }), T.plankSeam);
  for (const rug of layout.rugs) paintMarking(context, rug);
  for (const [x, y, radius] of PUDDLES) {
    blot(context, { x, y }, radius, `puddle${x}`, (px, py, edge) => {
      if (edge) return T.puddleEdge;
      // the signs above show as broken streaks going down the water
      const streak = Math.floor((px + 40) / 3);
      if (pick(`streak${x}${streak}`, 3) === 0 && (py + pick(`gap${x}${streak}${py}`, 3)) % 3) return REFLECTED[pick(`colour${x}${streak}`, REFLECTED.length)];
      return pick(`shine${x}${px},${py}`, 14) === 0 ? T.wet : T.puddle;
    });
  }
  // the manhole cover, its ring and its grid
  blot(context, { x: 10.5, y: 11.6 }, 4, 'manhole', (px, py, edge) => (edge ? T.manholeDark : (px + py * 2) % 4 === 0 ? T.manholeLight : T.manhole));
}

/* The slab: a block of sidewalk, its curb and drains, neon under it */

/** The slab's corners on the room's canvas, as backdrop.ts lays them (walls 0.35 tiles thick, the floor 4 art pixels). */
const SLAB_TOP = { left: { x: -0.35, y: ROOM.depth }, front: { x: ROOM.width, y: ROOM.depth }, right: { x: ROOM.width, y: -0.35 } };
const SLAB = { thickness: 4, height: 6, underside: 2 };

export function paintSidewalk(context: Context, left: Point, front: Point, right: Point, height: number, underside: number) {
  const lift = (point: Point, z: number): Point => ({ x: point.x, y: point.y - z });
  const toward = (from: Point, to: Point, share: number): Point => ({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
  // the curb's lit top and its blocks
  line(context, lift(left, -1), lift(front, -1), T.curb);
  line(context, lift(front, -1), lift(right, -1), tones(T.curb).shade);
  for (const [from, to] of [[left, front], [front, right]] as const) {
    for (let share = 0.03; share < 1; share += 0.045) line(context, lift(toward(from, to, share), -1), lift(toward(from, to, share), -height), T.slabSeam);
    // drain grates in the curb
    for (const share of [0.3, 0.72]) for (let bar = 0; bar < 6; bar++) line(context, lift(toward(from, to, share + bar * 0.006), -2), lift(toward(from, to, share + bar * 0.006), -4), bar % 2 ? T.grate : T.slabUnder);
  }
  // the neon tube under the block, unlit (the effects light it)
  line(context, lift(toward(left, front, 0.06), -(height + underside)), lift(front, -(height + underside)), N.pink.off);
  line(context, lift(front, -(height + underside)), lift(toward(right, front, 0.06), -(height + underside)), N.cyan.off);
}

/** The neon tubes under the block, lit, and their glow on what is under it, fading in steps. */
function glowSidewalk(context: Context) {
  const at = (tile: Point, down: number) => { const point = toArt(tile); return { x: point.x, y: point.y + SLAB.thickness + SLAB.height + SLAB.underside + down }; };
  const left = SLAB_TOP.left, front = SLAB_TOP.front, right = SLAB_TOP.right;
  const nearLeft = { x: left.x + (front.x - left.x) * 0.06, y: left.y }, nearRight = { x: right.x, y: right.y + (front.y - right.y) * 0.06 };
  for (const [from, to, neon] of [[nearLeft, front, N.pink], [front, nearRight, N.cyan]] as const) {
    for (const [down, colour, alpha] of [[0, neon.colour, 1], [1, neon.halo, 0.4], [2, neon.halo, 0.18], [3, neon.halo, 0.07]] as const) {
      const a = at(from, down), b = at(to, down);
      const steps = Math.round(Math.abs(b.x - a.x));
      context.globalAlpha = alpha;
      context.fillStyle = colour;
      for (let step = 0; step <= steps; step++) {
        const t = steps ? step / steps : 0;
        context.fillRect(Math.round(a.x + (b.x - a.x) * t) * ART_SCALE, Math.round(a.y + (b.y - a.y) * t) * ART_SCALE, ART_SCALE, ART_SCALE);
      }
    }
  }
  context.globalAlpha = 1;
}

/* The door */

/** The doorway in a wooden frame under a small eave, an indigo noren hanging in it, a big lantern on each side. */
export function paintSlidingDoor(context: Context, from: number, to: number, height: number) {
  quad(context, 'left', from - 0.15, to + 0.15, 0, height + 3, T.doorFrame);
  quad(context, 'left', from, to, 0, height, T.doorway);
  quad(context, 'left', from + 0.1, to - 0.1, 0, 4, tones(T.doorLight).dark);
  // the eave over it, in dark tiles
  quad(context, 'left', from - 0.45, to + 0.85, height + 3, height + 5, T.roof);
  for (let along = from - 0.4; along < to + 0.85; along += 0.25) dot(context, onWallAt('left', along, height + 4), tones(T.roof).light);
  // the noren: three panels from the top of the doorway, a slit between them, a white crest across the middle one
  const panel = (to - from - 0.1) / 3;
  for (let index = 0; index < 3; index++) {
    const start = from + 0.05 + index * panel;
    quad(context, 'left', start + 1 / 16, start + panel - 1 / 16, height - 11, height, T.noren);
    quad(context, 'left', start + 1 / 16, start + panel - 1 / 16, height - 11, height - 10, T.norenDark);
  }
  const crest = (from + to) / 2;
  for (let up = -3; up <= 3; up++) for (let across = -3; across <= 3; across++) {
    const distance = Math.hypot(across, up);
    if (distance <= 3.2 && distance > 1.9) dot(context, onWallAt('left', crest + across / 8, height - 5 + up), T.norenCrest);
  }
  for (const each of lanternsOf(from)) if (each.big) paintLantern(context, each);
}

/* The windows: the street across, in the rain */

/** A building across the street: where it starts in the window (art pixels), its width, its top, its colour, its signs. */
interface Facade { start: number; width: number; top: number; colour: string; blade: number }

function facadesOf(item: WallItem): Facade[] {
  const facades: Facade[] = [];
  for (let start = -pick(`f0${item.fromX}`, 6), index = 0; start < item.width * 8; index++) {
    const seed = `${item.fromX}:${index}`;
    const width = 9 + pick(`fw${seed}`, 8);
    facades.push({ start, width, top: 31 + pick(`ft${seed}`, 12), colour: T.facades[pick(`fc${seed}`, T.facades.length)], blade: pick(`fb${seed}`, 3) ? 1 + pick(`fbx${seed}`, width - 5) : -1 });
    start += width;
  }
  return facades;
}

const BLADES = [N.pink.colour, N.cyan.colour, N.yellow.colour, N.violet.colour, N.green.colour, T.board];

/** What shows through a window at a pixel (column across it, z up): the sky, the facades, their shops, the wet street. */
function streetAt(item: WallItem, facades: readonly Facade[], column: number, z: number, night: number): string {
  const facade = facades.find((each) => column >= each.start && column < each.start + each.width)!;
  const local = column - facade.start;
  const seed = `${item.fromX}:${facade.start}`;
  const dusk = 1 - night;
  if (z >= facade.top) return css(mix(mix(rgb(T.skyDuskMiddle), rgb(T.skyNightMiddle), night), mix(rgb(T.skyDuskTop), rgb(T.skyNightTop), night), (z - facade.top) / 10));
  // a blade sign standing out from the facade: three tenants stacked, each in its colour
  if (facade.blade >= 0 && local >= facade.blade && local < facade.blade + 3 && z >= 23 && z < Math.min(facade.top - 1, 35)) {
    const block = Math.floor((z - 23) / 4);
    if ((z - 23) % 4 === 3) return T.signBoard;
    const colour = BLADES[pick(`blade${seed}${block}`, BLADES.length)];
    return local === 1 && (z - 23) % 4 === 1 ? N.pink.core : colour;
  }
  if (z <= 17) {
    // the wet street mirrors the signs and the shops above
    if (facade.blade >= 0 && local >= facade.blade && local < facade.blade + 3 && (z + column) % 2) return BLADES[pick(`blade${seed}0`, BLADES.length)];
    return z === 16 && pick(`wet${item.fromX}${column}`, 3) === 0 ? T.shopLight : T.streetWet;
  }
  const lit = pick(`shop${seed}`, 4) > 0;
  if (z <= 21) {
    if (local === 0 || local === facade.width - 1) return facade.colour;
    if (!lit) return z % 2 ? T.wainscotLine : T.shutterLight;
    return z === 18 && local % 4 === 2 ? T.shopInside : T.shopLight;
  }
  if (z === 22) return lit ? T.awnings[pick(`awning${seed}`, T.awnings.length)] : facade.colour;
  if (z === 23 && lit) return local % 2 ? T.awnings[pick(`awning${seed}`, T.awnings.length)] : facade.colour;
  // the floors above: windows two pixels wide, lit more and more as the night comes
  const inRow = (z - 25) % 4, inColumn = (local - 1) % 4;
  if (z >= 25 && z < facade.top - 1 && inRow < 2 && inColumn > 0 && inColumn < 3 && local < facade.width - 1) {
    const window = `${seed}${Math.floor((local - 1) / 4)}${Math.floor((z - 25) / 4)}`;
    if (pick(`lit${window}`, 100) < 35 + night * 35) return T.facadeLit[pick(`tone${window}`, T.facadeLit.length)];
    return css(mix(rgb(tones(facade.colour).dark), rgb(T.duskStreet), dusk * 0.4));
  }
  return css(mix(rgb(facade.colour), rgb(T.duskStreet), dusk * 0.35));
}

/** A shop window of the back wall: the street across in the rain, an aluminium frame (the shop's sign above it is painted with the walls). */
export function paintShopWindow(context: Context, item: WallItem, lighting: Lighting) {
  const night = lighting.stars;
  const facades = facadesOf(item);
  const columns = Math.round(item.width * 8);
  for (let column = 0; column < columns; column++) for (let z = GLASS.low; z < GLASS.high; z++) {
    dot(context, onWallAt('back', item.fromX + (column + 0.5) / 8, z), streetAt(item, facades, column, z, night));
  }
  // rain falling past the glass, and drops on it
  for (let drop = 0; drop < columns * 1.2; drop++) {
    const column = pick(`rain${item.fromX}${drop}`, columns), z = GLASS.low + 1 + pick(`rainz${item.fromX}${drop}`, GLASS.high - GLASS.low - 4);
    for (let step = 0; step < 2 + (drop % 2); step++) dot(context, onWallAt('back', item.fromX + (column + 0.5) / 8, z + step), T.rain, 0.35);
  }
  for (let step = 0; step < 6; step++) dot(context, onWallAt('back', item.fromX + (3 + step) / 8, GLASS.high - 3 - step), T.glassShine, 0.18);
  const from = item.fromX, to = from + item.width;
  const bar = (fromBar: number, toBar: number, low: number, high: number) => quad(context, 'back', fromBar, toBar, low, high, T.windowFrame);
  bar(from - 0.12, to + 0.12, GLASS.high, GLASS.high + 2);
  bar(from - 0.12, to + 0.12, GLASS.low - 2, GLASS.low);
  bar(from - 0.12, from, GLASS.low, GLASS.high);
  bar(to, to + 0.12, GLASS.low, GLASS.high);
  bar((from + to) / 2 - 0.06, (from + to) / 2 + 0.06, GLASS.low, GLASS.high);
  quad(context, 'back', from - 0.2, to + 0.2, GLASS.low - 3, GLASS.low - 2, T.windowSill);
}

/* The clock and the screen */

/** The clock as an LED board: red digits over the dim segments of the ones that are off. */
export function paintLedClock(context: Context, item: WallItem, hour: number) {
  const center = item.fromX + item.width / 2;
  quad(context, 'back', center - 1.35, center + 1.35, 25, 35, T.signRim);
  quad(context, 'back', center - 1.25, center + 1.25, 26, 34, T.clock);
  const rows = clockRows(Math.floor(hour) % 24, Math.floor((hour % 1) * 60)), off = clockRows(88, 88);
  const from = center - rows[0].length / 16;
  onWallRows(context, off, { '#': T.ledOff }, 'back', from, 27);
  onWallRows(context, rows, { '#': T.clockHands }, 'back', from, 27);
}

function clockRows(hours: number, minutes: number): string[] {
  const two = (value: number) => String(value).padStart(2, '0');
  const left = glyphRows(two(hours)), right = glyphRows(two(minutes)), colon = ['.', '#', '.', '#', '.'];
  return left.map((row, index) => `${row}.${colon[index]}.${right[index]}`);
}

/** Where the karaoke's words run on its screen, and the screen itself (art pixels up, tiles along). */
const KARAOKE = { low: 17, high: 37, words: 18 };
const karaokeWords = () => glyphRows('LA LA LA');

/** The break room's screen as a karaoke: a sunset on the sea, the words at the bottom, a marquee of bulbs on top. */
export function paintKaraoke(context: Context, item: WallItem) {
  const from = item.fromX, to = from + item.width;
  quad(context, 'back', from - 0.1, to + 0.1, 14, 40, T.tvFrame);
  const columns = Math.round((item.width - 0.4) * 8);
  const sun = { column: columns / 2, z: 26 };
  for (let column = 0; column < columns; column++) for (let z = KARAOKE.low; z < KARAOKE.high; z++) {
    const along = from + 0.2 + (column + 0.5) / 8;
    let colour = css(mix(rgb(T.karaokeBottom), rgb(T.karaokeTop), (z - 24) / 13));
    const distance = Math.hypot((column - sun.column) / 1.2, z - sun.z);
    if (z >= 24 && distance < 6) colour = (z - 24) % 3 === 2 && z < 28 ? T.karaokeBottom : T.karaokeSun;
    if (z < 24) colour = Math.abs(column - sun.column) < 6 - (24 - z) * 0.6 && z % 2 ? T.karaokeSun : T.karaokeSea;
    dot(context, onWallAt('back', along, z), colour);
  }
  const words = karaokeWords();
  onWallRows(context, words, { '#': T.lyrics }, 'back', (from + to) / 2 - words[0].length / 16, KARAOKE.words);
  for (let along = from; along <= to; along += 0.25) dot(context, onWallAt('back', along, 38), T.marqueeOff);
  quad(context, 'back', (from + to) / 2 - 0.3, (from + to) / 2 + 0.3, 12, 14, T.tvFrame);
  paintSign(context, tvSign(item));
}

/** The words lighting up as they are sung, and the bulbs of the marquee running round. */
function glowKaraoke(context: Context, item: WallItem, time: number) {
  const words = karaokeWords();
  const from = item.fromX + item.width / 2 - words[0].length / 16;
  const sung = time ? Math.floor((time / 140) % (words[0].length + 12)) : words[0].length;
  glowRows(context, words.map((row) => row.slice(0, sung)), { '#': T.lyricsSung }, 'back', from, KARAOKE.words);
  const beat = Math.floor(time / 300);
  for (let index = 0, along = item.fromX; along <= item.fromX + item.width; index++, along += 0.25) {
    if ((index + beat) % 3) glowRows(context, ['#'], { '#': T.marquee }, 'back', along, 38);
  }
}

/* Light and what glows */

/** An evening in the city by day, a violet night after; the neon is always on, and spills from the windows on the floor. */
export function tokyoLighting(lighting: Lighting): Lighting {
  const night = lighting.stars;
  return {
    ...lighting,
    tint: mix(rgb(T.dayTint), rgb(T.nightTint), night),
    beam: 0.3,
    beamColor: rgb(T.neonSpill),
    reach: 0.5,
    slant: 0,
    skyTop: mix(rgb(T.skyDuskTop), rgb(T.skyNightTop), night),
    skyBottom: mix(rgb(T.skyDuskBottom), rgb(T.skyNightBottom), night),
    glow: 0.55 + 0.45 * night,
  };
}

const wallLight = (wall: Wall, along: number, z: number, colour: string, strength: number, radius = 100): ThemeLight =>
  wall === 'back' ? { x: along, y: 0.35, height: z * ART_SCALE, radius, colour, strength } : { x: 0.35, y: along, height: z * ART_SCALE, radius, colour, strength };

export function tokyoLights(layout: Layout): ThemeLight[] {
  const lights: ThemeLight[] = [];
  for (const sign of signsOf(layout)) {
    const { from, to, low, high } = boundsOf(sign);
    lights.push(wallLight(sign.wall, (from + to) / 2, (low + high) / 2, sign.neon.colour, 0.75, 70 + (to - from) * 12));
  }
  for (const each of lanternsOf(layout.door.y)) {
    const { from, to, low, high } = boundsOf(each);
    lights.push(wallLight(each.wall, (from + to) / 2, (low + high) / 2, T.lanternLit, each.big ? 0.9 : 0.5, each.big ? 80 : 50));
  }
  lights.push(wallLight(ARROW.wall, ARROW.from - 0.9, ARROW.bottom + 3, N.pink.colour, 0.5, 60));
  // the neon mirrored in the puddles
  for (const [x, y] of PUDDLES) lights.push({ x, y, height: 2, radius: 46, colour: REFLECTED[pick(`colour${x}0`, REFLECTED.length)], strength: 0.5 });
  for (const item of layout.wallItems) if (item.kind === 'clock') lights.push(wallLight('back', item.fromX + item.width / 2, 30, T.clockHands, 0.5, 60));
  for (const piece of layout.furniture) {
    const { x, y, width, depth } = piece;
    const at = (u: number, v: number, z: number, radius: number, colour: string, strength: number) => lights.push({ x: x + u, y: y + v, height: z * ART_SCALE, radius, colour, strength });
    if (piece.kind === 'desk') at(1, 0.95, 4, 50, x < 10 ? N.pink.colour : N.cyan.colour, 0.55);
    if (piece.kind === 'bossDesk') at(1.5, 0.95, 4, 70, N.cyan.colour, 0.7);
    if (piece.kind === 'floorLamp') at(0.5, 0.5, 11, 110, T.lanternLit, 0.7);
    if (piece.kind === 'cooler') at(0.5, 0.85, 18, 90, T.vendingPanel, 1);
    if (piece.kind === 'whiteboard') at(2, 0.5, 30, 140, T.board, 0.55);
    if (piece.kind === 'counter') { at(0.1, 0.9, 32, 70, T.lanternLit, 0.7); at(2.9, 0.9, 32, 70, T.lanternLit, 0.7); }
    if (piece.kind === 'bigPlant') at(0.5, 0.5, 30, 80, T.blossom, 0.35);
    if (piece.kind === 'lowTable') at(width / 2, depth / 2, 3, 45, T.lanternLit, 0.45);
    if (piece.kind === 'couch') at(width / 2, 0.95, 2, 40 + width * 8, N.pink.colour, 0.4);
    if (piece.kind === 'sofa') at(0.95, depth / 2, 2, 40 + depth * 8, N.pink.colour, 0.4);
    if (piece.kind === 'bookshelf') at(1, 0.65, 14, 60, N.violet.colour, 0.45);
  }
  return lights;
}

/** A pixel of a piece's drawing on the room's canvas (pixel-furniture.ts places its art pixels from its rounded far corner). */
function pieceDot(context: Context, piece: FurniturePiece, x: number, y: number, z: number, colour: string, alpha = 1) {
  const far = toScreen({ x: piece.x, y: piece.y });
  context.globalAlpha = alpha;
  context.fillStyle = colour;
  context.fillRect(Math.round(far.x) + Math.round((x - y) * 8) * ART_SCALE, Math.round(far.y) + Math.round((x + y) * 4 - z) * ART_SCALE, ART_SCALE, ART_SCALE);
  context.globalAlpha = 1;
}

/** Petals falling from the cherry trees, each on its own beat, swaying as they go down. */
function paintPetals(context: Context, piece: FurniturePiece, time: number) {
  for (let petal = 0; petal < 7; petal++) {
    const seed = `${piece.x}${piece.y}${petal}`;
    const period = 5200 + pick(`period${seed}`, 3000);
    const age = ((time + pick(`phase${seed}`, period)) % period) / period;
    const start = { x: 0.15 + pick(`px${seed}`, 70) / 100, y: 0.15 + pick(`py${seed}`, 70) / 100, z: 28 + pick(`pz${seed}`, 10) };
    const sway = Math.sin(age * Math.PI * 4 + petal) * 0.18;
    const z = start.z * (1 - age);
    pieceDot(context, piece, start.x + sway + age * 0.4, start.y - sway, z, petal % 3 ? T.petal : T.blossomLight, age > 0.85 ? (1 - age) / 0.15 : 1);
  }
}

/** Each effect with the depth it sits at: the neon on the walls behind everyone, the sidewalk's glow over everything, the petals with their tree. */
export function tokyoEffects(layout: Layout, time: number): ThemeEffect[] {
  const { signs, lanterns, arrow, tv } = glowing(layout);
  const wall = (paint: (context: Context) => void): ThemeEffect => ({ depth: WALL_EFFECT, paint });
  const effects: ThemeEffect[] = [
    ...signs.map((sign) => wall((context) => glowSign(context, sign, time))),
    ...lanterns.map((each) => wall((context) => glowPlaced(context, each, LANTERN_LIT, T.lanternLit))),
    { depth: Infinity, paint: glowSidewalk },
    ...layout.furniture.filter((piece) => piece.kind === 'bigPlant').map((piece) => ({ depth: furnitureDepth(piece), paint: (context: Context) => paintPetals(context, piece, time) })),
  ];
  if (arrow) {
    // from the far chevron to the near one, then all of them dark for a beat
    const lit = time ? Math.floor(time / 260) % 4 : 3;
    const tube = (index: number) => (index > 3 - lit ? N.pink.colour : N.pink.off);
    effects.push(wall((context) => glowPlaced(context, ARROW, { 1: tube(1), 2: tube(2), 3: tube(3) }, N.pink.halo)));
  }
  if (tv) effects.push(wall((context) => glowKaraoke(context, tv, time)));
  return effects;
}

export const TOKYO: ThemeKit = {
  structure: T,
  paintWalls: paintTokyoWalls,
  paintFloor: paintAsphalt,
  rugs: false,
  paintSlab: paintSidewalk,
  paintDoor: paintSlidingDoor,
  paintWindow: paintShopWindow,
  paintClock: paintLedClock,
  paintTv: paintKaraoke,
  paintSky: paintNeonSky,
  paintSkyMotion: paintRain,
  // the light through the shop windows is the neon's, on the floor only
  wallBeam: false,
  furniture: TOKYO_FURNITURE,
  lighting: tokyoLighting,
  lights: tokyoLights,
  effects: tokyoEffects,
  screenLight: N.cyan.colour,
  doorLight: N.pink.colour,
};
