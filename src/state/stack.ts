// The sessions open side by side over the room, as in a tiling window manager: columns of three from the right, each
// session keeping its column. Closing one moves up only the ones under it; a column left empty goes. Pure functions.

/** More in one column would leave each one too short to read its thread. */
export const PER_COLUMN = 3;
/** Past six the room is gone: whoever needs more is better off in a terminal. */
const MAX_COLUMNS = 2;

const REM = 16;
/** narrower than a lone session's 31rem: with two columns each shrinks to this before the second is refused */
const MIN_COLUMN = 24 * REM;
const GUTTER = REM;
/** the status card pinned to the bottom left, which the columns never cover */
const STATUS_WIDTH = 20 * REM;

export type Columns = readonly (readonly string[])[];

/** How many columns fit in a window this wide, leaving the status card clear. */
export function maxColumns(width: number): number {
  const fit = Math.floor((width - STATUS_WIDTH - 2 * GUTTER) / (MIN_COLUMN + GUTTER));
  return Math.min(Math.max(fit, 1), MAX_COLUMNS);
}

const copy = (columns: Columns) => columns.map((column) => [...column]);

export const isFull = (columns: Columns, max: number) => columns.length >= max && columns.every((column) => column.length >= PER_COLUMN);

/** A session joins the first column with room (the right one first), else a new column; null when there is no room left. */
export function addTo(columns: Columns, id: string, max: number): string[][] | null {
  if (columns.some((column) => column.includes(id))) return copy(columns);
  const index = columns.findIndex((column) => column.length < PER_COLUMN);
  if (index !== -1) return columns.map((column, at) => (at === index ? [...column, id] : [...column]));
  return columns.length < max ? [...copy(columns), [id]] : null;
}

export function removeFrom(columns: Columns, id: string): string[][] {
  return columns.map((column) => column.filter((other) => other !== id)).filter((column) => column.length > 0);
}

/** `next`, not open yet, takes the place of `previous`, in its column and row. */
export const replaceIn = (columns: Columns, previous: string, next: string): string[][] =>
  columns.map((column) => column.map((id) => (id === previous ? next : id)));

/** After the window shrank: the columns that no longer fit close. */
export const fitColumns = (columns: Columns, max: number): string[][] => copy(columns.slice(0, max));

/** The session that takes the keyboard when `closed` leaves: the one under it, else above it, else in the other column. */
export function nextFocus(columns: Columns, closed: string): string | null {
  const column = columns.find((ids) => ids.includes(closed));
  const index = column?.indexOf(closed) ?? -1;
  return column?.[index + 1] ?? column?.[index - 1] ?? columns.flat().find((id) => id !== closed) ?? null;
}

/** Where each session sits: its column from the right, its row from the top, and how many rows the grid has. */
export function placement(columns: Columns): { rows: number; slots: { id: string; column: number; row: number }[] } {
  // one column shares its height; with two, every window is a third, so a new one opens small and nothing jumps
  const rows = columns.length > 1 ? PER_COLUMN : Math.max(columns[0]?.length ?? 1, 1);
  return { rows, slots: columns.flatMap((ids, column) => ids.map((id, row) => ({ id, column, row }))) };
}
