// The sessions open side by side, as in a tiling window manager. Over the room: columns of three from the right, each
// session keeping its column; closing one moves up only the ones under it, a column left empty goes. In focus mode (no
// room) the newest opens in the top left corner: up to three columns from the left, each window a column of its own
// while one fits, then each column hands its last window to the next; a column left empty is filled again from the one
// before. In both, the windows can be moved by hand into any column, or into a column of their own. Pure functions.

import type { Box } from './room-frame.ts';

const REM = 16;
const GUTTER = REM;

/** How the windows are laid out: over the room, or in focus mode beside the session list. */
export interface Tiling {
  /** more in one column would leave each one too short to read its thread */
  perColumn: number;
  /** past six the room is gone (focus mode: the window is full): whoever needs more is better off in a terminal */
  maxColumns: number;
  /** a column shrinks to this before another is refused */
  minColumn: number;
  /** what the columns leave clear on the left: the status card over the room, the session list in focus mode */
  aside: number;
  /** the windows fill the whole area, the newest first (layOut), rather than each keeping its column */
  spread: boolean;
  /** where the first column sits */
  side: 'right' | 'left';
}

export const ROOM_TILING: Tiling = { perColumn: 3, maxColumns: 2, minColumn: 24 * REM, aside: 20 * REM, spread: false, side: 'right' };
export const FOCUS_TILING: Tiling = { perColumn: 2, maxColumns: 3, minColumn: 20 * REM, aside: 18 * REM, spread: true, side: 'left' };

export type Columns = readonly (readonly string[])[];

/** How many columns fit in a window this wide, leaving the status card (or the session list) clear. */
export function maxColumns(width: number, tiling: Tiling = ROOM_TILING): number {
  const fit = Math.floor((width - tiling.aside - 2 * GUTTER) / (tiling.minColumn + GUTTER));
  return Math.min(Math.max(fit, 1), tiling.maxColumns);
}

const copy = (columns: Columns) => columns.map((column) => [...column]);

export const isFull = (columns: Columns, max: number, tiling: Tiling = ROOM_TILING) =>
  columns.length >= max && columns.every((column) => column.length >= tiling.perColumn);

/**
 * Focus mode's windows, the newest first: a column each while one fits, then the first columns take a second one; null
 * when there is no room left.
 */
export function layOut(ids: readonly string[], max: number, tiling: Tiling): string[][] | null {
  if (ids.length > max * tiling.perColumn) return null;
  const count = Math.min(ids.length, max);
  const shared = Math.floor(ids.length / count), taller = ids.length % count;
  let start = 0;
  return Array.from({ length: count }, (_, column) => {
    const size = shared + (column < taller ? 1 : 0);
    start += size;
    return ids.slice(start - size, start);
  });
}

/**
 * A session joins the first column with room (the first one first), else a new column; null when there is no room left.
 * With `spread` it opens in the top left corner: in a column of its own while one fits, else each column hands its last
 * window to the next.
 */
export function addTo(columns: Columns, id: string, max: number, tiling: Tiling = ROOM_TILING): string[][] | null {
  if (columns.some((column) => column.includes(id))) return copy(columns);
  if (tiling.spread) {
    if (columns.length < max) return [[id], ...copy(columns)];
    if (isFull(columns, max, tiling)) return null;
    const next = copy(columns);
    let carried = id;
    for (const column of next) {
      column.unshift(carried);
      if (column.length <= tiling.perColumn) break;
      carried = column.pop()!;
    }
    return next;
  }
  const index = columns.findIndex((column) => column.length < tiling.perColumn);
  if (index !== -1) return columns.map((column, at) => (at === index ? [...column, id] : [...column]));
  return columns.length < max ? [...copy(columns), [id]] : null;
}

export function removeFrom(columns: Columns, id: string, tiling: Tiling = ROOM_TILING): string[][] {
  const next = columns.map((column) => column.filter((other) => other !== id)).filter((column) => column.length > 0);
  // in focus mode a column that goes is made again from the last one holding two, so the windows stay spread out
  const shared = tiling.spread && next.length < columns.length ? next.findLastIndex((column) => column.length > 1) : -1;
  if (shared !== -1) next.splice(shared + 1, 0, [next[shared].pop()!]);
  return next;
}

/** `next`, not open yet, takes the place of `previous`, in its column and row. */
export function replaceIn(columns: Columns, previous: string, next: string): string[][] {
  return columns.map((column) => column.map((id) => (id === previous ? next : id)));
}

/** After the window was resized: the columns that no longer fit close (with `spread`, the oldest windows, and the rest spread out again). */
export function fitColumns(columns: Columns, max: number, tiling: Tiling = ROOM_TILING): string[][] {
  if (tiling.spread) return layOut(columns.flat().slice(0, max * tiling.perColumn), max, tiling)!;
  return copy(columns.slice(0, max));
}

/**
 * The open sessions laid out again for the other tiling; the ones with no room left go. The room's order is the order
 * they were opened in, focus mode's the other way round.
 */
