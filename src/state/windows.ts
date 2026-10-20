// The open sessions' windows as boxes, in pixels of the area they are laid out in: the grid (stack.ts says which window
// goes where, this file how big each one is) and, later, the windows placed by hand. Pure functions.
import type { Box } from './room-frame.ts';
import { placement, type Columns, type Tiling } from './stack.ts';

/** --gutter */
export const GAP = 12;
/** smaller, a window's thread and message field no longer fit */
export const MIN_WINDOW = { width: 320, height: 192 };

/** Fractions summing to 1: the columns in the order of `columns`, and each column's rows (one per window). */
export interface GridSizes { columns: number[]; rows: number[][] }

export const equal = (count: number) => Array.from({ length: count }, () => 1 / count);

/** Where each track starts and how long it is, `fractions` sharing `length` less the gaps between the tracks. */
function tracks(fractions: readonly number[], length: number) {
  const free = length - (fractions.length - 1) * GAP;
  let start = 0;
  return fractions.map((fraction) => {
    const track = { start, size: free * fraction };
    start += track.size + GAP;
    return track;
  });
}

// each dimension set by hand is kept while it still fits the grid, the others are shared out evenly
export const widthsOf = (columns: Columns, sizes: GridSizes | null) => (sizes?.columns.length === columns.length ? sizes.columns : equal(columns.length));
export const heightsOf = (columns: Columns, sizes: GridSizes | null, column: number) => {
  const count = columns[column].length;
  return sizes?.rows[column]?.length === count ? sizes.rows[column] : equal(count);
};

/** The grid of `placement`, each window a box: the windows of a column share its whole height. */
export function gridBoxes(columns: Columns, sizes: GridSizes | null, area: { width: number; height: number }, tiling: Tiling): Record<string, Box> {
  const { slots } = placement(columns, tiling);
  const widths = widthsOf(columns, sizes);
  // the columns from the left: over the room the first one is on the right
  const order = columns.map((_, column) => (tiling.side === 'right' ? columns.length - 1 - column : column));
  const across = tracks(order.map((_, visual) => widths[order.indexOf(visual)]), area.width);
  const boxes: Record<string, Box> = {};
  for (const { id, row } of slots) {
    const column = columns.findIndex((ids) => ids.includes(id));
    const { start: top, size: height } = tracks(heightsOf(columns, sizes, column), area.height)[row];
    const { start: left, size: width } = across[order[column]];
    boxes[id] = { left, top, width, height };
  }
  return boxes;
}

/** The line between tracks `index` and `index + 1` moved by `delta` pixels, neither getting under `min` pixels. */
export function resizeTrack(fractions: readonly number[], index: number, delta: number, total: number, min: number): number[] {
  const pair = (fractions[index] + fractions[index + 1]) * total;
  const first = Math.min(Math.max(fractions[index] * total + delta, min), pair - min);
  return fractions.map((fraction, at) => (at === index ? first / total : at === index + 1 ? (pair - first) / total : fraction));
}

/**
 * The sizes set by hand once the windows changed: another number of columns starts over, a column that gained or lost a
 * window is shared out evenly again (its proportions meant something for the windows it had).
 */
export function keepSizes(previous: Columns, next: Columns, sizes: GridSizes | null): GridSizes | null {
  if (!sizes || previous.length !== next.length) return null;
  return { columns: sizes.columns, rows: sizes.rows.map((rows, column) => (previous[column]?.length === next[column]?.length ? rows : [])) };
}

/** a window's title bar, which must stay within reach */
export const TITLE_HEIGHT = 56;
/** how much of a window stays on screen, across */
export const KEEP_VISIBLE = 120;
/** how close an edge comes to another before it sticks */
export const SNAP = 8;
export const CASCADE_STEP = 32;
/** how close the pointer comes to the edge of the screen for a window to take its half, its quarter or all of it */
export const EDGE_ZONE = 6;

