// The two rooms, in floor tiles (x along the back wall, y from the back wall towards the viewer): the office, laid out
// like the original Bureau des agents (windows on the city, groups of desks on coloured rugs, the user's desk in the
// middle, a reading corner and a coffee corner), and the break room, where sessions put to rest sit on sofas until
// they are called back. Everything is drawn in code (src/room/pixel-furniture.ts). Shared because the tests read it.
import type { Festival } from './festivals.ts';

/** Each room's floor: x from 0 to width along the back wall, y from 0 to depth along the wall with the door. */
export const ROOM = { width: 20, depth: 14 };

export type PieceKind =
  | 'desk' | 'bossDesk' | 'chair' | 'plant' | 'bigPlant' | 'bookshelf' | 'sofa' | 'sofaArm' | 'couch' | 'couchArm' | 'lowTable'
  | 'floorLamp' | 'cooler' | 'printer' | 'server' | 'counter'
  // the festivals' (see FESTIVAL_PIECES): standing on the floor
  | 'pumpkin' | 'christmasTree' | 'gifts' | 'partyTable' | 'balloons' | 'pool' | 'speaker' | 'fan' | 'kumquat' | 'eggs'
  // and props: the same footprint as the desk or table they stand on, drawn right after it
  | 'crepes' | 'galette' | 'rose' | 'lilyOfTheValley' | 'chocolateBunny' | 'champagne' | 'cake' | 'redEnvelope';

export interface FurniturePiece {
  kind: PieceKind;
  /** the corner with the smallest x and y the piece covers, in tiles (not always whole) */
  x: number;
  y: number;
  width: number;
  depth: number;
  /** false for what people can walk on or sit on (chairs, sofas) */
  blocks: boolean;
  /** drawn before anyone standing or sitting on its tiles (a sofa's seat and back) */
  behind?: boolean;
  /** a prop: the height of the top it stands on, in art pixels (it has the footprint of that desk or table) */
  top?: number;
}

/**
 * A place to sit, and the direction a seated person faces (2: +x, 4: +y, towards the viewer). On a sofa, the person
 * sits off the middle of the tile (`at`, against its back) and higher than on a chair (`lift`, in room pixels).
 */
export interface Seat { x: number; y: number; facing: number; at?: { x: number; y: number }; lift?: number }

/** A coloured rug, drawn with the floor. */
export interface Rug { x: number; y: number; width: number; depth: number; colour: 'blue' | 'green' | 'purple' | 'amber' }

/** Something hung on the back wall: its left end and width in tiles along it. */
export interface WallItem { kind: 'window' | 'clock' | 'tv'; fromX: number; width: number }

/** Where the user can sit; a click on a spot's area sends them there. The first one is where they start. */
export interface PlayerSpot {
  seat: Seat;
  at: { x: number; y: number };
  /** how far above the floor the user is drawn, in room pixels (the cushions of a sofa) */
  lift: number;
  area: { fromX: number; toX: number; fromY: number; toY: number };
  /** the user's own desk: its screen lights up while they sit there */
  atDesk: boolean;
}

/** What someone of the crew without a session drops by the office for (src/room/visitors.ts). */
export type Activity = 'coffee' | 'water' | 'printer' | 'window' | 'books' | 'sofa' | 'party';

/**
 * Where a visitor stops: the floor point they stand on (or sit on, raised by `lift`) and the direction they face. Two
 * spots of an activity with `together` take two people at once, who then turn to each other (`together` instead of `facing`).
 */
export interface VisitSpot { activity: Activity; at: { x: number; y: number }; facing: number; lift?: number; together?: number }

export interface Layout {
  furniture: readonly FurniturePiece[];
  /** taken in this order, so the first people to come in spread over the room */
  seats: readonly Seat[];
  rugs: readonly Rug[];
  wallItems: readonly WallItem[];
  /** the door, on the left wall: people come in on this tile */
  door: { x: number; y: number };
  playerSpots: readonly PlayerSpot[];
  /** where the crew without a session drops by (the office only) */
  visitSpots?: readonly VisitSpot[];
}

const piece = (kind: PieceKind, x: number, y: number, width = 1, depth = 1, blocks = true, extra: Partial<FurniturePiece> = {}): FurniturePiece =>
  ({ kind, x, y, width, depth, blocks, ...extra });

/** A sofa against the left wall, facing the room (+x): its seats, and its pieces (the near arm is drawn over the last seat). */
function wallSofa(y: number, seats: number): { pieces: FurniturePiece[]; seats: Seat[] } {
  return {
    pieces: [piece('sofa', 0, y, 1, seats, false, { behind: true }), piece('sofaArm', 0, y + seats - 0.22, 1, 0.22, false)],
    seats: Array.from({ length: seats }, (_, index) => ({ x: 0, y: y + index, facing: 2, at: { x: 0.62, y: y + index + 0.5 }, lift: 10 })),
  };
}

