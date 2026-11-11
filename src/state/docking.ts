// Each window, a session's or a mod's, is either docked (a slot in the grid of the current arrangement, see stack.ts) or
// floating (a box of its own over the rest, see windows.ts). The grid holds the sessions' ids and `mod:<id>` for the
// mods docked in it; the floating sessions are the boxes of the arrangement's FreeLayout. Pure functions.
import type { Box } from './room-frame.ts';
import { addTo, dropAt, moveIn, removeFrom, retile, type Columns, type DropSlot, type Tiling } from './stack.ts';
import type { FreeLayout } from './windows.ts';

const MOD_SLOT = 'mod:';
/** how far from the top or the bottom of a docked window, in focus mode, a floating one is dropped to dock there */
export const DOCK_BAND = 56;

export const modSlot = (id: string) => `${MOD_SLOT}${id}`;
/** The mod docked in this slot, null for a session. */
export const modOfSlot = (slot: string) => (slot.startsWith(MOD_SLOT) ? slot.slice(MOD_SLOT.length) : null);
export const sessionsIn = (columns: Columns) => columns.flat().filter((id) => modOfSlot(id) === null);
export const modsIn = (columns: Columns) => columns.flat().map(modOfSlot).filter((id): id is string => id !== null);

const copy = (columns: Columns) => columns.map((column) => [...column]);
const floatingIds = (free: FreeLayout) => [...free.order.filter((id) => free.boxes[id]), ...Object.keys(free.boxes).filter((id) => !free.order.includes(id))];

/** The sessions open in an arrangement: the docked ones in the grid's order, then the floating ones from back to front. */
export function openSessions(columns: Columns, free: FreeLayout): string[] {
  const docked = sessionsIn(columns);
  return [...docked, ...floatingIds(free).filter((id) => !docked.includes(id))];
}

/**
 * `id` docked at `to` (the first place with room when not told): a column of its own on the side of a column while the
 * columns fit, else the column it was dropped on while it has room, else the first place with room. Already docked, it
 * moves there. Null when the grid is full.
 */
export function dock(columns: Columns, id: string, to: DropSlot | null, max: number, tiling: Tiling): string[][] | null {
  if (columns.some((column) => column.includes(id))) return to ? moveIn(columns, id, to, max, tiling) : copy(columns);
  if (!to) return addTo(columns, id, max, tiling);
  if (!columns.length) return [[id]];
  const next = copy(columns);
  if (to.side && columns.length < max) {
    next.splice(to.column + (to.side === 'after' ? 1 : 0), 0, [id]);
    return next;
  }
  if (to.column >= columns.length) return columns.length < max ? [...next, [id]] : addTo(columns, id, max, tiling);
  const target = next[to.column];
  if (target.length >= tiling.perColumn) return addTo(columns, id, max, tiling);
  target.splice(Math.min(to.row, target.length), 0, id);
  return next;
}

/** `id` floating at `box` (in fractions of the area), in front of the others, out of the grid. */
export function float(columns: Columns, free: FreeLayout, id: string, box: Box, tiling: Tiling): { columns: string[][]; free: FreeLayout } {
  return {
    columns: columns.some((column) => column.includes(id)) ? removeFrom(columns, id, tiling) : copy(columns),
    free: { boxes: { ...free.boxes, [id]: box }, order: [...free.order.filter((other) => other !== id), id] },
  };
}

/** `id` no longer floating. */
export function unfloat(free: FreeLayout, id: string): FreeLayout {
  const { [id]: _gone, ...boxes } = free.boxes;
  return { boxes, order: free.order.filter((other) => other !== id) };
}

/**
 * Every floating window docked (the sessions from back to front, then `mods`, the mods' slots), each in the first place
 * with room; the ones that find none keep floating.
 */
export function tidyAll(columns: Columns, free: FreeLayout, mods: readonly string[], max: number, tiling: Tiling): { columns: string[][]; free: FreeLayout } {
  let next = copy(columns), left = free;
  for (const id of [...floatingIds(free), ...mods]) {
    const docked = dock(next, id, null, max, tiling);
    if (!docked) continue;
    next = docked;
    left = unfloat(left, id);
  }
  return { columns: next, free: left };
}

/**
 * The grid of the other arrangement: the windows docked here and the ones floating here that do not float there, laid
 * out again for it (stack.ts retile); the ones floating there stay out of its grid.
 */
export function switchArrangement(columns: Columns, here: FreeLayout, there: FreeLayout, max: number, tiling: Tiling): string[][] {
  const floatingThere = new Set(Object.keys(there.boxes));
  const landing = floatingIds(here).filter((id) => !floatingThere.has(id));
  const docked = [...columns.map((column) => column.filter((id) => !floatingThere.has(id))), landing].filter((column) => column.length > 0);
  return retile(docked, max, tiling);
}

/** The grid of only its mods: the sessions closed, the mods docked where they were. */
export const modsOnly = (columns: Columns) => columns.map((column) => column.filter((id) => modOfSlot(id) !== null)).filter((column) => column.length > 0);

type Placed = { id: string; column: number; row: number; box: Box };

/**
 * Where a window carried in focus mode docks, where the grid fills the whole area: only over the top or bottom band of a
 * docked window (before or after it) or the side of a column (a column of its own); null elsewhere, where it floats.
 */
export function dockAt(slots: readonly Placed[], point: { x: number; y: number }, columns: Columns, tiling: Tiling): DropSlot | null {
  const slot = dropAt(slots, point, columns, tiling);
  if (!slot || slot.side) return slot;
  const under = slots.find(({ box }) => point.x >= box.left && point.x <= box.left + box.width && point.y >= box.top && point.y <= box.top + box.height);
  if (!under) return null;
  const band = Math.min(DOCK_BAND, under.box.height / 4);
  if (point.y <= under.box.top + band) return { column: under.column, row: under.row };
  if (point.y >= under.box.top + under.box.height - band) return { column: under.column, row: under.row + 1 };
  return null;
}

/** how far from the grid, over the room, a docked window is let go to float */
export const FLOAT_AWAY = 48;

/** Whether the point is in `box`, grown by `margin` on every side. */
export const within = (box: Box, point: { x: number; y: number }, margin = 0) =>
  point.x >= box.left - margin && point.x <= box.left + box.width + margin && point.y >= box.top - margin && point.y <= box.top + box.height + margin;
