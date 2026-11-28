import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Box } from '../state/room-frame.ts';
import { MIN_WINDOW, resizeBox, snapResize, type Edge, type Guide, type Size } from '../state/windows.ts';

/**
 * What a side or a corner pulled to resize needs: the box it starts from, no smaller than `min`; `fit` keeps it where it
 * may be; it sticks to the edges of `others` and of `surface` unless Cmd (Ctrl elsewhere) is held.
 */
export interface Pull {
  start: Box;
  edge: Edge;
  min?: Size;
  fit: (box: Box) => Box;
  others: readonly Box[];
  surface: Size;
  /** the box as pulled now, with the guides of the edges it sticks to */
  onMove: (pulled: { box: Box; guides: Guide[] }) => void;
  /** let go: the box it ends with, null when it did not change */
  onEnd: (box: Box | null) => void;
}

/** A window (or an element of the page placed by hand) pulled by one of its handles (FreeHandles.tsx), until let go. */
export function pullBox(event: ReactPointerEvent<HTMLElement>, { start, edge, min = MIN_WINDOW, fit, others, surface, onMove, onEnd }: Pull) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget, from = { x: event.clientX, y: event.clientY };
  handle.setPointerCapture(event.pointerId);
  let latest = start;
  const move = (pointer: PointerEvent) => {
    const pulled = fit(resizeBox(start, edge, pointer.clientX - from.x, pointer.clientY - from.y, min));
    const result = pointer.metaKey || pointer.ctrlKey ? { box: pulled, guides: [] } : snapResize(pulled, edge, others, surface, min);
    latest = result.box;
    onMove(result);
  };
  const end = () => {
    handle.removeEventListener('lostpointercapture', end);
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    onEnd(latest === start ? null : latest);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  // the window closed while pulled: its handle is gone with the pointer
  handle.addEventListener('lostpointercapture', end, { once: true });
}