type Size = { width: number; height: number };
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
/** A line drawn while an edge sticks: across (x) or down (y), at `at`, from `from` to `to` on the other axis. */
export interface Guide { axis: 'x' | 'y'; at: number; from: number; to: number }
export type Zone = 'left' | 'right' | 'full' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** No smaller than a readable window, no bigger than the screen, its title bar within reach. */
export function clampBox(box: Box, surface: Size): Box {
  const width = within(box.width, Math.min(MIN_WINDOW.width, surface.width), surface.width);
  const height = within(box.height, Math.min(MIN_WINDOW.height, surface.height), surface.height);
  return {
    left: within(box.left, KEEP_VISIBLE - width, surface.width - KEEP_VISIBLE), top: within(box.top, 0, Math.max(0, surface.height - TITLE_HEIGHT)), width, height,
  };
}

/** `start` pulled by `edge` (a side or a corner) by dx, dy; the opposite side stays where it was. */
export function resizeBox(start: Box, edge: Edge, dx: number, dy: number): Box {
  let { left, top, width, height } = start;
  const right = left + width, bottom = top + height;
  if (edge.includes('w')) { left = Math.min(left + dx, right - MIN_WINDOW.width); width = right - left; }
  if (edge.includes('e')) width = Math.max(width + dx, MIN_WINDOW.width);
  if (edge.includes('n')) { top = Math.min(top + dy, bottom - MIN_WINDOW.height); height = bottom - top; }
  if (edge.includes('s')) height = Math.max(height + dy, MIN_WINDOW.height);
  return { left, top, width, height };
}

/** A line an edge may stick to, and how far a guide drawn along it reaches. */
interface Line { at: number; from: number; to: number }

/** The lines the start side (left or top) and the end side (right or bottom) of a window may stick to, along one axis. */
function lines(axis: 'x' | 'y', others: readonly Box[], surface: Size) {
  const length = axis === 'x' ? surface.width : surface.height, across = axis === 'x' ? surface.height : surface.width;
  const start = (box: Box) => (axis === 'x' ? box.left : box.top), size = (box: Box) => (axis === 'x' ? box.width : box.height);
  const from = (box: Box) => (axis === 'x' ? box.top : box.left), span = (box: Box) => (axis === 'x' ? box.height : box.width);
  const edge = (at: number) => ({ at, from: 0, to: across });
  const along = (box: Box, at: number) => ({ at, from: from(box), to: from(box) + span(box) });
  return {
    starts: [edge(GAP), ...others.flatMap((box) => [along(box, start(box)), along(box, start(box) + size(box) + GAP)])],
    ends: [edge(length - GAP), ...others.flatMap((box) => [along(box, start(box) + size(box)), along(box, start(box) - GAP)])],
    centre: edge(length / 2),
  };
}

const nearest = (value: number, candidates: readonly Line[]) =>
  candidates.reduce<{ line: Line; distance: number } | null>((best, line) => {
    const distance = line.at - value;
    return Math.abs(distance) <= SNAP && (!best || Math.abs(distance) < Math.abs(best.distance)) ? { line, distance } : best;
  }, null);

/** The guide drawn for a line, reaching across the window too. */
const guideOf = (axis: 'x' | 'y', line: Line, box: Box): Guide => {
  const from = axis === 'x' ? box.top : box.left, to = from + (axis === 'x' ? box.height : box.width);
  return { axis, at: line.at, from: Math.min(line.from, from), to: Math.max(line.to, to) };
};

/** A window carried: each axis sticks to the nearest line within SNAP (the screen's edges and middle, the other windows). */
export function snapMove(box: Box, others: readonly Box[], surface: Size): { box: Box; guides: Guide[] } {
  let placed = box;
  const guides: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const { starts, ends, centre } = lines(axis, others, surface);
    const start = axis === 'x' ? placed.left : placed.top, size = axis === 'x' ? placed.width : placed.height;
    const options = [nearest(start, starts), nearest(start + size, ends), nearest(start + size / 2, [centre])];
    const best = options.reduce((chosen, option) => (option && (!chosen || Math.abs(option.distance) < Math.abs(chosen.distance)) ? option : chosen), null);
    if (!best) continue;
    placed = axis === 'x' ? { ...placed, left: placed.left + best.distance } : { ...placed, top: placed.top + best.distance };
    guides.push(guideOf(axis, best.line, placed));
  }
  return { box: placed, guides };
}

