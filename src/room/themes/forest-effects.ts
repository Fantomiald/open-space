// What moves and glows in the treehouse every frame, in room pixels (forest.ts): the strings of fireflies breathing,
// the lanterns flickering, the mushrooms and flowers pulsing in the dark, fireflies drifting high along the walls and
// around the floating earth, its waterfalls running, leaves falling past it; and the lights all these give at night.
import { FOREST_PALETTE as P, FOREST_FURNITURE as F } from '../../design/theme-forest.ts';
import { ROOM, type FurniturePiece, type Layout } from '../../../shared/room-layout.ts';
import { toScreen, type Point } from '../geometry.ts';
import type { Lighting } from '../lighting.ts';
import { ART_SCALE } from '../pixel-art.ts';
import { furnitureDepth } from '../pixel-furniture.ts';
import { pick } from '../sky.ts';
import { roomPointOnWall } from '../wall-art.ts';
import { WALL_EFFECT, type ThemeEffect, type ThemeLight } from './kit.ts';
import { roomDot, underLight } from './forest-art.ts';
import { WATERFALLS } from './forest-floor.ts';
import { FLOWERS, JARS, LANTERN, SHELF, isFlowerPot } from './forest-furniture.ts';
import { FIREFLY_BULBS, GLOWING_MUSHROOMS, LANTERNS, type WallSpot } from './forest-walls.ts';

type Context = CanvasRenderingContext2D;

const wallPoint = (spot: WallSpot, up = 0) => roomPointOnWall(spot.wall, spot.along, spot.z + up);

/** A point of a piece in room pixels: (x, y) in tiles from its corner, `z` art pixels up, `across` art pixels sideways. */
function pointOf(piece: FurniturePiece, x: number, y: number, z: number, across = 0): Point {
  const point = toScreen({ x: piece.x + x, y: piece.y + y });
  return { x: point.x + across * ART_SCALE, y: point.y - z * ART_SCALE };
}

/** A glowing pixel and a faint cross of light around it. */
function glowDot(context: Context, point: Point, core: string, halo: string, alpha: number) {
  roomDot(context, point, core, alpha);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) roomDot(context, { x: point.x + dx * ART_SCALE, y: point.y + dy * ART_SCALE }, halo, alpha * 0.3);
}

/** The fireflies of the strings, each breathing on its own beat: a soft green by day, bright at night. */
function breatheStrings(context: Context, time: number, glow: number) {
  FIREFLY_BULBS.forEach((bulb, index) => {
    const breath = 0.5 + 0.5 * Math.sin(time / 700 + index * 1.7);
    glowDot(context, wallPoint(bulb), P.firefly, P.fireflyGlow, (0.15 + glow * 0.8) * (0.35 + breath * 0.65));
  });
}

/** The lanterns' glass flickering, warm, with a halo at night. */
function flickerLanterns(context: Context, time: number, glow: number) {
  LANTERNS.forEach((lantern, index) => {
    const flicker = 0.75 + pick(`lantern${index},${Math.floor(time / 130)}`, 25) / 100;
    if (glow < 0.05) return;
    for (let up = 0; up < 4; up++) for (let across = -1; across <= 2; across++) {
      roomDot(context, roomPointOnWall(lantern.wall, lantern.along + across / 8 - 1 / 8, lantern.z + up), up === 2 && across === 0 ? P.lanternCore : P.lanternGlass, glow * 0.85 * flicker);
    }
    if (glow < 0.1) return;
    const centre = wallPoint(lantern, 2);
    for (let up = -4; up <= 4; up++) for (let across = -4; across <= 4; across++) {
      const distance = Math.hypot(across, up);
      if (distance < 3 || distance > 4.5) continue;
      roomDot(context, { x: centre.x + across * ART_SCALE, y: centre.y + up * ART_SCALE }, P.lanternGlass, 0.12 * glow * flicker);
    }
  });
}

