// The automatons' droid (Preferences.droid): it rolls about the room it is in, bleeps now and then, and after a while
// goes to another room, through the door or the teleporter, like someone of the house. Where it is lives in the page
// (DroidTrip, kept by the store) since only one room is shown at a time: the room shown steps it when it is there, and
// moves it on by the clock when it is elsewhere. A click on it opens the automatons' panel. Pure logic, no clock.
import type { RoomKind } from './cast.ts';
import type { Floor } from './floor.ts';
import { ROOM, tileCenter, type Point } from './geometry.ts';
import { advanceAlong, type Mover } from './paths.ts';
import { BEAM_MS, beamProgress } from './portal.ts';

/** How it came in or goes out: the door, the teleporter, or neither (it was there when the room was opened). */
export type Passage = 'door' | 'portal';

/* From room to room */

/** Where the droid is: its room, how it came in, since when (ms since the epoch), and how long it means to stay. */
export interface DroidTrip { room: RoomKind; via: Passage | null; since: number; stay: number }

/** How long it stays in a room, in ms. */
const STAY = { least: 70_000, more: 90_000 };
const stayFor = (random: () => number) => STAY.least + random() * STAY.more;

/** It starts in the office, as if it had always been there. */
export const startTrip = (now: number, random: () => number = Math.random): DroidTrip => ({ room: 'office', via: null, since: now, stay: stayFor(random) });

/** The ways out of a room, and where each leads: the door between the office and the others, the teleporter between the office and the automatons' room. */
export function exitsOf(room: RoomKind): { via: Passage; to: RoomKind }[] {
  switch (room) {
    case 'office': return [{ via: 'door', to: 'lounge' }, { via: 'portal', to: 'automata' }];
    case 'lounge': return [{ via: 'door', to: 'office' }];
    case 'automata': return [{ via: 'door', to: 'office' }, { via: 'portal', to: 'office' }];
  }
}

/** Where it goes out by a passage: the room on the other side, entered by the same kind of passage. */
export function through(trip: DroidTrip, via: Passage, now: number, random: () => number = Math.random): DroidTrip {
  const exit = exitsOf(trip.room).find((candidate) => candidate.via === via) ?? exitsOf(trip.room)[0];
  return { room: exit.to, via: exit.via, since: now, stay: stayFor(random) };
}

/** A passage out of its room, picked at random. */
export const pickExit = (room: RoomKind, random: () => number = Math.random): Passage => {
  const exits = exitsOf(room);
  return exits[Math.min(exits.length - 1, Math.floor(random() * exits.length))].via;
};

/** The trip moved on by the clock while its room is not the one shown (the room shown steps it itself). */
export function advanceTrip(trip: DroidTrip, now: number, shown: RoomKind, random: () => number = Math.random): DroidTrip {
  if (trip.room === shown || now < trip.since + trip.stay) return trip;
  return through(trip, pickExit(trip.room, random), now, random);
}

/* In the room */

export type DroidActivity = 'arriving' | 'rolling' | 'idle' | 'exiting' | 'leaving' | 'gone';

export interface Droid extends Mover {
  activity: DroidActivity;
  /** the droid's own clock, in ms */
  time: number;
  /** when the current pause (idle) or beam (arriving, leaving) ends */
  until: number;
  /** when it heads for a way out, on its clock */
  leaveAt: number;
  /** the way it goes out by, once heading for it */
  exit: Passage | null;
  beamAt: number;
  /** while time < bleepUntil, it bleeps (`line` of its lines) */
  bleepUntil: number;
  nextBleep: number;
  line: number;
}

/** Tiles per second: it rolls a little faster than people walk. */
const SPEED = 1.8;
const BLEEP_MS = 1500;

/** A free tile somewhere in the room (not a seat), to roll to. */
function somewhereFree(floor: Floor, random: () => number): Point | null {
  const seats = new Set(floor.layout.seats.map((seat) => `${Math.floor(seat.x)},${Math.floor(seat.y)}`));
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = Math.floor(random() * ROOM.width), y = Math.floor(random() * ROOM.depth);
    if (x > 0 && floor.isFreeTile(x, y) && !seats.has(`${x},${y}`)) return tileCenter({ x, y });
  }
  return null;
}