/** A window pulled by `edge`: only the sides being pulled stick. */
export function snapResize(box: Box, edge: Edge, others: readonly Box[], surface: Size): { box: Box; guides: Guide[] } {
  let placed = box;
  const guides: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const { starts, ends } = lines(axis, others, surface);
    const [before, after] = axis === 'x' ? ['w', 'e'] : ['n', 's'];
    const start = axis === 'x' ? placed.left : placed.top, size = axis === 'x' ? placed.width : placed.height;
    if (edge.includes(before)) {
      const best = nearest(start, starts);
      if (best && size - best.distance >= (axis === 'x' ? MIN_WINDOW.width : MIN_WINDOW.height)) {
        placed = axis === 'x' ? { ...placed, left: start + best.distance, width: size - best.distance } : { ...placed, top: start + best.distance, height: size - best.distance };
        guides.push(guideOf(axis, best.line, placed));
      }
    }
    if (edge.includes(after)) {
      const best = nearest(start + size, ends);
      if (best && size + best.distance >= (axis === 'x' ? MIN_WINDOW.width : MIN_WINDOW.height)) {
        placed = axis === 'x' ? { ...placed, width: size + best.distance } : { ...placed, height: size + best.distance };
        guides.push(guideOf(axis, best.line, placed));
      }
    }
  }
  return { box: placed, guides };
}

/** The zone of the screen the pointer pushes against: a side is a half, a corner (a sixth of the side) a quarter, the top all of it. */
export function zoneAt(point: { x: number; y: number }, surface: Size): Zone | null {
  const { width, height } = surface;
  const top = point.y < height / 6, bottom = point.y > (height * 5) / 6, leftmost = point.x < width / 6, rightmost = point.x > (width * 5) / 6;
  if (point.x <= EDGE_ZONE) return top ? 'top-left' : bottom ? 'bottom-left' : 'left';
  if (point.x >= width - EDGE_ZONE) return top ? 'top-right' : bottom ? 'bottom-right' : 'right';
  if (point.y <= EDGE_ZONE) return leftmost ? 'top-left' : rightmost ? 'top-right' : 'full';
  if (point.y >= height - EDGE_ZONE) return leftmost ? 'bottom-left' : rightmost ? 'bottom-right' : null;
  return null;
}

export function zoneBox(zone: Zone, surface: Size): Box {
  const half = (surface.width - 3 * GAP) / 2, halfHeight = (surface.height - 3 * GAP) / 2;
  const full = { left: GAP, top: GAP, width: surface.width - 2 * GAP, height: surface.height - 2 * GAP };
  const right = GAP + half + GAP, lower = GAP + halfHeight + GAP;
  switch (zone) {
    case 'full': return full;
    case 'left': return { ...full, width: half };
    case 'right': return { ...full, left: right, width: half };
    case 'top-left': return { left: GAP, top: GAP, width: half, height: halfHeight };
    case 'top-right': return { left: right, top: GAP, width: half, height: halfHeight };
    case 'bottom-left': return { left: GAP, top: lower, width: half, height: halfHeight };
    case 'bottom-right': return { left: right, top: lower, width: half, height: halfHeight };
  }
}

/** Where a new window placed by hand opens: a step down and right of the last one, or back in the corner. */
export function cascade(last: Box | null, size: Size, surface: Size): Box {
  const corner = { left: GAP, top: GAP, ...size };
  if (!last) return corner;
  const next = { left: last.left + CASCADE_STEP, top: last.top + CASCADE_STEP, ...size };
  return next.left + size.width > surface.width - GAP || next.top + size.height > surface.height - GAP ? corner : next;
}

/**
 * The windows placed by hand back in the grid, keeping its shape: each one takes the free place nearest to it (the
 * closest pairs first); a window never placed keeps its own place.
 */