/** The glowing mushrooms of the walls, pulsing slowly in the dark. */
function pulseMushrooms(context: Context, time: number, glow: number) {
  if (glow < 0.05) return;
  GLOWING_MUSHROOMS.forEach((mushroom, index) => {
    const pulse = 0.55 + 0.45 * Math.sin(time / 1100 + index * 2);
    for (const [along, z, width] of [[-0.4, 1, 4], [-0.1, 5, 2], [0.15, -2, 2]] as const) {
      for (let column = 1; column <= width; column++) roomDot(context, roomPointOnWall(mushroom.wall, mushroom.along + along + column / 8, mushroom.z + z), P.glowCap, glow * pulse * 0.75);
    }
  });
}

const FIREFLIES = 18;
/** Whether a firefly drifts around the earth (under the floor's edges) rather than along the walls. */
const aroundEarth = (index: number) => index % 3 === 2;

/** Where the fireflies drift: high along the two walls, and in the air around the floating earth. */
function fireflyAt(index: number, time: number): Point {
  const seed = pick(`firefly${index}`, 1000) / 1000;
  const drift = time / 9000 + seed * 10;
  if (aroundEarth(index)) {
    // around the earth, under the floor's front edges
    const share = (seed + Math.sin(drift) * 0.08 + 1) % 1;
    const edge = share < 0.55 ? toScreen({ x: share / 0.55 * ROOM.width, y: ROOM.depth }) : toScreen({ x: ROOM.width, y: (1 - (share - 0.55) / 0.45) * ROOM.depth });
    return { x: edge.x + Math.sin(drift * 3.1) * 14, y: edge.y + 26 + Math.cos(drift * 2.3) * 14 + seed * 30 };
  }
  const wall = index % 3 ? 'back' : 'left';
  const length = wall === 'back' ? ROOM.width : ROOM.depth;
  const along = ((seed * length + Math.sin(drift) * 1.5) % length + length) % length;
  return roomPointOnWall(wall, along, 47 + Math.sin(drift * 2.7 + seed * 6) * 4 + seed * 10);
}

/** The waterfalls running off the earth: water streaming down, bright streaks going with it, mist where it thins out. */
function runWaterfalls(context: Context, time: number, lighting: Lighting) {
  const water = underLight(P.water, lighting), light = underLight(P.waterLight, lighting), deep = underLight(P.waterDeep, lighting), mist = underLight(P.mist, lighting);
  WATERFALLS.forEach((fall, index) => {
    for (let down = 1; down < fall.fall; down++) {
      // thinning as it goes: whole at the lip, then strands that break up, until it is only mist
      const fade = 1 - (down / fall.fall) ** 1.2;
      const spread = down > fall.fall * 0.6 ? 1 : 0;
      for (let across = -spread; across <= 2 + spread; across++) {
        const streak = (down - Math.floor(time / 70) + across * 3 + index * 5) % 7;
        const outside = across < 0 || across > 2;
        if (down > 3 && (outside || (across !== 1 && streak === 3) || pick(`gap${index},${down},${across}`, 10) < down / 7)) continue;
        const colour = down < 3 ? light : streak === 0 ? light : across === 2 + spread ? deep : water;
        roomDot(context, { x: (fall.x + across) * ART_SCALE, y: (fall.y + down) * ART_SCALE }, colour, fade * 0.9);
      }
    }
    for (let drop = 0; drop < 5; drop++) {
      const age = (time / 1400 + drop / 5 + index * 0.3) % 1;
      const x = fall.x + 1 + (pick(`mist${index},${drop}`, 7) - 3) * age;
      roomDot(context, { x: x * ART_SCALE, y: (fall.y + fall.fall * (0.7 + age * 0.35)) * ART_SCALE }, mist, 0.5 * (1 - age));
    }
  });
}