/**
 * The droid as the room opens: coming in by `via` (through the door, or in the teleporter's beam), or already there
 * (somewhere free). `stayLeft`: how long it still means to stay, in ms.
 */
export function createDroid(floor: Floor, via: Passage | null, stayLeft: number, random: () => number = Math.random): Droid {
  const base = { heading: { x: 1, y: 1 }, time: 0, until: 0, leaveAt: Math.max(4000, stayLeft), exit: null, beamAt: 0, bleepUntil: 0, nextBleep: 6000 + random() * 9000, line: 0 };
  if (via === 'portal' && floor.portal) return { ...base, position: { ...floor.portal }, path: [], activity: 'arriving', until: BEAM_MS };
  if (via === 'door') return { ...base, position: { ...floor.door }, heading: { x: 1, y: 0 }, path: [floor.inside], activity: 'rolling' };
  const spot = somewhereFree(floor, random) ?? floor.inside;
  return { ...base, position: { ...spot }, path: [], activity: 'idle', until: 1500 + random() * 2000 };
}

/** True while it can be seen and clicked. */
export const droidHere = (droid: Droid) => droid.activity !== 'gone';

/** Bleeps (on its own now and then, or when clicked). */
export function bleep(droid: Droid, random: () => number = Math.random) {
  droid.bleepUntil = droid.time + BLEEP_MS;
  droid.line = Math.floor(random() * 1000);
}
export const isBleeping = (droid: Droid) => droid.time < droid.bleepUntil;

/**
 * Steps the droid. It rolls from one free tile to another and pauses; once its stay is over it heads for a way out of
 * the room (`exits`), and goes: by the door, it is gone once there; by the teleporter, in a beam. Returns the passage
 * it left by, once, or null.
 */
export function stepDroid(droid: Droid, ms: number, floor: Floor, exits: readonly Passage[], random: () => number = Math.random): Passage | null {
  droid.time += ms;
  if (droid.activity === 'gone') return null;
  if (droid.time >= droid.nextBleep && droid.activity !== 'leaving' && droid.activity !== 'arriving') {
    bleep(droid, random);
    droid.nextBleep = droid.time + 14_000 + random() * 20_000;
  }
  const roll = () => advanceAlong(droid, (SPEED * ms) / 1000);
  switch (droid.activity) {
    case 'arriving':
      // out of the ring, onto the floor before it
      if (droid.time >= droid.until) Object.assign(droid, { activity: 'rolling', path: floor.portalFront ? [{ ...floor.portalFront }] : [] });
      return null;
    case 'rolling':
      if (droid.path.length && !roll()) return null;
      Object.assign(droid, { activity: 'idle', until: droid.time + 2000 + random() * 5000 });
      return null;
    case 'idle': {
      if (droid.time < droid.until) return null;
      const usable = exits.filter((via) => via === 'door' || floor.portal !== null);
      if (droid.time >= droid.leaveAt && usable.length) {
        const exit = usable[Math.min(usable.length - 1, Math.floor(random() * usable.length))];
        droid.exit = exit;
        droid.activity = 'exiting';
        droid.path = exit === 'door' ? floor.pathToDoor(droid.position) : floor.pathIntoPortal(droid.position);
        return null;
      }
      const to = somewhereFree(floor, random);
      droid.path = to ? floor.route(droid.position, to) : [];
      droid.activity = 'rolling';
      return null;
    }
    case 'exiting':
      if (droid.path.length && !roll()) return null;
      if (droid.exit === 'portal') { Object.assign(droid, { activity: 'leaving', beamAt: droid.time, until: droid.time + BEAM_MS, heading: { x: 1, y: 1 } }); return null; }
      droid.activity = 'gone';
      return 'door';
    case 'leaving':
      if (droid.time < droid.until) return null;
      droid.activity = 'gone';
      return 'portal';
  }
  return null;
}

/** Where its beam is (coming in or going out through the teleporter), or null. */
export function droidBeam(droid: Droid): { kind: 'out' | 'in'; progress: number } | null {
  if (droid.activity === 'arriving') return { kind: 'in', progress: beamProgress(0, droid.time) };
  if (droid.activity === 'leaving') return { kind: 'out', progress: beamProgress(droid.beamAt, droid.time) };
  return null;
}
