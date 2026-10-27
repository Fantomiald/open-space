// A room as it moves: people walking in through the door to their seat, sitting, walking out, the player's avatar
// going where it is sent (or back to a seat of theirs), and, in the office, the pet. No drawing and no DOM here;
// RoomView steps it and draw.ts paints it.
import type { PlayerSpot } from '../../shared/room-layout.ts';
import { t } from '../i18n/index.ts';
import type { Person, RoomPlan } from './cast.ts';
import { createPet, cuddle, stepPet, type Pet } from './pet.ts';
import type { Floor } from './floor.ts';
import { depthOf, distance, facingVector, onFigure, tileCenter, toScreen, toTile, type Point } from './geometry.ts';
import { advanceAlong } from './paths.ts';
import { blinkOffsetOf, type Direction } from './sprites.ts';
import { Visits } from './visitors.ts';

export const PLAYER_ID = 'player';
/** The user's first name, on their tag: the one of their own avatar in the crew. */
export const selfName = (crew: readonly { name: string; self?: boolean }[]) => crew.find((member) => member.self)?.name ?? t.room.you;

/** Tiles per second. */
const WALK_SPEED = 4.2;

export interface Walker { position: Point; heading: Point; path: Point[]; blinkOffset: number }

export type Phase = 'entering' | 'seated' | 'leaving' | 'carried';

/** How far below the pointer the feet of someone carried hang, in canvas pixels: the pointer holds them by the chest. */
const CARRY_HANG = 22;
/** How near a seat (canvas pixels) the feet of someone carried must be for it to take them when let go. */
const DROP_REACH = 30;

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

export class Scene {
  readonly floor: Floor;
  readonly characters = new Map<string, Character>();
  /** the user starts seated at the room's first spot (in the office, behind the boss's desk), facing the room */
  readonly player: Walker;
  /** where the user sits, or null while they stand or walk */
  playerSpot: PlayerSpot | null;
  private headingFor: PlayerSpot | null = null;
  /** How tall someone is drawn, from their feet to the top of their head or hat: RoomView sets it from the sprites. */
  heightOf: (personId: string) => number = () => 52;
  /** walking to the door, to go to the other room */
  private goingOut = false;
  /** set once the user reached the door: the view moves to the other room */
  playerWentOut = false;
  readonly pet: Pet | null;
  /** the crew without a session dropping by (the office only) */
  readonly visits: Visits | null;

  /** `atDoor`: the user comes in through the door (from the other room) instead of sitting at the room's first spot. */
  constructor(floor: Floor, { withPet, atDoor = false, withVisitors = false }: { withPet: boolean; atDoor?: boolean; withVisitors?: boolean }) {
    this.floor = floor;
    const start = floor.layout.playerSpots[0];
    this.player = atDoor
      ? { position: { ...floor.door }, heading: { x: 1, y: 0 }, path: [floor.inside], blinkOffset: blinkOffsetOf(PLAYER_ID) }
      : { position: { ...start.at }, heading: facingVector(start.seat.facing), path: [], blinkOffset: blinkOffsetOf(PLAYER_ID) };
    this.playerSpot = atDoor ? null : start;
    this.pet = withPet ? createPet() : null;
    this.visits = withVisitors ? new Visits(floor) : null;
  }

  /** The session the user holds up to move it to another seat, or null. */
  carried: Character | null = null;

