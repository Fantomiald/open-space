// The automatons' server room, what moves in it: the orb that floats in the middle and pulses, and the cord of light
// from the orb to each automaton in its capsule, with the packets of data it pulls along it. Pure functions in room
// pixels, tested without a DOM (room.test.ts); themes/servers.ts and draw.ts paint them.
import { ORB } from '../../shared/room-layout.ts';
import { depthOf, toScreen, type Point } from './geometry.ts';
import { glyphRows } from './wall-art.ts';
import { BOT_GLYPH, BOT_GLYPH_SIZE } from './status-glyphs.ts';
import { ART_SCALE } from './pixel-art.ts';
import { ORB_SHAPE } from './server-furniture.ts';

/** The orb's centre on screen, raised by its bob (room pixels, see bobOf). */
export function orbCenter(bob = 0): Point {
  const floor = toScreen({ x: ORB.x, y: ORB.y });
  return { x: floor.x, y: floor.y - ORB.z * ART_SCALE - bob };
}

/**
 * True for a canvas point on the orb, or close enough to it (the bob left out: it moves by a few pixels only), unless
 * the automaton under that point (`covering`: the tile it stands on) is in front of the orb.
 */
export function isOrbAt(point: Point, covering?: Point): boolean {
  if (covering && depthOf(covering) > depthOf(ORB)) return false;
  const center = orbCenter();
  return Math.hypot(point.x - center.x, point.y - center.y) <= (ORB_SHAPE.radius + 4) * ART_SCALE;
}

/** How long a pulse takes to spread and fade, in ms, and how many are out at once. */
const PULSE_MS = 2400;
const PULSES = 2;
/** The rings the orb sends out at `time`: their radius (art pixels across) and how strong they still are. */
export function pulseRings(time: number): { radius: number; alpha: number }[] {
  return Array.from({ length: PULSES }, (_, index) => {
    const share = ((time / PULSE_MS + index / PULSES) % 1 + 1) % 1;
    return { radius: Math.round(7 + share * 9), alpha: Math.round((1 - share) * 0.6 * 100) / 100 };
  });
}

/** Where a cord reaches an automaton: its chest, a little more than half its height above its feet. */
export const chestOf = (feet: Point, height: number): Point => ({ x: feet.x, y: Math.round(feet.y - height * 0.55) });

/**
 * Where a cord plugs into an automaton, who always faces the viewer: one that stands between the orb and the viewer
 * (its feet lower on screen than the orb's foot) takes it in the nape, from behind, the cord drawn under it; the
 * others take it in the chest, the cord drawn over them. `orbFloorY`: the screen y of the floor under the orb.
 */
export function cordEnd(feet: Point, height: number, orbFloorY: number): { at: Point; fromBehind: boolean } {
  const fromBehind = feet.y > orbFloorY;
  return { at: fromBehind ? { x: feet.x, y: Math.round(feet.y - height * 0.78) } : chestOf(feet, height), fromBehind };
}

/** The screen y of the floor under the orb. */
export const orbFloorY = () => toScreen({ x: ORB.x, y: ORB.y }).y;

/**
 * A cord of light from the orb to an automaton: the art pixels it lights, in room pixels, from the orb's edge to the
 * chest, sagging a little in the middle (a quadratic curve), each pixel once. `radius`: the orb's, in room pixels.
 */
export function cordPath(orb: Point, chest: Point, radius: number): Point[] {
  const length = Math.hypot(chest.x - orb.x, chest.y - orb.y);
  if (length <= radius) return [];
  const start = { x: orb.x + (chest.x - orb.x) * radius / length, y: orb.y + (chest.y - orb.y) * radius / length };
  const sag = Math.min(24, length * 0.12);
  const control = { x: (start.x + chest.x) / 2, y: (start.y + chest.y) / 2 + sag };
  const steps = Math.ceil(length / ART_SCALE) * 2;
  const points: Point[] = [];
  const seen = new Set<string>();
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * chest.x;
    const y = (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * chest.y;
    const snapped = { x: Math.round(x / ART_SCALE) * ART_SCALE, y: Math.round(y / ART_SCALE) * ART_SCALE };
    const key = `${snapped.x},${snapped.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(snapped);
  }
  return points;
}

/** How long a packet takes from the orb to the automaton, in ms, and how many run along a cord at once. */
const PACKET_MS = 1600;
const PACKETS = 3;
/**
 * Where the packets of data are along a cord at `time`: indices into its path, from the orb (0) towards the automaton
 * (the end). `seed` puts each cord on its own beat.
 */
export function packetsOn(pathLength: number, time: number, seed = 0): number[] {
  if (pathLength < 2) return [];
  return Array.from({ length: PACKETS }, (_, index) => {
    const share = (((time + seed) / PACKET_MS + index / PACKETS) % 1 + 1) % 1;
    return Math.min(pathLength - 1, Math.floor(share * pathLength));
  });
}

/**
 * The display over the door that says how many automatons wait without a capsule: a little robot's head, then "+N",
 * in a frame. One letter an art pixel: "f" frame, "b" its screen, "g" the robot, "#" the digits. None while none waits.
 */
export function waitingSign(count: number): string[] {
  if (count <= 0) return [];
  const digits = glyphRows(`+${count}`);
  const glyph = Array.from({ length: BOT_GLYPH_SIZE }, () => Array<string>(BOT_GLYPH_SIZE).fill('b'));
  for (const [x, y] of BOT_GLYPH) glyph[y][x] = 'g';
  // the digits sit on the robot's middle rows
  const top = Math.floor((BOT_GLYPH_SIZE - digits.length) / 2);
  const inner = glyph.map((row, y) => {
    const text = y >= top && y < top + digits.length ? digits[y - top].replaceAll('.', 'b') : 'b'.repeat(digits[0].length);
    return `b${row.join('')}bb${text}b`;
  });
  const width = inner[0].length;
  const blank = 'b'.repeat(width);
  return ['f'.repeat(width + 2), ...[blank, ...inner, blank].map((row) => `f${row}f`), 'f'.repeat(width + 2)];
}
