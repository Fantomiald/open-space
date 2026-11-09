// Where the pet is, from room to room (Preferences.pet; src/room/pet.ts moves it about a room): after a while it goes to
// another room, through the door or the teleporter, like someone of the house. Where it is lives in the page (PetTrip,
// kept by the store) since only one room is shown at a time: the room shown steps it when it is there, and moves it on
// by the clock when it is elsewhere. Pure logic, no clock.
import type { RoomKind } from './cast.ts';

/** How it came in or goes out: the door, the teleporter, or neither (it was there when the room was opened). */
export type Passage = 'door' | 'portal';

/** Where the pet is: its room, how it came in, since when (ms since the epoch), and how long it means to stay. */
export interface PetTrip { room: RoomKind; via: Passage | null; since: number; stay: number }

/** How long it stays in a room, in ms. */
const STAY = { least: 70_000, more: 90_000 };
const stayFor = (random: () => number) => STAY.least + random() * STAY.more;

/** It starts in the office, as if it had always been there. */
export const startTrip = (now: number, random: () => number = Math.random): PetTrip => ({ room: 'office', via: null, since: now, stay: stayFor(random) });

/** The ways out of a room, and where each leads: the door between the office and the others, the teleporter between the office and the automatons' room. */
export function exitsOf(room: RoomKind): { via: Passage; to: RoomKind }[] {
  switch (room) {
    case 'office': return [{ via: 'door', to: 'lounge' }, { via: 'portal', to: 'automata' }];
    case 'lounge': return [{ via: 'door', to: 'office' }];
    case 'automata': return [{ via: 'portal', to: 'office' }];
  }
}

/** Where it goes out by a passage: the room on the other side, entered by the same kind of passage. */
export function through(trip: PetTrip, via: Passage, now: number, random: () => number = Math.random): PetTrip {
  const exit = exitsOf(trip.room).find((candidate) => candidate.via === via) ?? exitsOf(trip.room)[0];
  return { room: exit.to, via: exit.via, since: now, stay: stayFor(random) };
}

/** A passage out of its room, picked at random. */
export const pickExit = (room: RoomKind, random: () => number = Math.random): Passage => {
  const exits = exitsOf(room);
  return exits[Math.min(exits.length - 1, Math.floor(random() * exits.length))].via;
};

/** The trip moved on by the clock while its room is not the one shown (the room shown steps it itself). */
export function advanceTrip(trip: PetTrip, now: number, shown: RoomKind, random: () => number = Math.random): PetTrip {
  if (trip.room === shown || now < trip.since + trip.stay) return trip;
  return through(trip, pickExit(trip.room, random), now, random);
}

