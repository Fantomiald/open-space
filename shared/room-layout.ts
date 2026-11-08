// The rooms, in floor tiles (x along the back wall, y from the back wall towards the viewer): the office, laid out
// like the original Bureau des agents (windows on the city, groups of desks on coloured rugs, the user's desk in the
// middle, a whiteboard on wheels, a reading corner and a coffee corner), and the break room, where sessions put to rest sit on sofas until
// they are called back, and the automatons' server room (racks, capsules around a floating orb). Everything is drawn in code (src/room/pixel-furniture.ts). Shared because the tests read it.
import type { Festival } from './festivals.ts';

/** Each room's floor: x from 0 to width along the back wall, y from 0 to depth along the wall with the door. */
export const ROOM = { width: 20, depth: 14 };

export type PieceKind =
  | 'desk' | 'bossDesk' | 'chair' | 'plant' | 'bigPlant' | 'bookshelf' | 'sofa' | 'sofaArm' | 'couch' | 'couchArm' | 'lowTable'
  | 'floorLamp' | 'cooler' | 'whiteboard' | 'counter'
  // the automatons' server room: racks along the walls, the capsules they stand in (their back, then their glass drawn
  // over whoever stands in it), and the orb floating in the middle
  | 'serverRack' | 'pod' | 'podGlass' | 'orb'
  // the operator's console of the server room
  | 'automataConsole'
  // a teleporter on the floor between the office and the automatons' room, a twin in each
  | 'portal'
  // the numbers object, one of these (see METRICS_OBJECT)
  | MetricsKind
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
  /** hangs on the wall its footprint is against: nothing on the floor, and drawn before whoever and whatever stands in the room */
  wall?: true;
  /** drawn just after whoever stands on its tiles (a capsule's glass, in front of the automaton in it) */
  front?: true;
}

/**
 * The numbers object ("Chiffres", a click opens the numbers file; only there when the settings name one): drafts of
 * what it is in the office, the one in METRICS_OBJECT is the room's. A pile of banknotes and a notepad with a rising
 * curve on the user's desk; a dashboard screen on the left wall; a stock ticker along it; a piggy bank on the bookshelf.
 */
export type MetricsKind = 'cash' | 'metricsTv' | 'ticker' | 'piggyBank';
export const METRICS_KINDS: readonly MetricsKind[] = ['cash', 'metricsTv', 'ticker', 'piggyBank'];
export const METRICS_OBJECT: MetricsKind = 'metricsTv';
export const isMetricsPiece = (piece: FurniturePiece) => (METRICS_KINDS as readonly PieceKind[]).includes(piece.kind);

/**
 * A place to sit, and the direction a seated person faces (2: +x, 4: +y, towards the viewer). On a sofa, the person
 * sits off the middle of the tile (`at`, against its back) and higher than on a chair (`lift`, in room pixels).
 * `standing`: no seat at all, whoever is there stands (an automaton in its capsule).
 */
export interface Seat { x: number; y: number; facing: number; at?: { x: number; y: number }; lift?: number; standing?: true }

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
export type Activity = 'coffee' | 'water' | 'window' | 'books' | 'sofa' | 'party';

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
/** Heights of the tops props stand on, in art pixels (see pixel-furniture.ts). */
export const TOPS = { desk: 11, lowTable: 7, bookshelf: 24 } as const;
const READING_SOFA = wallSofa(12, 2);
const BOSS_DESK = piece('bossDesk', 8, 6, 3);
const BOOKSHELF = piece('bookshelf', 4.5, 13, 2);

/** Each draft of the numbers object, where it goes (the props have the footprint of the desk or shelf they stand on). */
export const METRICS_PIECES: Readonly<Record<MetricsKind, FurniturePiece>> = {
  cash: piece('cash', BOSS_DESK.x, BOSS_DESK.y, BOSS_DESK.width, BOSS_DESK.depth, false, { top: TOPS.desk }),
  // on the left wall, high above the desks along it, between the back corner and the door
  metricsTv: piece('metricsTv', 0, 1.8, 0.12, 2.5, false, { wall: true }),
  ticker: piece('ticker', 0, 1.2, 0.1, 4.2, false, { wall: true }),
  piggyBank: piece('piggyBank', BOOKSHELF.x, BOOKSHELF.y, BOOKSHELF.width, BOOKSHELF.depth, false, { top: TOPS.bookshelf }),
};

