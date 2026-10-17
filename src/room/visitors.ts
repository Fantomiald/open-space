// Life in the office: people of the crew without a session drop by now and then (a coffee at the counter, alone or
// with someone, a glass at the water cooler, the printer, a look out of the window, a book, a moment on the sofa, the
// festival's table) and leave. They never sit at a desk and carry no status, so the sessions stay readable; a click on
// one starts a session with them (RoomView). More come in the morning and at lunch, few in the evening, none at night.
// Pure: RoomView steps it with the free names and the hour, draw.ts paints the visitors.
import type { Activity, VisitSpot } from '../../shared/room-layout.ts';
import type { Floor } from './floor.ts';
import { distance, facingVector, toScreen, type Point } from './geometry.ts';
import { advanceAlong } from './paths.ts';
import type { Walker } from './scene.ts';
import { blinkOffsetOf } from './sprites.ts';

export type { Activity };

export interface Visitor extends Walker {
  /** the person id the room draws them under */
  id: string;
  name: string;
  spot: VisitSpot;
  phase: 'coming' | 'staying' | 'leaving';
  /** ms left to stay once there */
  left: number;
  /** ms before they come in through the door: the second of two follows the first, instead of walking on them */
  outside: number;
  /** ms since they got there */
  stayed: number;
  /** 1 for the second of two, who speaks after the first (see draw.ts) */
  order: 0 | 1;
  /** came with someone: faces them (the spot's `together`) */
  together: boolean;
}

/** What the office is like at an hour: minutes between two visits (null: nobody comes), and what people come for. */
export interface Rhythm { every: readonly [number, number] | null; weights: Partial<Record<Activity, number>> }

/** Tiles per second: slower than the sessions going to work. */
const STROLL_SPEED = 2.6;
const MAX_VISITORS = 2;
/** How often two come together for a coffee (or the festival), when two are free. */
const TOGETHER_CHANCE = 0.4;
/** How far behind the first of two the second comes in, and how much longer the first stays (so the second, nearer
 * the door, leaves first and nobody walks through the other). */
const FOLLOW_MS = 1400;
const STAYS_LONGER_MS = 2500;
const STAY_MS: Readonly<Record<Activity, readonly [number, number]>> = {
  coffee: [12_000, 25_000], water: [6_000, 12_000], printer: [8_000, 15_000], window: [10_000, 20_000],
  books: [10_000, 20_000], sofa: [20_000, 40_000], party: [15_000, 30_000],
};

export const visitorId = (name: string) => `visitor:${name}`;

export function rhythmAt(hour: number): Rhythm {
  if (hour >= 7 && hour < 10) return { every: [2, 4], weights: { coffee: 4, water: 1, window: 1, party: 2 } };
  if (hour >= 10 && hour < 12) return { every: [4, 7], weights: { coffee: 1, water: 1, printer: 2, window: 1, books: 1, party: 2 } };
  if (hour >= 12 && hour < 14) return { every: [3, 5], weights: { coffee: 3, sofa: 2, window: 1, party: 3 } };
  if (hour >= 14 && hour < 19) return { every: [4, 7], weights: { coffee: 1, water: 2, printer: 2, window: 1, books: 1, sofa: 1, party: 2 } };
  if (hour >= 19 && hour < 23) return { every: [10, 20], weights: { coffee: 1, window: 1, sofa: 1, party: 2 } };
  return { every: null, weights: {} };
}

const between = ([low, high]: readonly [number, number], random: () => number) => low + random() * (high - low);

/** One of the activities, by weight, among those with a spot in the room. */
function pickActivity(weights: Rhythm['weights'], available: ReadonlySet<Activity>, random: () => number): Activity | null {
  const choices = Object.entries(weights).filter(([activity]) => available.has(activity as Activity)) as [Activity, number][];
  let roll = random() * choices.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [activity, weight] of choices) {
    roll -= weight;
    if (roll < 0) return activity;
  }
  return null;
}

export class Visits {
  readonly visitors = new Map<string, Visitor>();
  private readonly floor: Floor;
  private readonly random: () => number;
  /** ms until the next visit; the first one comes soon after the room opens */
  private wait: number;

  constructor(floor: Floor, random: () => number = Math.random) {
    this.floor = floor;
    this.random = random;
    this.wait = 8_000 + random() * 12_000;
  }

  private get spots(): readonly VisitSpot[] { return this.floor.layout.visitSpots ?? []; }

