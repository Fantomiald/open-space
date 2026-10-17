// A room as it moves: people walking in through the door to their seat, sitting, walking out, the player's avatar
// going where it is sent (or back to a seat of theirs), and, in the office, the pet. No drawing and no DOM here;
// RoomView steps it and draw.ts paints it.
import type { PlayerSpot } from '../../shared/room-layout.ts';
import type { Person, RoomPlan } from './cast.ts';
import { createPet, cuddle, stepPet, type Pet } from './pet.ts';
import type { Floor } from './floor.ts';
import { depthOf, facingVector, tileCenter, toScreen, type Point } from './geometry.ts';
import { advanceAlong } from './paths.ts';
import { blinkOffsetOf, type Direction } from './sprites.ts';

export const PLAYER_ID = 'player';
/** The user's first name, on their tag: the one of their own avatar in the crew. */
export const selfName = (crew: readonly { name: string; self?: boolean }[]) => crew.find((member) => member.self)?.name ?? 'Toi';

/** Tiles per second. */
const WALK_SPEED = 4.2;

export interface Walker { position: Point; heading: Point; path: Point[]; blinkOffset: number }

export type Phase = 'entering' | 'seated' | 'leaving';

export interface Character extends Walker { person: Person; seat: number; phase: Phase }

/** Screen direction of a floor heading (the grid is drawn rotated by 45 degrees). */
export function directionOf(heading: Point): Direction {
  const across = heading.x - heading.y;
  const down = heading.x + heading.y;
  const up = down < -0.15;
  if (up) return across < 0 ? 'up-left' : 'up-right';
  return across < 0 ? 'down-left' : 'down-right';
}

/** Moves a walker along its path at walking speed. Returns true when it reached the end of its path. */
const advance = (walker: Walker, ms: number) => advanceAlong(walker, WALK_SPEED * ms / 1000);

/** A canvas point on someone, roughly their sprite's box above their feet. */
function covers(walker: Walker, point: Point): boolean {
  const feet = toScreen(walker.position);
  return Math.abs(point.x - feet.x) <= 14 && point.y >= feet.y - 50 && point.y <= feet.y + 4;
}

export class Scene {
  readonly floor: Floor;
  readonly characters = new Map<string, Character>();
  /** the user starts seated at the room's first spot (in the office, behind the boss's desk), facing the room */
  readonly player: Walker;
  /** where the user sits, or null while they stand or walk */
  playerSpot: PlayerSpot | null;
  private headingFor: PlayerSpot | null = null;
  /** walking to the door, to go to the other room */
  private goingOut = false;
  /** set once the user reached the door: the view moves to the other room */
  playerWentOut = false;
  readonly pet: Pet | null;

  /** `atDoor`: the user comes in through the door (from the other room) instead of sitting at the room's first spot. */
  constructor(floor: Floor, { withPet, atDoor = false }: { withPet: boolean; atDoor?: boolean }) {
    this.floor = floor;
    const start = floor.layout.playerSpots[0];
    this.player = atDoor
      ? { position: { ...floor.door }, heading: { x: 1, y: 0 }, path: [floor.inside], blinkOffset: blinkOffsetOf(PLAYER_ID) }
      : { position: { ...start.at }, heading: facingVector(start.seat.facing), path: [], blinkOffset: blinkOffsetOf(PLAYER_ID) };
    this.playerSpot = atDoor ? null : start;
    this.pet = withPet ? createPet() : null;
  }

  /** The room seat the user sits on or walks to (a sofa of the break room), kept free of sessions. */
  playerSeats(): Set<number> {
    const seat = (this.playerSpot ?? this.headingFor)?.seat;
    const index = seat ? this.floor.layout.seats.indexOf(seat) : -1;
    return new Set(index >= 0 ? [index] : []);
  }

  /** Who sits (or is walking to sit) where; people walking out have given their chair back. */
  seats(): Map<string, number> {
    const seats = new Map<string, number>();
    for (const character of this.characters.values()) if (character.phase !== 'leaving') seats.set(character.person.id, character.seat);
    return seats;
  }