/** A sofa facing the viewer (+y), its back on the back wall's side: its seats, and its pieces (the right arm drawn last). */
function couch(x: number, y: number, seats: number): { pieces: FurniturePiece[]; seats: Seat[] } {
  return {
    pieces: [piece('couch', x, y, seats, 1, false, { behind: true }), piece('couchArm', x + seats - 0.2, y, 0.2, 1, false)],
    seats: Array.from({ length: seats }, (_, index) => ({ x: x + index, y, facing: 4, at: { x: x + index + 0.5, y: y + 0.6 }, lift: 10 })),
  };
}

/** Lets the user sit on sofa seats: a click on a seat's tile sends them there. */
const sofaSpots = (seats: readonly Seat[]): PlayerSpot[] =>
  seats.map((seat) => ({ seat, at: seat.at!, lift: seat.lift!, area: { fromX: seat.x, toX: seat.x + 1, fromY: seat.y, toY: seat.y + 1 }, atDesk: false }));

/* The office */

/**
 * Desks of two tiles; whoever works there sits behind it, on the back wall's side, facing the viewer, raised a little
 * (`lift`) so their shoulders and arms show above its top.
 */
export const DESK_SEAT_LIFT = 8;
const DESKS = [
  [3, 3], [15, 3], [15, 9], [1, 7], [13, 3], [17, 9],
  [5, 3], [17, 3], [13, 9], [5, 7], [1, 3], [3, 7],
] as const;
const DESK_SEATS: readonly Seat[] = DESKS.map(([x, y]) => ({ x, y: y - 1, facing: 4, lift: DESK_SEAT_LIFT }));
const READING_SOFA = wallSofa(12, 2);
const BOSS_DESK = piece('bossDesk', 8, 6, 3);

export const OFFICE: Layout = {
  furniture: [
    ...DESKS.map(([x, y]) => piece('desk', x, y, 2)),
    ...DESK_SEATS.map((seat) => piece('chair', seat.x, seat.y, 1, 1, false)),
    // the user's desk in the middle, its chair behind it (the first player spot)
    BOSS_DESK,
    piece('chair', 9, 5, 1, 1, false),
    // along the back wall
    piece('plant', 0, 0),
    piece('cooler', 8, 0),
    piece('printer', 9.6, 0),
    piece('server', 11, 0),
    piece('bigPlant', 19, 0),
    // the reading corner, front left, and the coffee corner, front right
    piece('floorLamp', 0, 11),
    ...READING_SOFA.pieces,
    piece('bookshelf', 4.5, 13, 2),
    // left of the bookshelf: its right side is where someone of the crew stands to pick a book (visitSpots)
    piece('plant', 3, 13),
    piece('plant', 14, 13),
    piece('counter', 15, 13, 3),
    piece('bigPlant', 19, 13),
    piece('floorLamp', 19, 11),
  ],
  seats: DESK_SEATS,
  rugs: [
    { x: 0.5, y: 1.5, width: 7, depth: 7, colour: 'blue' },
    { x: 12.5, y: 1.5, width: 7, depth: 3, colour: 'green' },
    { x: 12.5, y: 7.5, width: 7, depth: 3, colour: 'purple' },
    { x: 7.5, y: 4.5, width: 4, depth: 3, colour: 'amber' },
  ],
  wallItems: [
    { kind: 'window', fromX: 1, width: 4.6 },
    { kind: 'window', fromX: 6.8, width: 4.2 },
    { kind: 'clock', fromX: 12.6, width: 0.8 },
    { kind: 'window', fromX: 14.4, width: 4.6 },
  ],
  door: { x: 0, y: 9 },
  playerSpots: [
    { seat: { x: 9, y: 5, facing: 4 }, at: { x: 9.5, y: 5.5 }, lift: 0, area: { fromX: 8, toX: 11, fromY: 5, toY: 7 }, atDesk: true },
    ...sofaSpots(READING_SOFA.seats),
  ],
  visitSpots: [
    // a coffee at the counter, alone facing it, or with someone, turned to each other (both faces show: the left one
    // looks down-right, the right one down-left)
    { activity: 'coffee', at: { x: 15.3, y: 12.3 }, facing: 4, together: 2 },
    { activity: 'coffee', at: { x: 17, y: 12.3 }, facing: 4, together: 4 },
    { activity: 'water', at: { x: 8.5, y: 1.3 }, facing: 0 },
    { activity: 'printer', at: { x: 10.2, y: 1.3 }, facing: 0 },
    // at the windows, where no row of desks stands in front
    { activity: 'window', at: { x: 7.2, y: 1.2 }, facing: 0 },
    { activity: 'window', at: { x: 18.4, y: 1.3 }, facing: 0 },
    // against the bookshelf's right side, turned to it: it stands on the room's front edge, and hides whoever is
    // behind or left of it
    { activity: 'books', at: { x: 6.75, y: 12.75 }, facing: 5 },
    ...READING_SOFA.seats.map((seat): VisitSpot => ({ activity: 'sofa', at: seat.at!, facing: seat.facing, lift: seat.lift })),
  ],
};