  /**
   * Moves the visitors, and sends someone in when it is time. `free`: the crew members without a session (a visitor
   * who gets one leaves); `hour`: the hour shown; `blocked`: a floor point taken by the user (a sofa they sit on).
   */
  step(ms: number, { free, hour, enabled, blocked }: { free: readonly string[]; hour: number; enabled: boolean; blocked: Point | null }) {
    const stillFree = new Set(enabled ? free : []);
    for (const [id, visitor] of this.visitors) {
      if (visitor.outside > 0) {
        if (stillFree.has(visitor.name)) visitor.outside -= ms;
        else this.visitors.delete(id);
        continue;
      }
      if (visitor.phase !== 'leaving' && !stillFree.has(visitor.name)) this.leave(visitor);
      const arrived = advanceAlong(visitor, STROLL_SPEED * ms / 1000);
      if (visitor.phase === 'leaving') { if (arrived) this.visitors.delete(id); continue; }
      if (visitor.phase === 'coming' && arrived) this.settle(visitor);
      else if (visitor.phase === 'staying') {
        visitor.left -= ms;
        visitor.stayed += ms;
        if (visitor.left <= 0) this.leave(visitor);
      }
    }
    if (!enabled) return;
    const { every, weights } = rhythmAt(hour);
    if (!every) return;
    this.wait -= ms;
    if (this.wait > 0) return;
    this.wait = between(every, this.random) * 60_000;
    const activity = pickActivity(weights, new Set(this.freeSpots(blocked).map((spot) => spot.activity)), this.random);
    if (activity) this.start(activity, free, { together: this.random() < TOGETHER_CHANCE, blocked });
  }

  /** The spots nobody stands on (nor walks to), away from the user. */
  private freeSpots(blocked: Point | null): VisitSpot[] {
    const taken = [...this.visitors.values()].filter((visitor) => visitor.phase !== 'leaving').map((visitor) => visitor.spot);
    return this.spots.filter((spot) => !taken.includes(spot) && !(blocked && distance(blocked, spot.at) < 0.6));
  }

  /**
   * Sends one or two people (`together`, when the activity has room for two) from `free` for an activity, if there is
   * room. Returns their names.
   */
  start(activity: Activity, free: readonly string[], { together = false, blocked = null }: { together?: boolean; blocked?: Point | null } = {}): string[] {
    const present = [...this.visitors.values()].filter((visitor) => visitor.phase !== 'leaving');
    const candidates = free.filter((name) => !this.visitors.has(visitorId(name)));
    const spots = this.freeSpots(blocked).filter((spot) => spot.activity === activity);
    const pair = spots.filter((spot) => spot.together !== undefined);
    const room = MAX_VISITORS - present.length;
    // two: the first goes to the spot further from the door, so the second does not walk through them
    const fromDoor = (spot: VisitSpot) => distance(spot.at, this.floor.door);
    const going = together && pair.length >= 2 && candidates.length >= 2 && room >= 2
      ? pair.slice(0, 2).sort((a, b) => fromDoor(b) - fromDoor(a)) : spots.slice(0, Math.min(1, room));
    const names = [...candidates].sort(() => this.random() - 0.5).slice(0, going.length);
    const stay = between(STAY_MS[activity], this.random);
    names.forEach((name, index) => {
      const spot = going[index];
      const id = visitorId(name);
      const second = index === 1;
      this.visitors.set(id, {
        id, name, spot, phase: 'coming', left: names.length === 2 && !second ? stay + STAYS_LONGER_MS : stay, outside: second ? FOLLOW_MS : 0, stayed: 0, order: second ? 1 : 0, together: names.length === 2,
        position: { ...this.floor.door }, heading: { x: 1, y: 0 }, path: [...this.floor.route(this.floor.door, spot.at), { ...spot.at }], blinkOffset: blinkOffsetOf(id),
      });
    });
    return names;
  }

  /** Seated on a sofa, rather than standing. */
  static sitting(visitor: Visitor) { return visitor.phase === 'staying' && visitor.spot.lift !== undefined; }

  /** The visitor under a canvas point (the one in front when two overlap), not those leaving. */
  at(point: Point): Visitor | null {
    const hits = [...this.visitors.values()].filter((visitor) => {
      if (visitor.phase === 'leaving' || visitor.outside > 0) return false;
      const feet = toScreen(visitor.position);
      const top = feet.y - (Visits.sitting(visitor) ? visitor.spot.lift ?? 0 : 0) - 50;
      return Math.abs(point.x - feet.x) <= 14 && point.y >= top && point.y <= feet.y + 4;
    });
    return hits.sort((a, b) => b.position.x + b.position.y - (a.position.x + a.position.y))[0] ?? null;
  }

  private settle(visitor: Visitor) {
    visitor.phase = 'staying';
    visitor.heading = facingVector(visitor.together && visitor.spot.together !== undefined ? visitor.spot.together : visitor.spot.facing);
  }

  private leave(visitor: Visitor) {
    visitor.phase = 'leaving';
    visitor.path = this.floor.pathToDoor(visitor.position);
  }
}