  /** The first name of whoever a person id is: a session's, or a visitor's. */
  nameOf(personId: string): string {
    return this.characters.get(personId)?.person.name ?? this.visits?.visitors.get(personId)?.name ?? '';
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
      if (character.phase === 'carried') continue;
      if (character.phase === 'leaving' || character.seat !== seat) {
        character.seat = seat;
        character.path = this.floor.pathToSeat(character.position, seat);
        character.phase = 'entering';
      }
    }
    const planned = new Set(plan.people.map((person) => person.id));
    for (const character of this.characters.values()) {
      if (planned.has(character.person.id) || character.phase === 'leaving') continue;
      if (character === this.carried) this.carried = null;
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

  /** Picks someone up (a long press on them): they follow the pointer until dropped. False: they are walking out. */
  pickUp(character: Character): boolean {
    if (character.phase === 'leaving') return false;
    character.phase = 'carried';
    character.path = [];
    character.heading = { x: 1, y: 0 };
    this.carried = character;
    return true;
  }

  /** Moves whoever is carried under the canvas point of the pointer. */
  carryTo(point: Point) {
    if (this.carried) this.carried.position = toTile({ x: point.x, y: point.y + CARRY_HANG });
  }

  /** The seats someone carried can be put on: their own, and those nobody else (the user included) has or walks to. */
  freeSeats(): number[] {
    const taken = this.playerSeats();
    for (const character of this.characters.values()) if (character !== this.carried && character.phase !== 'leaving') taken.add(character.seat);
    return this.floor.layout.seats.map((_, seat) => seat).filter((seat) => !taken.has(seat));
  }

  /** Where a seat's sitter has their feet on the canvas. */
  seatScreenPosition(seat: number): Point {
    const feet = toScreen(this.floor.seatPosition(seat));
    return { x: feet.x, y: feet.y - this.floor.seatLift(seat) };
  }

  /** The seat the carried person would land on if let go now (someone else's means a swap), or null (back to theirs). */
  dropSeat(): number | null {
    if (!this.carried) return null;
    const feet = toScreen(this.carried.position);
    const player = this.playerSeats();
    const near = this.floor.layout.seats.map((_, seat) => seat).filter((seat) => !player.has(seat))
      .map((seat) => ({ seat, gap: distance(this.seatScreenPosition(seat), feet) }))
      .filter(({ gap }) => gap <= DROP_REACH)
      .sort((a, b) => a.gap - b.gap);
    return near[0]?.seat ?? null;
  }

  /**
   * Lets the carried person go: on the seat under them, or back on their own. Whoever sat there walks to the seat
   * the carried person left. True when seats changed.
   */
  drop(): boolean {
    const character = this.carried;
    if (!character) return false;
    const seat = this.dropSeat() ?? character.seat;
    const moved = seat !== character.seat;
    this.carried = null;
    const sitter = [...this.characters.values()].find((other) => other !== character && other.phase !== 'leaving' && other.seat === seat);
    if (sitter) {
      sitter.seat = character.seat;
      sitter.path = this.floor.pathToSeat(sitter.position, sitter.seat);
      sitter.phase = 'entering';
    }
    character.seat = seat;
    character.position = this.floor.seatPosition(seat);
    character.heading = this.floor.seatFacing(seat);
    character.phase = 'seated';
    return moved;
  }

  /** A canvas point on someone, their sprite's box above their feet, raised as high as they sit. */
  private covers(walker: Walker, personId: string, lift: number, point: Point): boolean {
    return onFigure(toScreen(walker.position), point, lift + this.heightOf(personId));
  }

  private coversCharacter(character: Character, point: Point): boolean {
    const lift = character.phase === 'seated' ? this.floor.seatLift(character.seat) : 0;
    return this.covers(character, character.person.id, lift, point);
  }

  private coversPlayer = (point: Point) => this.covers(this.player, PLAYER_ID, this.playerSpot?.lift ?? 0, point);

  /** The person under a canvas point (the one in front when several overlap); people walking out cannot be picked. */
  characterAt(point: Point): Character | null {
    const hits = [...this.characters.values()].filter((character) => character.phase !== 'leaving' && this.coversCharacter(character, point));
    hits.sort((a, b) => depthOf(b.position) - depthOf(a.position));
    return hits[0] ?? null;
  }

  /** Who is under a canvas point, the user included (PLAYER_ID): their name tag shows in full. */
  personAt(point: Point): string | null {
    const character = this.characterAt(point);
    if (character && !(this.coversPlayer(point) && depthOf(this.player.position) > depthOf(character.position))) return character.person.id;
    return this.coversPlayer(point) ? PLAYER_ID : null;
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

  /** The visitor under a canvas point, if visitors come to this room. */
  visitorAt(point: Point) {
    return this.visits?.at(point, this.heightOf) ?? null;
  }

  /** True when a canvas point falls on the pet, with no one in front of it there; it gets a cuddle (it speaks, and hearts float up). */
  pokePet(point: Point): boolean {
    if (!this.pet) return false;
    const paws = toScreen(this.pet.position);
    if (Math.abs(point.x - paws.x) > 16 || point.y < paws.y - 28 || point.y > paws.y + 4) return false;
    const depth = depthOf(this.pet.position);
    const front = [this.characterAt(point), this.visitorAt(point)].some((someone) => someone && depthOf(someone.position) > depth);
    if (front) return false;
    cuddle(this.pet);
    return true;
  }

  /** Canvas position of someone's feet (PLAYER_ID for the player), or null when they are not in the room. */
  screenPositionOf(personId: string): Point | null {
    const walker = personId === PLAYER_ID ? this.player : this.characters.get(personId);
    return walker ? toScreen(walker.position) : null;
  }
}