/** Leaves falling past the floating earth, swaying as they go. */
function fallingLeaves(context: Context, time: number, lighting: Lighting) {
  const left = toScreen({ x: 0, y: ROOM.depth }), right = toScreen({ x: ROOM.width, y: 0 });
  for (let index = 0; index < 7; index++) {
    const span = 120;
    const age = ((time / 260 + pick(`fall${index}`, span)) % span) / span;
    const startX = left.x + pick(`fallx${index}`, Math.round(right.x - left.x));
    const x = startX + Math.sin(age * 9 + index) * 10 + age * 20;
    const top = Math.max(left.y, Math.min(right.y, left.y + (startX - left.x) * 0.5)) + 10;
    const y = top + age * 110;
    const colour = underLight(P.autumn[index % P.autumn.length], lighting);
    const alpha = Math.min(1, (1 - age) * 3);
    roomDot(context, { x, y }, colour, alpha);
    if (Math.sin(age * 18 + index) > 0) roomDot(context, { x: x + ART_SCALE, y }, colour, alpha);
  }
}

/* The furniture */

function pulseFlowers(context: Context, piece: FurniturePiece, time: number, glow: number) {
  FLOWERS.forEach(([across, up, colour], index) => {
    const pulse = 0.5 + 0.5 * Math.sin(time / 900 + index * 1.3 + piece.x);
    const point = pointOf(piece, 0.5, 0.5, up, across);
    glowDot(context, point, F.bloomCore, F.bloom[colour], (0.1 + glow * 0.9) * pulse);
  });
}

/** Golden leaves drifting down from the little tree's crown, and a glint on its crystal leaves. */
function goldenTree(context: Context, piece: FurniturePiece, time: number, lighting: Lighting) {
  for (let leaf = 0; leaf < 3; leaf++) {
    const age = (time / 5200 + leaf / 3 + piece.x / 7) % 1;
    const across = Math.round(((pick(`gold${piece.x},${leaf}`, 7) - 3) + Math.sin(age * 8 + leaf) * 2));
    roomDot(context, pointOf(piece, 0.5, 0.5, 26 - age * 24, across), underLight(F.goldLeaves, lighting), Math.min(1, (1 - age) * 4));
  }
  const glint = pick(`glint${piece.x},${Math.floor(time / 400)}`, 6);
  const spots = [[-3, 27], [3, 30], [-1, 35], [4, 27], [1, 37], [-4, 31]] as const;
  if (glint < spots.length) roomDot(context, pointOf(piece, 0.5, 0.5, spots[glint][1], spots[glint][0]), F.waterTop, 0.9);
}

/** The fireflies in the lamp's lantern, going round in their glass. */
function lanternFlies(context: Context, piece: FurniturePiece, time: number, glow: number) {
  for (let fly = 0; fly < 4; fly++) {
    const angle = time / (700 + fly * 130) + fly * 1.6;
    const across = Math.round(Math.cos(angle) * 2);
    const up = LANTERN.low + 1 + Math.round((Math.sin(angle * 1.3) + 1) * 3);
    const point = toScreen({ x: piece.x + LANTERN.x, y: piece.y + LANTERN.y });
    roomDot(context, { x: point.x + across * ART_SCALE, y: point.y - up * ART_SCALE }, F.glow, 0.5 + glow * 0.5);
  }
}

/** The jars of fireflies in the hollow trunk, blinking. */
function blinkJars(context: Context, piece: FurniturePiece, time: number, glow: number) {
  JARS.forEach((jar, index) => {
    for (let fly = 0; fly < 3; fly++) {
      const blink = Math.max(0, Math.sin(time / 500 + fly * 2 + index));
      const x = jar.x + 0.05 + ((fly * 7 + Math.floor(time / 900)) % 4) * 0.045;
      const z = jar.low + 1.5 + ((fly * 5 + Math.floor(time / 1100)) % 3);
      roomDot(context, pointOf(piece, x, SHELF.y, z), F.firefly, blink * (0.3 + glow * 0.7));
    }
  });
}

/** A glint going up through the spring water now and then. */
function springBubbles(context: Context, piece: FurniturePiece, time: number) {
  for (let bubble = 0; bubble < 3; bubble++) {
    const age = (time / 2600 + bubble / 3) % 1;
    roomDot(context, pointOf(piece, 0.5, 0.5, 14 + age * 6, (bubble * 3) % 5 - 2), F.waterTop, 0.8 * (1 - age));
  }
}

/**
 * What moves and glows, each effect at the depth of what it sits on: the walls' lights behind everything, the furniture's
 * with their piece, and what is under or around the earth in front of nothing but the sky.
 */