export const OFFICE: Layout = {
  furniture: [
    ...DESKS.map(([x, y]) => piece('desk', x, y, 2)),
    ...DESK_SEATS.map((seat) => piece('chair', seat.x, seat.y, 1, 1, false)),
    // the user's desk in the middle, its chair behind it (the first player spot)
    BOSS_DESK,
    piece('chair', 9, 5, 1, 1, false),
    // along the back wall
    piece('plant', 0, 0),
    // the whiteboard on its stand, its notes facing the room (a click opens them)
    piece('whiteboard', 8, 0.2, 4, 0.6),
    piece('bigPlant', 19, 0),
    // the reading corner, front left, and the coffee corner, front right
    piece('floorLamp', 0, 11),
    ...READING_SOFA.pieces,
    BOOKSHELF,
    // left of the bookshelf: its right side is where someone of the crew stands to pick a book (visitSpots)
    piece('plant', 3, 13),
    piece('plant', 14, 13),
    piece('counter', 15, 13, 3),
    // the water cooler, right of the coffee machine
    piece('cooler', 18, 13),
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
    // a glass at the cooler, a little right of it so it does not hide them
    { activity: 'water', at: { x: 18.4, y: 12.2 }, facing: 4 },
    // at the windows the whiteboard leaves free, between the chairs of the desks in front (so neither hides them)
    { activity: 'window', at: { x: 3.4, y: 1.1 }, facing: 0 },
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
    piece('bigPlant', 6.1, 0),
    piece('bigPlant', 12.9, 0),
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

/* The automatons' server room */

/** The orb floating in the middle of the server room: the tile under its centre, and how high it floats (art pixels). */
export const ORB = { x: 10, y: 7, z: 30 };

/**
 * How an automaton stands in a capsule: always facing the viewer (+x or +y, never its back to them), turned to the
 * side the orb is on, on screen (the screen's x runs with x - y).
 */
export const podFacing = (pod: { x: number; y: number }, orb: { x: number; y: number } = ORB): number =>
  (orb.x - orb.y) < (pod.x - pod.y) ? 4 : 2;

/**
 * The capsules, in a ring around the orb, in the order they are taken: the far ones first (their cord of light runs
 * towards the viewer, in plain sight), then the sides, the near ones last.
 */
const PODS: readonly (readonly [number, number])[] = [
  [10, 2], [6, 3], [14, 3], [4, 6], [16, 6], [8, 2], [12, 2], [5, 9], [15, 9], [7, 11], [13, 11], [10, 12],
];
/** How high an automaton stands in its capsule, on its base, in room pixels. */
export const POD_LIFT = 4;
const POD_SEATS: readonly Seat[] = PODS.map(([x, y]) => ({ x, y, facing: podFacing({ x, y }), lift: POD_LIFT, standing: true }));

/** A rack of servers against the back wall (facing +y) or the left wall (facing +x). */
const rack = (x: number, y: number, alongLeft = false) => (alongLeft ? piece('serverRack', x, y, 0.9, 1) : piece('serverRack', x, y, 1, 0.9));

/** The server room's teleporter, back to the office: at the front, right of the capsules, clear of them. */
export const SERVER_PORTAL: FurniturePiece = piece('portal', 16.8, 13.2, 3, 0.5);

export const SERVER_ROOM: Layout = {
  furniture: [
    ...[1, 2, 3, 5, 6, 7, 13, 14, 15, 17, 18].map((x) => rack(x, 0)),
    ...[1, 2, 3, 4, 5, 6, 12].map((y) => rack(0, y, true)),
    ...POD_SEATS.flatMap((seat) => [piece('pod', seat.x, seat.y, 1, 1, false, { behind: true }), piece('podGlass', seat.x, seat.y, 1, 1, false, { front: true })]),
    piece('orb', ORB.x - 0.5, ORB.y - 0.5),
    // the operator's console, front left, where the user sits to watch them
    piece('automataConsole', 2, 12, 2),
    SERVER_PORTAL,
    piece('chair', 2, 11, 1, 1, false),
  ],
  seats: POD_SEATS,
  rugs: [],
  wallItems: [],
  door: { x: 0, y: 9 },
  playerSpots: [{ seat: { x: 2, y: 11, facing: 4, lift: DESK_SEAT_LIFT }, at: { x: 2.5, y: 11.5 }, lift: DESK_SEAT_LIFT, area: { fromX: 2, toX: 4, fromY: 11, toY: 13 }, atDesk: false }],
};

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

/** The office with its numbers object (the user named a numbers file); the other room as it is. */
/**
 * The teleporter to the automatons' room: a ring standing on its plinth at the front of the office, between the
 * bookshelf and the coffee corner, its face to the viewer (+y): nothing stands in front of it, and it is off the
 * aisles. Whoever goes through walks up behind it and into the ring (Floor.portalFront, Floor.portal); its twin in the
 * server room (SERVER_PORTAL) brings back.
 */
export const OFFICE_PORTAL: FurniturePiece = piece('portal', 9, 13.2, 3, 0.5);
/** A layout with the teleporter to the automatons' room. */
export const withAutomataAccess = (layout: Layout): Layout => ({ ...layout, furniture: [...layout.furniture, OFFICE_PORTAL] });

export const withMetrics = (layout: Layout): Layout => (layout === OFFICE ? { ...layout, furniture: [...layout.furniture, METRICS_PIECES[METRICS_OBJECT]] } : layout);

/** A room as it is for a festival (or none): its furniture, plus the festival's, and the festival's places to drop by. */
export function layoutOn(layout: Layout, festival: Festival | null): Layout {
  // the server room keeps its own look, festival or not
  if (!festival || layout === SERVER_ROOM) return layout;
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
