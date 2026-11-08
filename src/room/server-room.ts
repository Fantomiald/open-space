// The automatons' server room, what moves in it: the orb that floats in the middle and pulses, and the cord of light
// from the orb to each automaton in its capsule, with the packets of data it pulls along it. Pure functions in room
// pixels, tested without a DOM (room.test.ts); themes/servers.ts and draw.ts paint them.
import { ORB } from '../../shared/room-layout.ts';
import { toScreen, type Point } from './geometry.ts';
import { ART_SCALE } from './pixel-art.ts';

/** The orb's centre on screen, raised by its bob (room pixels, see bobOf). */
export function orbCenter(bob = 0): Point {
  const floor = toScreen({ x: ORB.x, y: ORB.y });
  return { x: floor.x, y: floor.y - ORB.z * ART_SCALE - bob };
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
