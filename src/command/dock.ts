// What the stack and the mods' windows share. The mods stay rendered in ModWindows, in one DOM order (an iframe moved in
// the DOM loads again): the stack lays out a docked mod's slot and says here where it is on the page, and lends its drag
// to the mods' title bars, so a mod is carried, docked and undocked like a session's window.
import type { PointerEvent as ReactPointerEvent } from 'react';
import { create } from 'zustand';
import type { Box } from '../state/room-frame.ts';

interface DockState {
  /** the box of each docked mod's slot, in pixels of the page (the carried one following the pointer) */
  slots: Record<string, Box>;
  /** the box of a floating mod carried by the stack's drag, in pixels of the page */
  carried: { id: string; box: Box } | null;
  /** where each floating mod's window is on the page, for the stack to carry it from there */
  floating: Record<string, Box>;
  /** the stack's drag, for a window's id (`mod:<id>` for a mod); null while the stack cannot move windows */
  start: ((id: string, event: ReactPointerEvent) => void) | null;
  /** a session's window zoomed over the grid: the docked mods are under it */
  covered: boolean;
  /** counts the times the stack saved where a mod floats (mod-placement), for its window to read it again */
  placed: number;
}

export const useDock = create<DockState>(() => ({ slots: {}, carried: null, floating: {}, start: null, covered: false, placed: 0 }));

const sameBoxes = (a: Record<string, Box>, b: Record<string, Box>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => {
    const one = a[key], other = b[key];
    return other && one.left === other.left && one.top === other.top && one.width === other.width && one.height === other.height;
  });
};

/** The docked mods' slots as the stack laid them out; nothing changes (no drawing again) when they did not move. */
export function publishSlots(slots: Record<string, Box>) {
  if (!sameBoxes(useDock.getState().slots, slots)) useDock.setState({ slots });
}

export function noteFloating(id: string, box: Box | null) {
  const { [id]: previous, ...others } = useDock.getState().floating;
  if (!box) { if (previous) useDock.setState({ floating: others }); return; }
  if (!previous || !sameBoxes({ [id]: previous }, { [id]: box })) useDock.setState({ floating: { ...others, [id]: box } });
}

/** The stack saved where a mod floats: its window reads it again. */
export const noteModPlaced = () => useDock.setState((state) => ({ placed: state.placed + 1 }));
