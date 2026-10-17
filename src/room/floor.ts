// One room's floor, from its layout: where its seats are, which tiles are free, and the walking routes across it.
// The office and the break room each have their own (see shared/room-layout.ts).
import type { Festival } from '../../shared/festivals.ts';
import { blockedTiles, layoutOn, type Layout, type PlayerSpot } from '../../shared/room-layout.ts';
import { DOOR_SIZE, ROOM, facingVector, onLeftWall, tileCenter, type Point } from './geometry.ts';
import { route } from './paths.ts';

/** Clicks closer than this to the walls are ignored. */
const WALL_MARGIN = 0.2;

export class Floor {
  readonly layout: Layout;
  /** where people stand in the doorway, coming in or going out */
  readonly door: Point;
  private readonly blocked: Set<string>;

  /** `festival`: its decorations join the furniture. */
  constructor(layout: Layout, festival: Festival | null = null) {
    this.layout = layoutOn(layout, festival);
    this.door = { x: 0.4, y: layout.door.y + 0.6 };
    this.blocked = blockedTiles(this.layout.furniture);
  }

  get seatCount() { return this.layout.seats.length; }

  /** Where someone sits: the middle of the chair's tile, or against a sofa's back. */
  seatPosition(seat: number): Point { const place = this.layout.seats[seat]; return place.at ?? tileCenter(place); }
  seatFacing(seat: number): Point { return facingVector(this.layout.seats[seat].facing); }
  /** How far above the floor someone sitting there is drawn, in room pixels. */
  seatLift(seat: number): number { return this.layout.seats[seat].lift ?? 0; }

  /** True for a tile inside the room that no furniture stands on (chairs, sofas and rugs can be walked to). */
  isFreeTile = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < ROOM.width && y < ROOM.depth && !this.blocked.has(`${x},${y}`);

  /** True for a spot the player can walk to: inside the walls and not on furniture. */
  isWalkable(tile: Point): boolean {
    const inside = tile.x >= WALL_MARGIN && tile.y >= WALL_MARGIN && tile.x <= ROOM.width - WALL_MARGIN && tile.y <= ROOM.depth - WALL_MARGIN;
    return inside && this.isFreeTile(Math.floor(tile.x), Math.floor(tile.y));
  }

  route(from: Point, to: Point): Point[] { return route(from, to, this.isFreeTile); }
  /** From anywhere (the door, or halfway out) to a seat, sitting down at its own spot. */
  pathToSeat(from: Point, seat: number): Point[] {
    const place = this.layout.seats[seat];
    const path = this.route(from, place);
    return place.at ? [...path, { ...place.at }] : path;
  }
  /** From anywhere (usually a seat) out through the door. */
  pathToDoor(from: Point): Point[] { return [...this.route(from, this.layout.door), this.door]; }

  /** Where someone coming in through the door stands, one step inside, facing the room. */
  get inside(): Point { return { x: 1.5, y: this.layout.door.y + 0.5 }; }

  /** True for a canvas point on the door or its frame. */
  isDoorAt(screen: Point): boolean {
    const { along, height } = onLeftWall(screen);
    const from = this.layout.door.y - 0.15;
    return along >= from && along <= from + DOOR_SIZE.width + 0.3 && height >= 0 && height <= DOOR_SIZE.height + 4;
  }

  /** The spot where the user can sit whose area holds a floor point, if any. */
  spotAt(tile: Point): PlayerSpot | null {
    return this.layout.playerSpots.find(({ area }) => tile.x >= area.fromX && tile.x < area.toX && tile.y >= area.fromY && tile.y < area.toY) ?? null;
  }
}