/* The break room */

/** Every other seat first, sofa after sofa, so the first people to come in do not sit elbow to elbow. */
function spread(sofas: readonly (readonly Seat[])[]): Seat[] {
  const ranked = sofas.flatMap((seats) => seats.map((seat, index) => ({ seat, rank: (index % 2) * 100 + index })));
  return ranked.sort((a, b) => a.rank - b.rank).map(({ seat }) => seat);
}

const COUCHES = [couch(2, 2, 4), couch(8, 2, 4), couch(14, 2, 4), couch(5, 8, 4), couch(12, 8, 4)];
const LOUNGE_WALL_SOFA = wallSofa(4, 3);
const ARMCHAIR = wallSofa(12, 1);

export const LOUNGE: Layout = {
  furniture: [
    ...COUCHES.flatMap((item) => item.pieces),
    ...LOUNGE_WALL_SOFA.pieces,
    ...ARMCHAIR.pieces,
    // a low table in front of every sofa
    piece('lowTable', 3, 4, 2),
    piece('lowTable', 9, 4, 2),
    piece('lowTable', 15, 4, 2),
    piece('lowTable', 6, 10, 2),
    piece('lowTable', 13, 10, 2),
    piece('lowTable', 2, 5, 1, 2),
    piece('plant', 0, 0),
    piece('bigPlant', 6.6, 0),
    piece('bigPlant', 12.6, 0),
    piece('plant', 19, 0),
    piece('floorLamp', 0, 2),
    piece('floorLamp', 19, 7),
    piece('bookshelf', 5.5, 13, 2),
    piece('plant', 4, 13),
    piece('counter', 15, 13, 3),
    piece('bigPlant', 19, 13),
    piece('plant', 11, 13),
  ],
  seats: [...spread([...COUCHES, LOUNGE_WALL_SOFA].map((item) => item.seats)), ...ARMCHAIR.seats],
  rugs: [
    { x: 1.5, y: 1.5, width: 17, depth: 4.5, colour: 'amber' },
    { x: 4.5, y: 7.5, width: 12, depth: 4.5, colour: 'purple' },
  ],
  wallItems: [
    { kind: 'window', fromX: 1, width: 4.6 },
    { kind: 'tv', fromX: 7.6, width: 4.8 },
    { kind: 'window', fromX: 14.4, width: 4.6 },
  ],
  door: { x: 0, y: 9 },
  // the armchair first (where the user starts), then every sofa; a seat taken by a session opens it instead (RoomView)
  playerSpots: sofaSpots([...ARMCHAIR.seats, ...COUCHES.flatMap((item) => item.seats), ...LOUNGE_WALL_SOFA.seats]),
};

/** Heights of the tops props stand on, in art pixels (see pixel-furniture.ts). */
export const TOPS = { desk: 11, lowTable: 7 } as const;
type Support = Pick<FurniturePiece, 'x' | 'y' | 'width' | 'depth'> & { top: number };
/** A prop on a piece of furniture: drawn on its top, right after it (see furnitureDepth). */
const on = (kind: PieceKind, support: Support) => piece(kind, support.x, support.y, support.width, support.depth, false, { top: support.top });
const BOSS_TOP: Support = { ...BOSS_DESK, top: TOPS.desk };
const onDesks = (kind: PieceKind) => DESKS.map(([x, y]) => on(kind, { x, y, width: 2, depth: 1, top: TOPS.desk }));
const lowTable = (x: number, y: number): Support => ({ x, y, width: 2, depth: 1, top: TOPS.lowTable });
const LOW_TABLES = { a: lowTable(3, 4), b: lowTable(9, 4), c: lowTable(15, 4), d: lowTable(6, 10), e: lowTable(13, 10) };
const eggs = (spots: readonly (readonly [number, number])[]) => spots.map(([x, y]) => piece('eggs', x, y, 1, 1, false));

