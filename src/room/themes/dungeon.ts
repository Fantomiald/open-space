// The room dressed as a dungeon (themes/kit.ts), at art resolution like backdrop.ts: walls of rough stone blocks with
// moss, cracks and cobwebs, torches in iron sconces and heraldic banners, flagstones under woven carpets, a rocky spur
// with stalactites, roots and chains for a slab, an arched door with its portcullis raised, barred windows on a cavern
// of crystals, a clock of runes and a magic mirror. Dim at every hour, lit by its fires (dungeon-effects.ts); its
// furniture is in dungeon-furniture.ts, the page behind in dungeon-sky.ts.
import { DUNGEON_PALETTE as D } from '../../design/theme-dungeon.ts';
import { ROOM, type Layout, type Rug, type WallItem } from '../../../shared/room-layout.ts';
import type { Point } from '../geometry.ts';
import { mix, rgb, type Lighting } from '../lighting.ts';
import { fillPolygon, toArt, tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import type { ThemeKit } from './kit.ts';
import { WALL, line, onWall, onWallAt, type Context, type Wall } from '../wall-art.ts';
import { bannersOf, dot, noise, torchesOf, type WallSpot } from './dungeon-art.ts';
import { DUNGEON_FURNITURE } from './dungeon-furniture.ts';
import { dungeonEffects, dungeonLights } from './dungeon-effects.ts';
import { paintCavern, paintEmbers } from './dungeon-sky.ts';

/* The walls */

/** Where each course of stones starts, from the floor up: big foundation stones, then courses of six or seven. */
const COURSES = [0, 10, 16, 23, 29, 36, 42, 49];

/** A stone block of a wall, `from` to `to` columns along it (eight a tile), `bottom` to `top` art pixels up, mortar below and left. */
function paintBlock(context: Context, wall: Wall, from: number, to: number, bottom: number, top: number, colour: string, columns: number) {
  const stone = tones(colour);
  for (let column = Math.max(0, from); column < Math.min(columns, to); column++) for (let z = bottom; z < top; z++) {
    const corner = (column === from + 1 || column === to - 1) && (z === top - 1 || z === bottom + 1) && pick(`${wall}chip${from},${z}`, 3) === 0;
    const speckle = pick(`${wall}${column},${z}`, 19);
    let paint = column === from || z === bottom || corner ? D.mortar
      : z === top - 1 || column === from + 1 ? stone.light
      : z === bottom + 1 || column === to - 1 ? stone.shade
      : speckle === 0 ? stone.shade : speckle === 1 ? stone.light : colour;
    // moss in the joints and on the top of the stones, thicker near the floor
    const mossy = noise(`moss${wall}`, column, z * 1.5, 9) - Math.min(0.3, z / 110);
    if (mossy > 0.52 && (paint === D.mortar || z >= top - 2)) paint = D.moss[pick(`m${wall}${column},${z}`, D.moss.length)];
    dot(context, onWallAt(wall, column / 8, z), paint);
  }
}

/** A crack wandering down a wall from a point. */
function paintCrack(context: Context, wall: Wall, column: number, z: number, length: number) {
  for (let step = 0; step < length; step++) {
    dot(context, onWallAt(wall, column / 8, z), D.crack);
    if (step % 3 === 1) dot(context, onWallAt(wall, (column + 1) / 8, z), tones(D.stones[0]).light);
    column += pick(`${wall}crack${column},${z}`, 3) - 1;
    z -= 1;
  }
}

/** A cobweb in a top corner of a wall: threads from the corner, and rings across them. */
function paintWeb(context: Context, wall: Wall, corner: number, direction: 1 | -1, size: number) {
  const point = (radius: number, angle: number) => onWallAt(wall, corner + (direction * Math.cos(angle) * radius) / 8, WALL - 1 - Math.sin(angle) * radius);
  const angles = [0.08, 0.5, 0.95, 1.45];
  for (const angle of angles) line(context, point(0, 0), point(size, angle), D.web);
  for (const share of [0.4, 0.7, 1]) for (let index = 1; index < angles.length; index++) line(context, point(size * share, angles[index - 1]), point(size * share * 0.92, angles[index]), D.web);
}

export function paintStoneWalls(context: Context) {
  for (const wall of ['back', 'left'] as const) {
    const columns = (wall === 'back' ? ROOM.width : ROOM.depth) * 8;
    const stones = wall === 'back' ? D.stones : D.stonesSide;
    COURSES.forEach((bottom, course) => {
      const top = COURSES[course + 1] ?? WALL;
      const foundation = course === 0;
      for (let column = -pick(`${wall}offset${course}`, 12); column < columns;) {
        const length = (foundation ? 15 : 8) + pick(`${wall}${course}:${column}`, foundation ? 10 : 9);
        paintBlock(context, wall, column, column + length, bottom, top, stones[pick(`${wall}stone${course}:${column}`, stones.length)], columns);
        column += length;
      }
    });
    for (let index = 0; index < columns / 24; index++) {
      paintCrack(context, wall, pick(`${wall}crackx${index}`, columns), 16 + pick(`${wall}crackz${index}`, 28), 4 + pick(`${wall}crackl${index}`, 7));
    }
  }
  paintWeb(context, 'back', 0, 1, 9);
  paintWeb(context, 'left', 0, 1, 7);
  paintWeb(context, 'back', ROOM.width, -1, 6);
  paintWeb(context, 'left', ROOM.depth, -1, 6);
}

/* What hangs on the walls, where the room leaves space for it (see dungeon-art.ts) */

/** A torch in its iron sconce, one letter a pixel; its flame is drawn every frame (dungeon-effects.ts). */
const SCONCE = [
  '.hhh.',
  '.hth.',
  '..w..',
  '..w..',
  '..w..',
  'iIiIi',
  '.iii.',
  '..i..',
  '..i..',
  '.iIi.',
  '.i.i.',
];
export const SCONCE_TOP = 35;
const SCONCE_PAINT = { h: D.torchHead, t: tones(D.torchHead).light, w: D.torchWood, i: D.sconce, I: D.sconceLight };

/** A heraldic banner on its rod: a gold trim, a fold, a sword, a swallowtail; one letter a pixel. */
const BANNER = [
  'ggggggg',
  'gccccfg',
  'gccecfg',
  'gceeefg',
  'gccecfg',
  'gccecfg',
  'gccecfg',
  'gccecfg',
  'gccccfg',
  'gccccfg',
  'gccccfg',
  'gccccfg',
  'gccccfg',
  'gcc.cfg',
  'gc...fg',
  'g.....g',
];
const BANNER_TOP = 46;

function paintBanner(context: Context, { wall, along }: WallSpot, index: number) {
  const cloth = D.banners[index % D.banners.length];
  const from = along - 3 / 8;
  line(context, onWallAt(wall, from - 0.15, BANNER_TOP + 1), onWallAt(wall, from + 1.02, BANNER_TOP + 1), D.rod);
  for (const end of [from - 0.15, from + 1.02]) dot(context, onWallAt(wall, end, BANNER_TOP + 2), D.bannerTrim);
  onWall(context, BANNER, { g: D.bannerTrim, c: cloth, f: tones(cloth).shade, e: D.bannerTrim }, wall, from, BANNER_TOP - BANNER.length + 1);
}

/** A chain sagging between two hooks high on a wall, and a shackle hanging from it. */
function paintChains(context: Context, wall: Wall, from: number, to: number) {
  for (let along = from, index = 0; along <= to; along += 1 / 8, index++) {
    const t = (along - from) / (to - from);
    const z = 44 - Math.round(Math.sin(t * Math.PI) * 5);
    dot(context, onWallAt(wall, along, z), index % 2 ? D.chainLight : D.chain);
    if (index % 2) dot(context, onWallAt(wall, along, z + 1), D.chain);
  }
  const middle = (from + to) / 2;
  for (let z = 38; z < 42; z++) dot(context, onWallAt(wall, middle, z), z % 2 ? D.chainLight : D.chain);
  onWall(context, ['.c.', 'c.c', 'c.c', '.c.'], { c: D.chainLight }, wall, middle - 1 / 8, 34);
}

/** The sconces, banners and chains: where they go depends on the room (the floor is painted with its layout, the walls without). */
function paintWallDressing(context: Context, layout: Layout) {
  for (const torch of torchesOf(layout)) onWall(context, SCONCE, SCONCE_PAINT, torch.wall, torch.along - 2 / 8, SCONCE_TOP - SCONCE.length + 1);
  for (const [index, banner] of bannersOf(layout).entries()) paintBanner(context, banner, index);
  if (layout.wallItems.some((item) => item.kind === 'tv')) paintChains(context, 'left', 2.7, 3.7);
  else paintChains(context, 'back', 0.15, 0.9);
}

/* The floor */

const floorQuad = (context: Context, x: number, y: number, width: number, depth: number, colour: string) =>
  fillPolygon(context, [toArt({ x, y }), toArt({ x: x + width, y }), toArt({ x: x + width, y: y + depth }), toArt({ x, y: y + depth })], colour);

/** A flagstone: lit along its back and left edges, its joints dark, worn and speckled, sometimes cracked. */
function paintFlagstone(context: Context, x: number, y: number, width: number) {
  const key = `${x},${y}`;
  const colour = D.planks[pick(`flag${key}`, D.planks.length)];
  floorQuad(context, x, y, width, 1, colour);
  line(context, toArt({ x, y }), toArt({ x: x + width, y }), D.plankLight);
  line(context, toArt({ x, y }), toArt({ x, y: y + 1 }), D.plankLight);
  line(context, toArt({ x: x + width, y }), toArt({ x: x + width, y: y + 1 }), D.plankSeam);
  line(context, toArt({ x, y: y + 1 }), toArt({ x: x + width, y: y + 1 }), D.plankSeam);
  for (let index = 0; index < width * 7; index++) {
    const at = toArt({ x: x + 0.1 + (pick(`fx${key}${index}`, 80) / 100) * width, y: y + 0.1 + pick(`fy${key}${index}`, 80) / 100 });
    dot(context, at, index % 3 ? tones(colour).shade : tones(colour).light);
  }
  if (pick(`crack${key}`, 5) === 0) {
    let at = toArt({ x: x + 0.2 + (pick(`cx${key}`, 60) / 100) * width, y: y + 0.2 });
    for (let step = 0; step < 6; step++) {
      dot(context, at, D.plankSeam);
      at = { x: at.x + pick(`cs${key}${step}`, 3) - 1, y: at.y + 1 };
    }
  }
}

/** Moss creeping out of the joints, more of it near the walls. */
function paintFloorMoss(context: Context) {
  for (let y = 0; y < ROOM.depth; y += 1 / 8) for (let x = 0; x < ROOM.width; x += 1 / 8) {
    const onJoint = Math.abs(y - Math.round(y)) < 0.07 || pick(`joint${Math.floor(y)}`, 2) === 0 && Math.abs(x - Math.round(x)) < 0.07;
    const nearWall = Math.max(0, 1.6 - Math.min(x, y)) * 0.25;
    if (onJoint && noise('floormoss', x * 8, y * 16, 10) + nearWall > 0.66) dot(context, toArt({ x, y }), D.moss[pick(`fm${x},${y}`, D.moss.length)]);
  }
}

/** A woven carpet: a dark edge, a gold border, lozenges down its middle and a fringe at both ends. */
function paintCarpet(context: Context, rug: Rug) {
  const colour = D.rugs[rug.colour];
  const weave = tones(colour);
  const { x, y, width, depth } = rug;
  floorQuad(context, x, y, width, depth, weave.dark);
  floorQuad(context, x + 0.1, y + 0.1, width - 0.2, depth - 0.2, colour);
  floorQuad(context, x + 0.3, y + 0.3, width - 0.6, depth - 0.6, D.rugTrim);
  floorQuad(context, x + 0.36, y + 0.36, width - 0.72, depth - 0.72, weave.shade);
  floorQuad(context, x + 0.5, y + 0.5, width - 1, depth - 1, colour);
  const long = width >= depth;
  const lozenge = (cx: number, cy: number, size: number, paint: string) =>
    fillPolygon(context, [toArt({ x: cx, y: cy - size }), toArt({ x: cx + size, y: cy }), toArt({ x: cx, y: cy + size }), toArt({ x: cx - size, y: cy })], paint);
  const count = Math.max(1, Math.floor((long ? width : depth) - 1.4));
  for (let index = 0; index < count; index++) {
    const share = (index + 0.5) / count;
    const cx = long ? x + 0.7 + share * (width - 1.4) : x + width / 2, cy = long ? y + depth / 2 : y + 0.7 + share * (depth - 1.4);
    lozenge(cx, cy, Math.min(0.42, (long ? depth : width) / 2 - 0.62), index % 2 ? D.rugTrim : weave.light);
    lozenge(cx, cy, Math.min(0.2, (long ? depth : width) / 2 - 0.8), weave.dark);
  }
  // the fringe, on the two short ends
  for (let along = 0.15; along < (long ? depth : width) - 0.1; along += 0.25) {
    if (long) for (const end of [x, x + width]) line(context, toArt({ x: end, y: y + along }), toArt({ x: end + (end === x ? -0.14 : 0.14), y: y + along }), D.rugFringe);
    else for (const end of [y, y + depth]) line(context, toArt({ x: x + along, y: end }), toArt({ x: x + along, y: end + (end === y ? -0.14 : 0.14) }), D.rugFringe);
  }
}

/** Lost coins on free flagstones. */
function paintLitter(context: Context, layout: Layout) {
  const taken = (x: number, y: number) => layout.furniture.some((piece) => x >= piece.x - 0.5 && x < piece.x + piece.width + 0.5 && y >= piece.y - 0.5 && y < piece.y + piece.depth + 0.5)
    || layout.rugs.some((rug) => x >= rug.x && x < rug.x + rug.width && y >= rug.y && y < rug.y + rug.depth);
  for (let index = 0; index < 40; index++) {
    const x = 0.6 + pick(`litx${index}`, 188) / 10, y = 0.6 + pick(`lity${index}`, 128) / 10;
    if (taken(x, y)) continue;
    const at = toArt({ x, y });
    dot(context, at, D.coin);
    if (index % 2) dot(context, { x: at.x + 1, y: at.y }, tones(D.coin).shade);
  }
}

function paintFlagstones(context: Context, layout: Layout) {
  for (let y = 0; y < ROOM.depth; y++) {
    for (let x = -(y % 2) * 0.5 - pick(`row${y}`, 2) * 0.5; x < ROOM.width;) {
      const length = [1, 1.5, 2][pick(`len${x},${y}`, 3)];
      const from = Math.max(0, x), to = Math.min(ROOM.width, x + length);
      paintFlagstone(context, from, y, to - from);
      x += length;
    }
  }
  paintFloorMoss(context);
  paintLitter(context, layout);
  for (const rug of layout.rugs) paintCarpet(context, rug);
  paintWallDressing(context, layout);
}

/* Under the floor: a spur of rock torn from the cavern */

/** The rock under the floor's edge (from `left` to `front` to `right`), its ragged bottom, stalactites, roots and two chains. */
export function paintRockSpur(context: Context, left: Point, front: Point, right: Point, height: number, underside: number) {
  const bottomLimit = context.canvas.height - 1;
  const edgeAt = (x: number) => (x <= front.x ? left.y + ((front.y - left.y) * (x - left.x)) / (front.x - left.x) : front.y + ((right.y - front.y) * (x - front.x)) / (right.x - front.x));
  const bottoms = new Map<number, number>();
  for (let x = Math.ceil(left.x); x < right.x; x++) {
    const top = Math.round(edgeAt(x + 0.5));
    const bottom = Math.min(bottomLimit, top + height + underside + 1 + Math.round(noise('spur', x, 0, 6) * 6));
    bottoms.set(x, bottom);
    const lit = x < front.x;
    for (let y = top; y <= bottom; y++) {
      const depth = y - top;
      const stratum = (depth + Math.round(noise('strata', x, 0, 9) * 3)) % 4 === 0 && depth > 1;
      const speckle = pick(`rock${x},${y}`, 11);
      let colour = lit ? D.rock : D.rockDark;
      if (depth === 0) colour = lit ? D.rockLight : D.rock;
      else if (stratum) colour = lit ? D.rockDark : D.slabUnder;
      else if (y >= bottom - 1) colour = lit ? D.rockDark : D.slabUnder;
      else if (speckle === 0) colour = lit ? D.rockLight : D.rock;
      dot(context, { x, y }, colour);
    }
    // moss on the lip, dripping over it here and there
    if (noise('lipmoss', x, 0, 5) > 0.45) {
      const drip = pick(`drip${x}`, 4);
      for (let y = top; y <= top + drip; y++) dot(context, { x, y }, D.moss[(x + y) % D.moss.length]);
    }
  }
  // stalactites hanging under the rock, shorter where the page ends below
  for (let x = Math.ceil(left.x) + 2; x < right.x - 2; x += 3 + pick(`gap${x}`, 6)) {
    const from = bottoms.get(x) ?? 0;
    const length = Math.min(bottomLimit - from, 3 + pick(`stalactite${x}`, 15));
    const half = 1 + pick(`width${x}`, 2);
    const lit = x < front.x;
    for (let row = 0; row < length; row++) {
      const reach = Math.round(half * (1 - row / length));
      for (let across = -reach; across <= reach; across++) dot(context, { x: x + across, y: from + row }, across === -reach && lit ? D.rockLight : lit ? D.rock : D.rockDark);
    }
  }
  // roots wriggling out from under the floor
  for (let x = Math.ceil(left.x) + 5; x < right.x - 3; x += 9 + pick(`rootgap${x}`, 14)) {
    let at = { x, y: Math.round(edgeAt(x)) + 2 };
    const length = Math.min(bottomLimit - at.y, 10 + pick(`root${x}`, 18));
    for (let step = 0; step < length; step++) {
      dot(context, at, step % 4 === 0 ? D.rootLight : D.root);
      if (step === 6 && pick(`branch${x}`, 2) === 0) for (let twig = 1; twig < 4; twig++) dot(context, { x: at.x + twig, y: at.y + twig }, D.root);
      at = { x: at.x + (pick(`wiggle${x},${step}`, 5) === 0 ? (pick(`side${x},${step}`, 2) ? 1 : -1) : 0), y: at.y + 1 };
    }
  }
  // two chains, as if the spur had been torn from its moorings
  for (const share of [0.3, 0.72]) {
    const x = Math.round(share < 0.5 ? left.x + (front.x - left.x) * share * 2 : front.x + (right.x - front.x) * (share - 0.5) * 2);
    const from = bottoms.get(x) ?? 0;
    const length = Math.min(bottomLimit - from, 22);
    for (let row = 0; row < length; row++) {
      if (row % 3 === 1) { dot(context, { x: x - 1, y: from + row }, D.chain); dot(context, { x: x + 1, y: from + row }, D.chainLight); }
      else dot(context, { x, y: from + row }, row % 3 ? D.chainLight : D.chain);
    }
  }
}

/* The door */

/** The doorway in the left wall under an arch of wedge stones, a skull for a keystone, the portcullis raised in it. */
export function paintArchedDoor(context: Context, from: number, to: number, height: number) {
  const middle = ((from + to) / 2) * 8, half = ((to - from) / 2) * 8;
  const spring = height - 3;
  const inArch = (dx: number, z: number, grow: number) => Math.abs(dx) <= half + grow && (z < spring || (dx / (half + grow)) ** 2 + ((z - spring) / (6 + grow)) ** 2 <= 1);
  for (let column = Math.floor(middle - half - 4); column <= Math.ceil(middle + half + 4); column++) for (let z = 0; z <= spring + 11; z++) {
    const dx = column + 0.5 - middle;
    const at = onWallAt('left', column / 8, z);
    if (inArch(dx, z, 0)) {
      // the passage beyond: steps down into the dark, the light of a torch below
      const glow = Math.max(0, 1 - z / 9);
      let colour = glow > 0 ? (z % 3 === 0 ? D.doorway : tones(D.doorLight).dark) : D.doorway;
      if (glow > 0.6 && z % 3) colour = tones(D.doorLight).shade;
      // the portcullis, raised: its grid in the top of the opening, its spikes below
      const bar = Math.round(dx + half) % 3 === 1;
      if (z >= spring - 6 && (bar || z === spring - 3 || z === spring + 1)) colour = z % 2 ? D.portcullis : tones(D.portcullis).light;
      if (z === spring - 7 && bar) colour = D.portcullis;
      dot(context, at, colour);
    } else if (inArch(dx, z, 3)) {
      const stone = tones(D.doorFrame);
      const angle = z < spring ? Math.floor(z / 5) : 10 + Math.floor((Math.atan2(z - spring, dx) / Math.PI) * 7);
      const joint = z < spring ? z % 5 === 0 : Math.abs(((Math.atan2(z - spring, dx) / Math.PI) * 7) % 1) < 0.14;
      const outer = !inArch(dx, z, 2);
      dot(context, at, joint || outer ? D.mortar : angle % 2 ? stone.light : D.doorFrame);
    }
  }
  // the skull on the keystone
  onWall(context, ['.sss.', 'sksks', 'sssss', '.sds.'], { s: D.skull, k: D.ink, d: D.skullShade }, 'left', (middle - 2) / 8, spring + 6);
}

/* The windows: arches with bars, on a cavern of crystals */

const ARCH = { half: 4, low: 18, spring: 31, rise: 5 };

/** What the windows show at a pixel (gx along the whole window, gz up the wall): far rocks, their crystals, a glow below. */
function cavernAt(gx: number, gz: number, seed: number): string {
  const height = (gz - ARCH.low) / (ARCH.spring + ARCH.rise - ARCH.low);
  const ridge = Math.round(ARCH.low + 3 + noise(`ridge${seed}`, gx, 0, 7) * 9);
  const ceiling = ARCH.spring + ARCH.rise - 2 - Math.max(0, noise(`ceiling${seed}`, gx, 0, 3) - 0.35) * 14;
  // a cluster of crystals on the ridge, here and there: a shard of two columns, lit on its left
  const cluster = Math.floor(gx / 6);
  const shard = pick(`crystal${seed}${cluster}`, 3) === 0 ? gx - cluster * 6 - 2 : -1;
  const tall = 2 + pick(`crystalh${seed}${cluster}`, 4);
  if (gz > ceiling) return D.caveNear;
  if ((shard === 0 || shard === 1) && gz >= ridge - 1 && gz < ridge + tall - shard) return shard === 0 ? D.crystal : tones(D.crystal).shade;
  if (gz < ridge) return ridge - gz <= 1 ? D.caveEdge : pick(`glint${seed}${gx},${gz}`, 37) === 0 ? tones(D.crystal).dark : D.caveFar;
  return height < 0.2 ? D.caveBottom : height < 0.5 ? D.caveMiddle : D.caveTop;
}

export function paintBarredWindows(context: Context, item: WallItem) {
  const arches = Math.max(1, Math.round(item.width / 1.55));
  const spacing = item.width / arches;
  const { half, low, spring, rise } = ARCH;
  const inside = (dx: number, z: number, grow: number) => Math.abs(dx) <= half + grow && z >= low - grow && (z <= spring || (dx / (half + grow)) ** 2 + ((z - spring) / (rise + grow)) ** 2 <= 1);
  for (let index = 0; index < arches; index++) {
    const middle = (item.fromX + spacing * (index + 0.5)) * 8;
    for (let column = Math.floor(middle - half - 4); column <= Math.ceil(middle + half + 4); column++) for (let z = low - 4; z <= spring + rise + 3; z++) {
      const dx = column + 0.5 - middle;
      const at = onWallAt('back', column / 8, z);
      if (inside(dx, z, 0)) {
        const bar = Math.round(dx) === -2 || Math.round(dx) === 2 || z === 25;
        dot(context, at, bar ? D.bars : cavernAt(column - item.fromX * 8, z, Math.round(item.fromX)));
      } else if (inside(dx, z, 2)) {
        const stone = tones(D.windowFrame);
        const joint = z < spring ? z % 4 === 0 : Math.abs(((Math.atan2(z - spring, dx) / Math.PI) * 6) % 1) < 0.16;
        dot(context, at, joint ? D.mortar : dx < 0 ? stone.light : D.windowFrame);
      } else if (z >= low - 4 && z < low - 2 && Math.abs(dx) <= half + 3) {
        dot(context, at, z === low - 3 ? D.windowSill : tones(D.windowSill).shade);
      }
    }
  }
}

/* The clock: a circle of runes */

export function paintRuneClock(context: Context, item: WallItem, hour: number) {
  const middle = item.fromX + item.width / 2, centre = 32, radius = 7;
  const at = (dx: number, dz: number) => onWallAt('back', middle + dx / 8, centre + dz);
  const stone = tones(D.clock);
  for (let dz = -radius - 1; dz <= radius + 1; dz++) for (let dx = -radius - 1; dx <= radius + 1; dx++) {
    const distance = Math.hypot(dx, dz);
    if (distance > radius + 0.5) continue;
    const toward = (-dx + dz) / Math.max(1, distance);
    const colour = distance > radius - 1.2 ? (toward > 0.5 ? stone.light : toward < -0.5 ? stone.dark : D.clock) : distance > radius - 3.4 ? stone.dark : stone.shade;
    dot(context, at(dx, dz), colour);
  }
  const now = Math.floor(hour) % 12;
  for (let mark = 0; mark < 12; mark++) {
    const angle = (mark / 12) * Math.PI * 2;
    const colour = mark === now ? D.runeLit : D.rune;
    const dx = Math.round(Math.sin(angle) * (radius - 2.2)), dz = Math.round(Math.cos(angle) * (radius - 2.2));
    dot(context, at(dx, dz), colour);
    if (mark % 3 === 0 || mark === now) dot(context, at(dx, dz + (mark % 2 ? -1 : 1)), colour);
  }
  const hand = (turns: number, length: number, colour: string) => line(context, at(0, 0), at(Math.round(Math.sin(turns * Math.PI * 2) * length), Math.round(Math.cos(turns * Math.PI * 2) * length)), colour);
  hand(hour % 1, 4, D.rune);
  hand((hour % 12) / 12, 3, D.runeLit);
  dot(context, at(0, 0), D.runeLit);
}

/* The break room's TV: a magic mirror */

export function paintMagicMirror(context: Context, item: WallItem) {
  const middle = item.fromX + item.width / 2, centre = 27;
  const across = item.width * 4 - 3, high = 10;
  const gold = tones(D.tvFrame);
  const glass = tones(D.tvScreen);
  for (let dz = -high - 3; dz <= high + 3; dz++) for (let dx = -across - 3; dx <= across + 3; dx++) {
    const inGlass = (dx / across) ** 2 + (dz / high) ** 2;
    const inFrame = (dx / (across + 2.5)) ** 2 + (dz / (high + 2.5)) ** 2;
    const at = onWallAt('back', middle + dx / 8, centre + dz);
    if (inGlass <= 1) {
      const mist = noise('mist', dx * 0.6 + dz * 1.2, dz * 2.2, 6);
      let colour = dz > high * 0.4 ? glass.shade : dz < -high * 0.5 ? glass.dark : D.tvScreen;
      if (mist > 0.6 && mist < 0.68) colour = D.mirrorMist;
      else if (mist > 0.55 && mist <= 0.6) colour = glass.light;
      if (pick(`mirror${dx},${dz}`, 41) === 0) colour = D.mirrorStar;
      // a sheen across the glass, from its top left
      if (Math.abs(dx + dz * 2 + across * 0.45) < 1 && inGlass < 0.8) colour = glass.light;
      dot(context, at, colour);
    } else if (inFrame <= 1) {
      const toward = (-dx / across + dz / high) / 1.4;
      dot(context, at, toward > 0.35 ? gold.light : toward < -0.35 ? gold.shade : D.tvFrame);
    }
  }
  // a crest on top and a claw under it
  onWall(context, ['..g..', '.ggg.', 'gglgg', '.g.g.'], { g: D.tvFrame, l: D.runeLit }, 'back', middle - 2 / 8, centre + high + 2);
  onWall(context, ['.ggg.', 'g...g'], { g: gold.shade }, 'back', middle - 2 / 8, centre - high - 4);
}

/* The light: a dungeon is dim at every hour, a little more so at night */

function dungeonLighting(lighting: Lighting): Lighting {
  const night = lighting.stars;
  const evening = Math.max(0, 1 - Math.abs(night - 0.5) * 2);
  const tint = mix(mix(rgb(D.shade.day), rgb(D.shade.night), night), rgb(D.shade.dusk), evening * 0.5);
  return { ...lighting, tint, glow: 1, beam: 0, stars: 0 };
}

export const DUNGEON: ThemeKit = {
  structure: D,
  paintWalls: paintStoneWalls,
  paintFloor: paintFlagstones,
  rugs: false,
  paintSlab: paintRockSpur,
  paintDoor: paintArchedDoor,
  paintWindow: (context, item) => paintBarredWindows(context, item),
  paintClock: paintRuneClock,
  paintTv: paintMagicMirror,
  paintSky: paintCavern,
  paintSkyMotion: paintEmbers,
  wallBeam: false,
  furniture: DUNGEON_FURNITURE,
  lighting: dungeonLighting,
  lights: dungeonLights,
  effects: dungeonEffects,
  screenLight: D.light.candle,
  doorLight: D.light.torch,
};
