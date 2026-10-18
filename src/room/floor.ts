// One room's floor, from its layout: where its seats are, which tiles are free, and the walking routes across it.
// The office and the break room each have their own (see shared/room-layout.ts).
import type { Festival } from '../../shared/festivals.ts';
import { blockedTiles, isMetricsPiece, layoutOn, withMetrics, type Layout, type MetricsKind, type PlayerSpot } from '../../shared/room-layout.ts';
import { DOOR_SIZE, ROOM, boxOutline, facingVector, insideConvex, onLeftWall, tileCenter, type Box, type Point } from './geometry.ts';
import { route } from './paths.ts';

/** Clicks closer than this to the walls are ignored. */
const WALL_MARGIN = 0.2;
/**
 * The laptop on the user's desk (bossDesk in pixel-furniture.ts), keyboard and lid: in tiles from the desk's corner,
 * and from the desk's top to the lid's, in room pixels above the floor.
 */
const LAPTOP = { fromX: 1.1, toX: 1.9, fromY: 0.15, toY: 0.61, low: 22, high: 34 };
/** The laptop is small: the pointer finds it a bit around it too (tiles, room pixels). */
const LAPTOP_MARGIN = { across: 0.15, up: 4 };
/** The whiteboard on its stand (see pixel-furniture.ts), from the floor to the top of its posts, in room pixels. */
const BOARD_HEIGHT = 88;
/**
 * What a click opens the numbers on, for each draft of the numbers object (pixel-furniture.ts draws them): in tiles
 * from the piece's corner, and in room pixels above the floor.
 */
export const METRICS_BOXES: Readonly<Record<MetricsKind, Box>> = {
  // the notepad and the banknotes at the left end of the user's desk
  cash: { fromX: 0, toX: 0.8, fromY: 0.1, toY: 0.9, low: 22, high: 48 },
  metricsTv: { fromX: 0, toX: 0.12, fromY: 0, toY: 2.5, low: 52, high: 84 },
  ticker: { fromX: 0, toX: 0.1, fromY: 0, toY: 4.2, low: 70, high: 86 },
  piggyBank: { fromX: 0.6, toX: 1.4, fromY: 0, toY: 0.6, low: 48, high: 70 },
};

/** Grows a box by `across` tiles on each side and `up` room pixels above and below. */
const grown = (box: Box, across: number, up: number): Box => ({
  fromX: box.fromX - across, toX: box.toX + across, fromY: box.fromY - across, toY: box.toY + across, low: box.low - up, high: box.high + up,
});

export class Floor {
  readonly layout: Layout;
  /** where people stand in the doorway, coming in or going out */
  readonly door: Point;
  private readonly blocked: Set<string>;
  /** what can be walked on but not walked across: chairs, sofas, things on the floor (only where someone goes or leaves from) */
  private readonly avoided: Set<string>;
  /** the user's laptop, where a click opens a terminal: in the room with their desk (the office) */
  readonly userScreen: Box | null;
  /** the whiteboard, where a click opens its notes (the office) */
  readonly board: Box | null;
  /** the numbers object, where a click opens the numbers (the office) */
  readonly metrics: Box | null;

  /** `festival`: its decorations join the furniture. `numbers`: the office has its numbers object. */
  constructor(layout: Layout, festival: Festival | null = null, numbers = false) {
    this.layout = layoutOn(numbers ? withMetrics(layout) : layout, festival);
    this.door = { x: 0.4, y: layout.door.y + 0.6 };
    this.blocked = blockedTiles(this.layout.furniture);
    this.avoided = blockedTiles(this.layout.furniture.filter((piece) => !piece.blocks && piece.top === undefined && !piece.wall).map((piece) => ({ ...piece, blocks: true })));
    const desk = this.layout.furniture.find((piece) => piece.kind === 'bossDesk');
    this.userScreen = desk
      ? { fromX: desk.x + LAPTOP.fromX, toX: desk.x + LAPTOP.toX, fromY: desk.y + LAPTOP.fromY, toY: desk.y + LAPTOP.toY, low: LAPTOP.low, high: LAPTOP.high }
      : null;
    const board = this.layout.furniture.find((piece) => piece.kind === 'whiteboard');
    this.board = board ? { fromX: board.x, toX: board.x + board.width, fromY: board.y, toY: board.y + board.depth, low: 0, high: BOARD_HEIGHT } : null;
    const metrics = this.layout.furniture.find(isMetricsPiece);
    const box = metrics && METRICS_BOXES[metrics.kind as MetricsKind];
    this.metrics = metrics && box ? { ...box, fromX: metrics.x + box.fromX, toX: metrics.x + box.toX, fromY: metrics.y + box.fromY, toY: metrics.y + box.toY } : null;
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

  /** A route through the aisles: past the chairs and sofas, never over them, except the one it starts or ends on. */
  route(from: Point, to: Point): Point[] {
    const ends = new Set([`${Math.floor(from.x)},${Math.floor(from.y)}`, `${Math.floor(to.x)},${Math.floor(to.y)}`]);
    return route(from, to, (x, y) => this.isFreeTile(x, y) && (!this.avoided.has(`${x},${y}`) || ends.has(`${x},${y}`)));
  }
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

  /** True for a canvas point on the user's laptop, or just around it. */
  isUserScreenAt(screen: Point): boolean {
    return !!this.userScreen && insideConvex(screen, boxOutline(grown(this.userScreen, LAPTOP_MARGIN.across, LAPTOP_MARGIN.up)));
  }

  /** True for a canvas point on the whiteboard. */
  isBoardAt(screen: Point): boolean {
    return !!this.board && insideConvex(screen, boxOutline(this.board));
  }

  /** True for a canvas point on the numbers object. */
  isMetricsAt(screen: Point): boolean {
    return !!this.metrics && insideConvex(screen, boxOutline(this.metrics));
  }

  /** The spot where the user can sit whose area holds a floor point, if any. */
  spotAt(tile: Point): PlayerSpot | null {
    return this.layout.playerSpots.find(({ area }) => tile.x >= area.fromX && tile.x < area.toX && tile.y >= area.fromY && tile.y < area.toY) ?? null;
  }
}
