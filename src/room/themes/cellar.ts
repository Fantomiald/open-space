// The room dressed as a hackers' cellar (themes/kit.ts), at art resolution like backdrop.ts: old brick under flaking
// plaster over waist-high concrete, pipes and bundles of cable, caged bulbs, stained concrete underfoot with rubber
// mats, a chunk of rock with cables for a slab, a steel door under a red exit sign, walls of old screens where the
// windows would be, a red LED clock and a big terminal for the TV. Dim at every hour; what moves is in
// cellar-effects.ts, the furniture in cellar-furniture.ts, the page behind in cellar-sky.ts.
import { modsObject } from './mods-object.ts';
import { CELLAR_PALETTE as K } from '../../design/theme-cellar.ts';
import { ROOM, type Layout, type Rug, type WallItem } from '../../../shared/room-layout.ts';
import type { Point } from '../geometry.ts';
import { css, mix, rgb, type Lighting } from '../lighting.ts';
import { fillPolygon, toArt, tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import { WALL, glyphRows, line, onWall, onWallAt, sagging, textLength, wallText, type Context, type Wall } from '../wall-art.ts';
import { dot, noise, torchesOf, wallIsFree } from './dungeon-art.ts';
import { CELLAR_FURNITURE } from './cellar-furniture.ts';
import { THEME_PORTALS } from './portals.ts';
import { cellarEffects, cellarLights, screensOf, TV_SCREEN } from './cellar-effects.ts';
import { paintCaveDark, paintTerminalText } from './cellar-sky.ts';
import type { ThemeKit } from './kit.ts';

/* The walls */

const WAIST = 12;

function paintWallFace(context: Context, wall: Wall) {
  const columns = (wall === 'back' ? ROOM.width : ROOM.depth) * 8;
  const bricks = wall === 'back' ? K.bricks : K.bricksSide;
  const plaster = wall === 'back' ? K.plaster : K.plasterSide;
  const concrete = wall === 'back' ? K.concrete : K.concreteSide;
  for (let column = 0; column < columns; column++) for (let z = 0; z < WALL; z++) {
    let colour: string;
    if (z < WAIST) {
      // poured concrete, the marks of its boards, a line of holes
      const board = z === WAIST - 1 || z % 6 === 0;
      colour = board ? K.concreteSeam : pick(`${wall}c${column},${z}`, 13) === 0 ? tones(concrete).shade : concrete;
    } else {
      const course = Math.floor(z / 4);
      const brickAt = Math.floor((column + (course % 2) * 4) / 8);
      const joint = z % 4 === 0 || (column + (course % 2) * 4) % 8 === 0;
      const flaking = noise(`${wall}plaster`, column, z * 1.4, 16) + noise(`${wall}flake`, column, z, 4) * 0.25;
      if (flaking > 0.82) colour = plaster[pick(`${wall}p${column},${z}`, plaster.length)];
      else if (flaking > 0.79) colour = K.mortar;
      else if (joint) colour = K.mortar;
      else {
        const brick = bricks[pick(`${wall}b${course}:${brickAt}`, bricks.length)];
        colour = pick(`${wall}s${column},${z}`, 17) === 0 ? tones(brick).shade : brick;
      }
    }
    // damp running down from the top of the wall
    const damp = (noise(`${wall}damp`, column, 0, 7) - 0.52) * 2.4 - (WALL - z) / WALL * 0.9 + noise(`${wall}dampz`, column, z, 5) * 0.2;
    if (damp > 0) colour = css(mix(rgb(colour), rgb(K.damp), Math.min(0.7, damp * 2)));
    dot(context, onWallAt(wall, column / 8, z), colour);
  }
}

/** A pipe along a wall, `size` art pixels thick, lit on top, on brackets, rusty at its joints. */
function paintPipe(context: Context, wall: Wall, z: number, size: number) {
  const columns = (wall === 'back' ? ROOM.width : ROOM.depth) * 8;
  for (let column = 0; column < columns; column++) {
    const joint = column % 44 < 2;
    for (let up = 0; up < size; up++) {
      const colour = joint ? (up === size - 1 ? K.rust : tones(K.rust).shade) : up === size - 1 ? K.pipeLight : up === 0 ? K.pipeDark : K.pipe;
      dot(context, onWallAt(wall, column / 8, z + up), colour);
    }
    if (column % 44 === 22) dot(context, onWallAt(wall, column / 8, z - 1), K.pipeDark);
    if (pick(`rust${wall}${column}`, 31) === 0) dot(context, onWallAt(wall, column / 8, z), K.rust);
  }
}

export function paintCellarWalls(context: Context) {
  for (const wall of ['back', 'left'] as const) {
    paintWallFace(context, wall);
    paintPipe(context, wall, WALL - 5, 3);
    paintPipe(context, wall, WALL - 8, 1);
    const length = wall === 'back' ? ROOM.width : ROOM.depth;
    // bundles of cable looping from hook to hook under the pipes
    sagging(context, wall, 0.2, length - 0.2, WALL - 9, 2.4, 3, K.cable);
    sagging(context, wall, 0.5, length - 0.3, WALL - 10, 3.1, 4, K.cableBlue);
    sagging(context, wall, 1.1, length - 0.6, WALL - 9, 3.7, 5, K.cableRed);
  }
}

/* What hangs on the walls, where the room leaves space for it */

/** A caged bulb on its conduit, one letter a pixel; its glow is drawn every frame (cellar-effects.ts). */
const CAGED_BULB = [
  '..c..',
  '..c..',
  '..c..',
  '..c..',
  '..c..',
  '.ggg.',
  'gbbbg',
  'gbBbg',
  'gbbbg',
  '.ggg.',
];
export const BULB_TOP = 36;

/** Words on the left wall, `end` the tile they start from on screen: it runs towards the viewer, so they are written from its far end, mirrored. */
function leftWallText(context: Context, text: string, end: number, bottom: number, ink: string) {
  onWall(context, glyphRows(text).map((row) => [...row].reverse().join('')), { '#': ink }, 'left', end - textLength(text), bottom);
}

const BREAKER = [
  'bbbbbbbbb',
  'bdddddddb',
  'bdsdsdsdb',
  'bdddddddb',
  'bdsdsdsdb',
  'bdddddddb',
  'bbbbbbbbb',
];

function paintWallDressing(context: Context, layout: Layout) {
  for (const { wall, along } of torchesOf(layout)) onWall(context, CAGED_BULB, { c: K.cable, g: K.steelDark, b: K.bulb, B: K.bulbCore }, wall, along - 2 / 8, BULB_TOP - CAGED_BULB.length + 1);
  // a word in chalk on the bricks of the left wall, a breaker box next to the door
  const door = layout.door.y;
  if (wallIsFree(layout, { wall: 'left', along: 3.1 }, 1.6)) {
    leftWallText(context, 'HELLO', 4.4, 36, K.chalk);
    leftWallText(context, 'WORLD_', 4.5, 29, K.chalk);
  }
  if (wallIsFree(layout, { wall: 'left', along: door + 2.8 }, 0.7)) onWall(context, BREAKER, { b: K.box, d: K.casingDark, s: K.steelLight }, 'left', door + 2.3, 22);
}

/* The floor */

const floorQuad = (context: Context, x: number, y: number, width: number, depth: number, colour: string) =>
  fillPolygon(context, [toArt({ x, y }), toArt({ x: x + width, y }), toArt({ x: x + width, y: y + depth }), toArt({ x, y: y + depth })], colour);

function paintConcrete(context: Context) {
  for (let y = 0; y < ROOM.depth; y += 2) for (let x = 0; x < ROOM.width; x += 2) {
    floorQuad(context, x, y, 2, 2, K.planks[pick(`pour${x},${y}`, K.planks.length)]);
    line(context, toArt({ x, y }), toArt({ x: x + 2, y }), K.plankSeam);
    line(context, toArt({ x, y }), toArt({ x, y: y + 2 }), K.plankSeam);
  }
  // stains and specks, more of them under the walls
  for (let y = 0; y < ROOM.depth; y += 1 / 8) for (let x = 0; x < ROOM.width; x += 1 / 8) {
    const nearWall = Math.max(0, 1.4 - Math.min(x, y)) * 0.2;
    const stain = noise('cellarstain', x * 8, y * 16, 18) + nearWall;
    if (stain > 0.72) dot(context, toArt({ x, y }), K.stain);
    else if (pick(`speck${x},${y}`, 37) === 0) dot(context, toArt({ x, y }), K.plankLight);
  }
}

/** A crack wandering across the floor. */
function paintCrack(context: Context, x: number, y: number, seed: number) {
  for (let step = 0; step < 34; step++) {
    dot(context, toArt({ x, y }), K.plankSeam);
    x += 1 / 8;
    y += (pick(`fcrack${seed},${step}`, 3) - 1) / 8;
  }
}

const isTaken = (layout: Layout, x: number, y: number, margin: number) => layout.furniture.some((piece) => x >= piece.x - margin && x < piece.x + piece.width + margin && y >= piece.y - margin && y < piece.y + piece.depth + margin)
  || layout.rugs.some((rug) => x >= rug.x - margin && x < rug.x + rug.width + margin && y >= rug.y - margin && y < rug.y + rug.depth + margin);

function paintDrain(context: Context, x: number, y: number) {
  floorQuad(context, x, y, 0.75, 0.75, K.drain);
  for (let bar = 0.12; bar < 0.75; bar += 0.18) line(context, toArt({ x: x + bar, y }), toArt({ x: x + bar, y: y + 0.75 }), K.steelDark);
}

function paintPuddle(context: Context, cx: number, cy: number, size: number) {
  for (let dy = -size; dy <= size; dy += 1 / 8) for (let dx = -size * 1.6; dx <= size * 1.6; dx += 1 / 8) {
    const wobble = noise('puddle', (cx + dx) * 8, (cy + dy) * 8, 5) * 0.4;
    const reach = (dx / (size * 1.6)) ** 2 + (dy / size) ** 2 + wobble;
    if (reach < 1) dot(context, toArt({ x: cx + dx, y: cy + dy }), reach > 0.86 ? K.plankSeam : pick(`glint${dx},${dy}`, 12) === 0 ? K.puddleLight : K.puddle);
  }
}

/** A rubber mat where the office has rugs: a raised edge, rows of studs. */
function paintMat({ x, y, width, depth, colour }: Rug, context: Context) {
  const rubber = K.rugs[colour];
  floorQuad(context, x, y, width, depth, tones(rubber).dark);
  floorQuad(context, x + 0.08, y + 0.08, width - 0.16, depth - 0.16, rubber);
  for (let along = 0.25; along < depth - 0.1; along += 0.25) for (let across = 0.25; across < width - 0.1; across += 0.5) {
    dot(context, toArt({ x: x + across + (Math.round(along * 4) % 2) * 0.25, y: y + along }), tones(rubber).light);
  }
}

/** Cans and butts on free concrete. */
function paintLitter(context: Context, layout: Layout) {
  for (let index = 0; index < 44; index++) {
    const x = 0.5 + pick(`litterx${index}`, 190) / 10, y = 0.5 + pick(`littery${index}`, 130) / 10;
    if (isTaken(layout, x, y, 0.4)) continue;
    const at = toArt({ x, y });
    if (index % 5 === 0) {
      dot(context, at, K.can);
      dot(context, { x: at.x + 1, y: at.y }, tones(K.can).shade);
      dot(context, { x: at.x, y: at.y - 1 }, K.steelLight);
    } else dot(context, at, K.butt);
  }
}

function paintCellarFloor(context: Context, layout: Layout) {
  paintConcrete(context);
  paintCrack(context, 3, 3, 1);
  paintCrack(context, 12, 9, 2);
  paintCrack(context, 7, 11, 3);
  if (!isTaken(layout, 16.5, 6.5, 1)) paintDrain(context, 16.1, 6.1);
  if (!isTaken(layout, 5, 5.5, 1.2)) paintPuddle(context, 5, 5.5, 0.55);
  if (!isTaken(layout, 14.5, 11.8, 1.2)) paintPuddle(context, 14.5, 11.8, 0.4);
  for (const rug of layout.rugs) paintMat(rug, context);
  paintLitter(context, layout);
  paintWallDressing(context, layout);
}

/* Under the floor: a chunk of rock, cables dropping from it */

function paintRockChunk(context: Context, left: Point, front: Point, right: Point, height: number, underside: number) {
  const bottomLimit = context.canvas.height - 1;
  const edgeAt = (x: number) => (x <= front.x ? left.y + ((front.y - left.y) * (x - left.x)) / (front.x - left.x) : front.y + ((right.y - front.y) * (x - front.x)) / (right.x - front.x));
  const bottoms = new Map<number, number>();
  for (let x = Math.ceil(left.x); x < right.x; x++) {
    const top = Math.round(edgeAt(x + 0.5));
    const bottom = Math.min(bottomLimit, top + height + underside + 1 + Math.round(noise('chunk', x, 0, 7) * 8));
    bottoms.set(x, bottom);
    const lit = x < front.x;
    for (let y = top; y <= bottom; y++) {
      const depth = y - top;
      const pour = depth < 3;
      const stratum = (depth + Math.round(noise('chunkstrata', x, 0, 11) * 3)) % 5 === 0;
      let colour = lit ? K.rock : K.rockDark;
      if (pour) colour = depth === 0 ? (lit ? K.slabLight : K.slab) : lit ? K.slab : K.slabDark;
      else if (y >= bottom - 1) colour = K.slabUnder;
      else if (stratum) colour = lit ? K.rockDark : K.slabUnder;
      else if (pick(`chunk${x},${y}`, 13) === 0) colour = lit ? K.rockLight : K.rock;
      dot(context, { x, y }, colour);
    }
  }
  // cables dropping out of the rock
  for (let x = Math.ceil(left.x) + 6; x < right.x - 4; x += 10 + pick(`cablegap${x}`, 16)) {
    let at = { x, y: bottoms.get(x) ?? 0 };
    const length = Math.min(bottomLimit - at.y, 6 + pick(`cablelen${x}`, 20));
    const colour = [K.cable, K.cableBlue, K.cableRed, K.cable][pick(`cablecolour${x}`, 4)];
    for (let step = 0; step < length; step++) {
      dot(context, at, colour);
      at = { x: at.x + (pick(`cablewiggle${x},${step}`, 6) === 0 ? (pick(`cableside${x},${step}`, 2) ? 1 : -1) : 0), y: at.y + 1 };
    }
  }
}

/* The door: a steel frame on the dark, a red sign over it */

function paintSteelDoor(context: Context, from: number, to: number, height: number) {
  const low = from * 8, high = to * 8;
  for (let column = Math.floor(low) - 2; column <= Math.ceil(high) + 2; column++) for (let z = 0; z <= height + 2; z++) {
    const inside = column >= low && column < high && z < height;
    const at = onWallAt('left', column / 8, z);
    if (inside) {
      // steps going up into the dark, a red light on them
      const glow = Math.max(0, 1 - z / 12);
      dot(context, at, glow > 0 && z % 3 ? css(mix(rgb(K.doorway), rgb(K.exitDark), glow)) : K.doorway);
    } else dot(context, at, column === Math.floor(low) - 2 || z === height + 2 ? tones(K.doorFrame).light : K.doorFrame);
  }
  // rivets on the frame
  for (let z = 3; z < height; z += 6) for (const column of [low - 1, high + 1]) dot(context, onWallAt('left', column / 8, z), K.steelLight);
  // the sign
  const middle = (from + to) / 2;
  onWall(context, Array.from({ length: 7 }, () => 'b'.repeat(19)), { b: K.exitDark }, 'left', middle - 9.5 / 8, height + 4);
  leftWallText(context, 'EXIT', middle + 7.5 / 8, height + 5, K.exit);
}

/* The windows: walls of old screens */

/** A wall of screens over a shelf; what they show is drawn every frame, cellar-effects.ts finds them with screensOf. */
export function paintScreenWall(context: Context, item: WallItem) {
  const { low, high, cell } = screensOf.grid;
  const across = Math.floor(item.width * 8);
  const shelfAt = (column: number, z: number) => onWallAt('back', item.fromX + column / 8, z);
  for (let column = -1; column <= across; column++) {
    dot(context, shelfAt(column, low - 1), K.windowSill);
    dot(context, shelfAt(column, low - 2), tones(K.windowSill).shade);
  }
  for (const screen of screensOf(item)) {
    const left = screen.column, bottom = screen.row;
    for (let column = left; column < left + cell; column++) for (let z = bottom; z < Math.min(high, bottom + cell); z++) {
      const edge = column === left || column === left + cell - 1 || z === bottom || z === bottom + cell - 1;
      const inner = column === left + 1 || column === left + cell - 2 || z === bottom + 1 || z === bottom + cell - 2;
      const paint = edge ? (z === bottom + cell - 1 || column === left ? K.casingLight : K.casingDark) : inner ? K.casing : screen.dead ? K.glassDead : K.glass;
      dot(context, shelfAt(column, z), paint);
    }
    dot(context, shelfAt(left + cell - 2, bottom + 1), screen.dead ? K.casingDark : K.phosphor);
  }
}

/* The clock: red LEDs */

function paintLedClock(context: Context, item: WallItem, hour: number) {
  const middle = item.fromX + item.width / 2;
  const base = 30;
  for (let dx = -11; dx <= 10; dx++) for (let z = base - 2; z <= base + 6; z++) {
    dot(context, onWallAt('back', middle + dx / 8, z), dx === -11 || dx === 10 || z === base - 2 || z === base + 6 ? K.casingDark : K.clock);
  }
  const twoDigits = (value: number) => String(value).padStart(2, '0');
  wallText(context, `${twoDigits(Math.floor(hour) % 24)}:${twoDigits(Math.floor((hour % 1) * 60))}`, 'back', middle - 9 / 8, base, K.clockHands);
}

/* The break room's TV: a big terminal */

function paintBigTerminal(context: Context, item: WallItem) {
  const { low, high } = TV_SCREEN;
  const across = Math.floor(item.width * 8);
  for (let column = -2; column <= across + 1; column++) for (let z = low - 2; z <= high + 2; z++) {
    const inside = column >= 0 && column < across && z >= low && z <= high;
    const at = onWallAt('back', item.fromX + column / 8, z);
    if (inside) dot(context, at, K.tvScreen);
    else dot(context, at, z === high + 2 || column === -2 ? tones(K.tvFrame).light : z === low - 2 ? tones(K.tvFrame).shade : K.tvFrame);
  }
  dot(context, onWallAt('back', item.fromX + (across - 2) / 8, low - 1), K.phosphor);
}

/* The light: a cellar is dim at every hour */

function cellarLighting(lighting: Lighting): Lighting {
  return { ...lighting, tint: mix(rgb(K.shade.day), rgb(K.shade.night), lighting.stars), glow: 1, beam: 0, stars: 0 };
}

export const CELLAR: ThemeKit = {
  structure: K,
  paintWalls: paintCellarWalls,
  paintFloor: paintCellarFloor,
  rugs: false,
  paintSlab: paintRockChunk,
  paintDoor: paintSteelDoor,
  paintWindow: (context, item) => paintScreenWall(context, item),
  paintClock: paintLedClock,
  paintTv: paintBigTerminal,
  paintSky: paintCaveDark,
  paintSkyMotion: paintTerminalText,
  skyFrameMs: 400,
  wallBeam: false,
  officeLamps: false,
  furniture: { ...CELLAR_FURNITURE, portal: THEME_PORTALS.cellar.design, metricsTv: modsObject('cellar') },
  portal: THEME_PORTALS.cellar.style,
  lighting: cellarLighting,
  lights: cellarLights,
  effects: cellarEffects,
  screenLight: K.light.deskScreen,
  doorLight: K.light.exit,
};
