// The sessions open side by side, as in a tiling window manager. Over the room: columns of three from the right, each
// session keeping its column; closing one moves up only the ones under it, a column left empty goes. In focus mode (no
// room) the windows are read from left to right, the newest first: up to three columns from the left, each window a
// column of its own while one fits, then the first column splits, then the second, then the third; they all move along
// when one opens or closes. Pure functions.

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
 * With `spread` it comes first and the others move along.
 */
export function addTo(columns: Columns, id: string, max: number, tiling: Tiling = ROOM_TILING): string[][] | null {
  if (columns.some((column) => column.includes(id))) return copy(columns);
  if (tiling.spread) return layOut([id, ...columns.flat()], max, tiling);
  const index = columns.findIndex((column) => column.length < tiling.perColumn);
  if (index !== -1) return columns.map((column, at) => (at === index ? [...column, id] : [...column]));
  return columns.length < max ? [...copy(columns), [id]] : null;
}

export function removeFrom(columns: Columns, id: string, tiling: Tiling = ROOM_TILING): string[][] {
  if (tiling.spread) return layOut(columns.flat().filter((other) => other !== id), columns.length, tiling)!;
  return columns.map((column) => column.filter((other) => other !== id)).filter((column) => column.length > 0);
}

/** `next`, not open yet, takes the place of `previous`, in its column and row (with `spread`, first). */
export function replaceIn(columns: Columns, previous: string, next: string, tiling: Tiling = ROOM_TILING): string[][] {
  if (tiling.spread) return layOut([next, ...columns.flat().filter((id) => id !== previous)], columns.length, tiling)!;
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
 * row from the top and how many rows it takes, and how many rows the grid has.
 */
export function placement(columns: Columns, tiling: Tiling = ROOM_TILING): { rows: number; slots: Slot[] } {
  const tallest = Math.max(...columns.map((column) => column.length), 1);
  // over the room, with two columns every window is a third, so a new one opens small and nothing jumps; in focus mode a
  // window alone in its column takes its whole height
  const rows = !tiling.spread && columns.length > 1 ? tiling.perColumn : tallest;
  const fromRight = (column: number) => (tiling.side === 'right' ? column : columns.length - 1 - column);
  return {
    rows,
    slots: columns.flatMap((ids, column) => ids.map((id, row) => ({ id, column: fromRight(column), row, span: tiling.spread && ids.length === 1 ? rows : 1 }))),
  };
}