export function tidy(columns: Columns, boxes: Record<string, Box>, area: Size, tiling: Tiling, sizes: GridSizes | null): string[][] {
  const grid = gridBoxes(columns, sizes, area, tiling);
  const places = columns.flatMap((ids, column) => ids.map((id, row) => ({ id, column, row, box: grid[id] })));
  const next = columns.map((ids) => ids.map(() => ''));
  const taken = new Set<string>();
  for (const place of places) if (!boxes[place.id]) { next[place.column][place.row] = place.id; taken.add(place.id); }
  const centre = (box: Box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  const pairs = places.filter((window) => boxes[window.id]).flatMap((window) => places.filter((place) => !taken.has(place.id)).map((place) => {
    const from = centre(boxes[window.id]), to = centre(place.box);
    return { id: window.id, place, distance: Math.hypot(from.x - to.x, from.y - to.y) };
  })).sort((a, b) => a.distance - b.distance);
  const placed = new Set<string>();
  for (const { id, place } of pairs) {
    if (placed.has(id) || next[place.column][place.row]) continue;
    next[place.column][place.row] = id;
    placed.add(id);
  }
  return next;
}

/** The two ways the windows are laid out: over the rooms (the office and the break room share it), and in focus mode. */
export type Arrangement = 'room' | 'focus';
export type WindowMode = 'grid' | 'free';
/** The windows placed by hand: their boxes in fractions of the area they float in, and their order, the front one last. */
export interface FreeLayout { boxes: Record<string, Box>; order: string[] }
/** How the windows were arranged by hand, kept in this browser. */
export interface WindowsPreference {
  mode: Record<Arrangement, WindowMode>;
  free: Record<Arrangement, FreeLayout>;
  sizes: Record<Arrangement, GridSizes | null>;
  /** the width of the windows over the room, in fractions of the page's */
  stackWidth: number | null;
}

const ARRANGEMENTS = ['room', 'focus'] as const;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isFraction = (value: unknown): value is number => Number.isFinite(value);
/** shares of a whole: each above 0, adding up to 1 */
const isFractions = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length > 0 && value.every((share) => isFraction(share) && share > 0) && Math.abs(value.reduce((sum, share) => sum + share, 0) - 1) < 0.001;
const isBox = (value: unknown): value is Box => isRecord(value) && ['left', 'top', 'width', 'height'].every((key) => isFraction(value[key]));
const field = (value: unknown, key: string) => (isRecord(value) ? value[key] : undefined);

function readFree(raw: unknown): FreeLayout {
  const boxes: Record<string, Box> = {};
  for (const [id, box] of Object.entries(isRecord(field(raw, 'boxes')) ? (field(raw, 'boxes') as Record<string, unknown>) : {})) {
    if (isBox(box)) boxes[id] = { left: box.left, top: box.top, width: box.width, height: box.height };
  }
  const order = field(raw, 'order');
  return { boxes, order: Array.isArray(order) ? order.filter((id): id is string => typeof id === 'string' && id in boxes) : [] };
}

function readSizes(raw: unknown): GridSizes | null {
  const columns = field(raw, 'columns'), rows = field(raw, 'rows');
  if (!isFractions(columns) || !Array.isArray(rows)) return null;
  return { columns, rows: rows.map((column) => (isFractions(column) ? column : [])) };
}

/** What this browser kept, without whatever an older version or a broken value left there. */
export function sanitizeWindows(raw: unknown): WindowsPreference {
  const per = <T>(key: string, read: (value: unknown) => T) =>
    Object.fromEntries(ARRANGEMENTS.map((arrangement) => [arrangement, read(field(field(raw, key), arrangement))])) as Record<Arrangement, T>;
  const stackWidth = field(raw, 'stackWidth');
  return {
    mode: per('mode', (mode): WindowMode => (mode === 'free' ? 'free' : 'grid')),
    free: per('free', readFree),
    sizes: per('sizes', readSizes),
    stackWidth: isFraction(stackWidth) ? stackWidth : null,
  };
}

/** A session forgotten: it leaves the windows placed by hand. */
export function withoutWindow(free: Record<Arrangement, FreeLayout>, id: string): Record<Arrangement, FreeLayout> {
  const without = ({ boxes: { [id]: _gone, ...boxes }, order }: FreeLayout) => ({ boxes, order: order.filter((other) => other !== id) });
  return { room: without(free.room), focus: without(free.focus) };
}