export function retile(columns: Columns, max: number, tiling: Tiling = ROOM_TILING): string[][] {
  const ids = columns.flat().reverse();
  if (tiling.spread) return layOut(ids.slice(0, max * tiling.perColumn), max, tiling)!;
  return ids.reduce<string[][]>((placed, id) => addTo(placed, id, max, tiling) ?? placed, []);
}

/** The session that takes the keyboard when `closed` leaves: the one under it, else above it, else in the other column. */
export function nextFocus(columns: Columns, closed: string): string | null {
  const column = columns.find((ids) => ids.includes(closed));
  const index = column?.indexOf(closed) ?? -1;
  return column?.[index + 1] ?? column?.[index - 1] ?? columns.flat().find((id) => id !== closed) ?? null;
}

export interface Slot { id: string; column: number; row: number; span: number }

/**
 * Where each session sits: its column from the right (the grid's own order, whatever side the first column is on), its
 * row from the top and how many rows it takes, and how many rows the grid has. Each column shares its whole height
 * between its windows (windows.ts); the rows only place them before the stack is measured.
 */
export function placement(columns: Columns, tiling: Tiling = ROOM_TILING): { rows: number; slots: Slot[] } {
  const rows = Math.max(...columns.map((column) => column.length), 1);
  const fromRight = (column: number) => (tiling.side === 'right' ? column : columns.length - 1 - column);
  return {
    rows,
    slots: columns.flatMap((ids, column) => ids.map((id, row) => ({ id, column: fromRight(column), row, span: ids.length === 1 ? rows : 1 }))),
  };
}

/**
 * Where a dragged window goes: a column in the order of `columns` (`columns.length` for a new one), and its row there;
 * with `side`, a column of its own before or after that one (in the order of `columns`).
 */
export interface DropSlot { column: number; row: number; side?: 'before' | 'after' }

/**
 * `id` moved by hand. It joins the column it was dropped on, trading places with the window there when that column is
 * full; dropped on the side of a column, it takes a column of its own there, while the columns fit (else it joins that
 * column as if dropped on it).
 */
export function moveIn(columns: Columns, id: string, to: DropSlot, max: number, tiling: Tiling = ROOM_TILING): string[][] {
  const from = columns.findIndex((column) => column.includes(id));
  if (from === -1) return copy(columns);
  if (to.side) {
    const apart = columns.map((column) => column.filter((other) => other !== id));
    apart.splice(to.column + (to.side === 'after' ? 1 : 0), 0, [id]);
    const placed = apart.filter((column) => column.length > 0);
    if (placed.length <= max) return placed;
  }
  const next = copy(columns);
  if (to.column >= columns.length) {
    if (columns.length >= max || columns[from].length === 1) return next;
    next[from] = next[from].filter((other) => other !== id);
    return [...next, [id]];
  }
  if (to.column === from) {
    const column = next[from], index = column.indexOf(id);
    column.splice(index, 1);
    column.splice(to.row > index ? to.row - 1 : to.row, 0, id);
    return next;
  }
  const target = next[to.column];
  if (target.length >= tiling.perColumn) {
    const at = Math.min(to.row, target.length - 1), other = target[at];
    target[at] = id;
    next[from] = next[from].map((each) => (each === id ? other : each));
    return next;
  }
  next[from] = next[from].filter((other) => other !== id);
  target.splice(Math.min(to.row, target.length), 0, id);
  return next.filter((column) => column.length > 0);
}

/** how close to a column's side the pointer comes for the window carried to take a column of its own there */
export const SIDE_ZONE = 64;

/**
 * The slot under the pointer: before a window over its upper half, after it over its lower half; near the side of a
 * column, a column of its own there; beyond the last column, a new one. Null elsewhere (between columns, or on the side
 * they never grow).
 */
export function dropAt(slots: readonly { id: string; column: number; row: number; box: Box }[], point: { x: number; y: number }, columns: Columns, tiling: Tiling = ROOM_TILING): DropSlot | null {
  if (!slots.length) return null;
  const after = (box: Box) => (point.y > box.top + box.height / 2 ? 1 : 0);
  const across = slots.filter(({ box }) => point.x >= box.left && point.x <= box.left + box.width);
  if (across.length) {
    const distance = ({ box }: { box: Box }) => Math.abs(point.y - (box.top + box.height / 2));
    const nearest = across.reduce((best, slot) => (distance(slot) < distance(best) ? slot : best));
    const slot = { column: nearest.column, row: nearest.row + after(nearest.box) };
    const zone = Math.min(SIDE_ZONE, nearest.box.width / 5);
    const left = point.x < nearest.box.left + zone, right = point.x > nearest.box.left + nearest.box.width - zone;
    if (!left && !right) return slot;
    // the columns run from the left in focus mode, from the right over the room
    return { ...slot, side: left === (tiling.side === 'left') ? 'before' : 'after' };
  }
  const left = Math.min(...slots.map(({ box }) => box.left)), right = Math.max(...slots.map(({ box }) => box.left + box.width));
  const beyond = tiling.side === 'right' ? point.x < left : point.x > right;
  return beyond && !tiling.spread ? { column: columns.length, row: 0 } : null;
}