export function forestEffects(layout: Layout, time: number, lighting: Lighting): ThemeEffect[] {
  const glow = lighting.glow;
  const effects: ThemeEffect[] = [];
  // roomDot leaves its alpha set, and every effect shares one canvas
  const add = (depth: number, paint: (context: Context) => void) => effects.push({ depth, paint: (context) => { context.globalAlpha = 1; paint(context); context.globalAlpha = 1; } });
  add(WALL_EFFECT, (context) => { breatheStrings(context, time, glow); flickerLanterns(context, time, glow); pulseMushrooms(context, time, glow); });
  add(Infinity, (context) => { runWaterfalls(context, time, lighting); fallingLeaves(context, time, lighting); });
  for (let index = 0; index < FIREFLIES; index++) {
    const blink = Math.max(0, Math.sin(time / 600 + index * 2.3));
    add(aroundEarth(index) ? Infinity : WALL_EFFECT, (context) => glowDot(context, fireflyAt(index, time), P.firefly, P.fireflyGlow, blink * (0.12 + glow * 0.88)));
  }
  for (const piece of layout.furniture) {
    const onThis = (paint: (context: Context) => void) => add(furnitureDepth(piece), paint);
    if (piece.kind === 'plant' && isFlowerPot(piece)) onThis((context) => pulseFlowers(context, piece, time, glow));
    if (piece.kind === 'bigPlant') onThis((context) => goldenTree(context, piece, time, lighting));
    if (piece.kind === 'floorLamp') onThis((context) => lanternFlies(context, piece, time, glow));
    if (piece.kind === 'bookshelf') onThis((context) => blinkJars(context, piece, time, glow));
    if (piece.kind === 'cooler') onThis((context) => springBubbles(context, piece, time));
  }
  return effects;
}

/** The lights of the treehouse at night: lanterns, the strings of fireflies, glowing mushrooms and flowers, the golden tree. */
export function forestLights(layout: Layout): ThemeLight[] {
  const lights: ThemeLight[] = [];
  const onFloor = (spot: WallSpot) => (spot.wall === 'back' ? { x: spot.along, y: 0.3 } : { x: 0.3, y: spot.along });
  for (const lantern of LANTERNS) lights.push({ ...onFloor(lantern), height: lantern.z * ART_SCALE, radius: 80, colour: P.lightLantern, strength: 0.75 });
  for (const mushroom of GLOWING_MUSHROOMS) lights.push({ ...onFloor(mushroom), height: mushroom.z * ART_SCALE, radius: 45, colour: P.lightMagic, strength: 0.5 });
  // close enough that their pools join: apart, they left dark bands across the floor between them
  for (let along = 2; along < ROOM.width; along += 3) lights.push({ x: along, y: 0.3, height: 88, radius: 80, colour: P.lightFirefly, strength: 0.22 });
  for (let along = 1.5; along < ROOM.depth; along += 3) lights.push({ x: 0.3, y: along, height: 88, radius: 80, colour: P.lightFirefly, strength: 0.22 });
  // a drift of fireflies over the open floor, so it does not stay dark between the lamp and the screens
  for (const [x, y] of [[4, 7], [8, 10]]) lights.push({ x, y, height: 60, radius: 140, colour: P.lightFirefly, strength: 0.4 });
  for (const piece of layout.furniture) {
    const add = (x: number, y: number, height: number, radius: number, colour: string, strength: number) => lights.push({ x: piece.x + x, y: piece.y + y, height, radius, colour, strength });
    if (piece.kind === 'plant' && isFlowerPot(piece)) add(0.5, 0.5, 28, 55, F.lightBloom, 0.55);
    if (piece.kind === 'bigPlant') add(0.5, 0.5, 64, 90, F.lightGold, 0.55);
    if (piece.kind === 'bookshelf') add(1, 0.8, 26, 60, F.lightFirefly, 0.45);
    if (piece.kind === 'cooler') add(0.5, 0.6, 36, 40, F.lightWater, 0.35);
  }
  return lights;
}