/** What each festival adds to each room (the walls and the light are dressed by src/room/festivals). */
const FESTIVAL_PIECES: Readonly<Record<Festival, Readonly<Record<'office' | 'lounge', readonly FurniturePiece[]>>>> = {
  newYear: {
    office: [on('champagne', BOSS_TOP)],
    lounge: [on('champagne', LOW_TABLES.b), on('champagne', LOW_TABLES.e)],
  },
  epiphany: { office: [on('galette', BOSS_TOP)], lounge: [on('galette', LOW_TABLES.b), on('galette', LOW_TABLES.d)] },
  chineseNewYear: {
    office: [piece('kumquat', 12, 0), piece('kumquat', 7, 12), on('redEnvelope', BOSS_TOP)],
    lounge: [piece('kumquat', 19, 3), piece('kumquat', 0, 7), on('redEnvelope', LOW_TABLES.b)],
  },
  candlemas: { office: [on('crepes', BOSS_TOP)], lounge: [on('crepes', LOW_TABLES.a), on('crepes', LOW_TABLES.c), on('crepes', LOW_TABLES.e)] },
  valentine: { office: [on('rose', BOSS_TOP)], lounge: [on('rose', LOW_TABLES.b), on('rose', LOW_TABLES.d)] },
  // a paddling pool in front of the user's desk, everyone in swimwear and water flying (src/room/festivals)
  songkran: { office: [piece('pool', 8, 7.2, 3, 1.8)], lounge: [piece('pool', 8, 5.1, 3, 1.8)] },
  easter: {
    office: [on('chocolateBunny', BOSS_TOP), ...eggs([[7, 5], [12, 7], [2, 10], [10, 12], [17, 11], [6, 1]])],
    lounge: [on('chocolateBunny', LOW_TABLES.b), ...eggs([[3, 7], [11, 6], [18, 5], [8, 12], [16, 12], [1, 1]])],
  },
  mayDay: { office: [...onDesks('lilyOfTheValley'), on('lilyOfTheValley', BOSS_TOP)], lounge: Object.values(LOW_TABLES).map((table) => on('lilyOfTheValley', table)) },
  music: { office: [piece('speaker', 12, 6), piece('speaker', 7, 6)], lounge: [piece('speaker', 4, 0), piece('speaker', 16, 0)] },
  bastille: { office: [], lounge: [] },
  summer: { office: [piece('fan', 12, 6), piece('fan', 7, 10)], lounge: [piece('fan', 19, 4), piece('fan', 1, 7)] },
  birthday: {
    office: [piece('partyTable', 8, 9, 2, 1), piece('balloons', 11, 5, 1, 1, false), piece('balloons', 7, 6, 1, 1, false), piece('gifts', 10, 9)],
    lounge: [on('cake', LOW_TABLES.b), piece('balloons', 19, 3, 1, 1, false), piece('balloons', 1, 3, 1, 1, false), piece('gifts', 11, 4)],
  },
  halloween: {
    office: [piece('pumpkin', 13, 0), piece('pumpkin', 19, 6), piece('pumpkin', 8, 13)],
    lounge: [piece('pumpkin', 11, 0), piece('pumpkin', 18, 13), piece('pumpkin', 9, 13)],
  },
  christmas: {
    office: [piece('christmasTree', 12, 4, 2, 2), piece('gifts', 14, 5), piece('gifts', 11, 5)],
    lounge: [piece('christmasTree', 18, 3, 2, 2), piece('gifts', 17, 4), piece('gifts', 18, 5)],
  },
};

/** Where the crew drops by for a festival, in the office: around its table, its tree, its pool. */
const FESTIVAL_VISITS: Partial<Record<Festival, readonly VisitSpot[]>> = {
  birthday: [{ activity: 'party', at: { x: 8.4, y: 10.4 }, facing: 0, together: 2 }, { activity: 'party', at: { x: 9.8, y: 10.4 }, facing: 0, together: 4 }],
  christmas: [{ activity: 'party', at: { x: 12.3, y: 6.4 }, facing: 0, together: 2 }, { activity: 'party', at: { x: 13.7, y: 6.4 }, facing: 0, together: 4 }],
  songkran: [{ activity: 'party', at: { x: 9.5, y: 9.6 }, facing: 0 }],
};

/** A room as it is for a festival (or none): its furniture, plus the festival's, and the festival's places to drop by. */
export function layoutOn(layout: Layout, festival: Festival | null): Layout {
  if (!festival) return layout;
  const office = layout !== LOUNGE;
  return {
    ...layout,
    furniture: [...layout.furniture, ...FESTIVAL_PIECES[festival][office ? 'office' : 'lounge']],
    ...(office && layout.visitSpots ? { visitSpots: [...layout.visitSpots, ...(FESTIVAL_VISITS[festival] ?? [])] } : {}),
  };
}

/** "x,y" of every tile nobody can walk on. */
export function blockedTiles(pieces: readonly FurniturePiece[]): Set<string> {
  const blocked = new Set<string>();
  for (const item of pieces) {
    if (!item.blocks) continue;
    for (let x = Math.floor(item.x); x < Math.ceil(item.x + item.width); x++) for (let y = Math.floor(item.y); y < Math.ceil(item.y + item.depth); y++) blocked.add(`${x},${y}`);
  }
  return blocked;
}