  /** Brings the room in line with the plan. `instant`: newcomers are already seated (first view of the room). */
  sync(plan: RoomPlan, instant: boolean) {
    for (const person of plan.people) {
      const seat = plan.seats.get(person.id)!;
      const character = this.characters.get(person.id);
      if (!character) {
        const position = instant ? this.floor.seatPosition(seat) : { ...this.floor.door };
        this.characters.set(person.id, {
          person, seat, blinkOffset: blinkOffsetOf(person.id), position, heading: instant ? this.floor.seatFacing(seat) : { x: 1, y: 0 },
          path: instant ? [] : this.floor.pathToSeat(this.floor.door, seat), phase: instant ? 'seated' : 'entering',
        });
        continue;
      }
      character.person = person;
      if (character.phase === 'leaving' || character.seat !== seat) {
        character.seat = seat;
        character.path = this.floor.pathToSeat(character.position, seat);
        character.phase = 'entering';
      }
    }
    const planned = new Set(plan.people.map((person) => person.id));
    for (const character of this.characters.values()) {
      if (planned.has(character.person.id) || character.phase === 'leaving') continue;
      character.phase = 'leaving';
      character.path = this.floor.pathToDoor(character.position);
    }
  }

  step(ms: number) {
    for (const [id, character] of this.characters) {
      if (!advance(character, ms)) continue;
      if (character.phase === 'leaving') this.characters.delete(id);
      else if (character.phase === 'entering') {
        character.phase = 'seated';
        character.heading = this.floor.seatFacing(character.seat);
      }
    }
    if (advance(this.player, ms)) {
      if (this.headingFor) this.sit(this.headingFor);
      else if (this.goingOut) { this.goingOut = false; this.playerWentOut = true; }
    }
    if (this.pet) stepPet(this.pet, ms, this.floor);
  }

  /** The person under a canvas point (the one in front when several overlap); people walking out cannot be picked. */
  characterAt(point: Point): Character | null {
    const hits = [...this.characters.values()].filter((character) => character.phase !== 'leaving' && covers(character, point));
    hits.sort((a, b) => depthOf(b.position) - depthOf(a.position));
    return hits[0] ?? null;
  }

  /** Who is under a canvas point, the user included (PLAYER_ID): their name tag shows in full. */
  personAt(point: Point): string | null {
    const character = this.characterAt(point);
    if (character && !(covers(this.player, point) && depthOf(this.player.position) > depthOf(character.position))) return character.person.id;
    return covers(this.player, point) ? PLAYER_ID : null;
  }

  walkPlayerTo(tile: Point) {
    this.playerSpot = null;
    this.headingFor = null;
    this.goingOut = false;
    this.player.path = this.floor.route(this.player.position, tile);
  }

  /** Sends the player to sit at a spot (the boss's chair, the sofa). */
  sitPlayerAt(spot: PlayerSpot) {
    this.playerSpot = null;
    this.headingFor = spot;
    this.goingOut = false;
    this.player.path = [...this.floor.route(this.player.position, tileCenter(spot.seat)), { ...spot.at }];
    if (Math.hypot(this.player.position.x - spot.at.x, this.player.position.y - spot.at.y) < 0.01) this.sit(spot);
  }

  private sit(spot: PlayerSpot) {
    this.player.path = [];
    this.player.position = { ...spot.at };
    this.player.heading = facingVector(spot.seat.facing);
    this.playerSpot = spot;
    this.headingFor = null;
  }

  /** Sends the user out through the door; `playerWentOut` tells when they reached it. */
  walkPlayerOut() {
    this.playerSpot = null;
    this.headingFor = null;
    this.goingOut = true;
    this.player.path = this.floor.pathToDoor(this.player.position);
  }

  /** True when a canvas point falls on the pet; it gets a cuddle (it speaks, and hearts float up). */
  pokePet(point: Point): boolean {
    if (!this.pet) return false;
    const paws = toScreen(this.pet.position);
    if (Math.abs(point.x - paws.x) > 16 || point.y < paws.y - 28 || point.y > paws.y + 4) return false;
    cuddle(this.pet);
    return true;
  }

  /** Canvas position of someone's feet (PLAYER_ID for the player), or null when they are not in the room. */
  screenPositionOf(personId: string): Point | null {
    const walker = personId === PLAYER_ID ? this.player : this.characters.get(personId);
    return walker ? toScreen(walker.position) : null;
  }
}
