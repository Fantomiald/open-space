// A dialog carried by what is marked data-carry in it and resized by its edges and corners (Modal's `movable`), kept
// where the user left it from one opening to the next. Until then the CSS centers it at its own size.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { startsDrag } from '../lib/drag.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { placePanel, resizePanel } from '../state/panel.ts';
import type { Box } from '../state/room-frame.ts';
import type { Edge } from '../state/windows.ts';
import { INTERACTIVE } from './useWindowDrag.ts';

const screen = () => ({ width: window.innerWidth, height: window.innerHeight });
/** a narrow window shows the dialog over all of it (components.css, max-width: 60rem): it does not move there */
const narrow = () => window.matchMedia('(max-width: 60rem)').matches;
/** `key`: the preference it is kept under, or null for a dialog that does not move. */
export function usePanelFrame(key: string | null, dialog: RefObject<HTMLDialogElement | null>) {
  // the box the user chose, kept as is: a window made smaller then larger again gives it back
  const chosen = useRef<Box | null>(key ? readPreference<Box | null>(key, null) : null);
  const [box, setBox] = useState<Box | null>(() => chosen.current && placePanel(chosen.current, screen()));
  const [moving, setMoving] = useState(false);
  const pulled = useRef<{ start: Box; x: number; y: number; edge: Edge | null; started: boolean } | null>(null);

  // another size of window: it stays whole within it
  useEffect(() => {
    if (!key) return;
    const keep = () => setBox(chosen.current && placePanel(chosen.current, screen()));
    window.addEventListener('resize', keep);
    return () => window.removeEventListener('resize', keep);
  }, [key]);

  const grab = (edge: Edge | null, event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (!key || !dialog.current || event.button !== 0 || narrow()) return;
    if (!edge && (!target.closest('[data-carry]') || target.closest(INTERACTIVE))) return;
    const { left, top, width, height } = dialog.current.getBoundingClientRect();
    pulled.current = { start: box ?? { left, top, width, height }, x: event.clientX, y: event.clientY, edge, started: false };
    // an edge is pulled at once: a quick first move off the dialog keeps it (its moves reach the dialog from the handle)
    if (edge) event.currentTarget.setPointerCapture(event.pointerId);
  };
  const drag = (event: ReactPointerEvent<HTMLElement>) => {
    const from = pulled.current;
    if (!from) return;
    if (!from.started) {
      if (!from.edge && !startsDrag({ x: from.x, y: from.y }, { x: event.clientX, y: event.clientY })) return;
      from.started = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      window.getSelection()?.removeAllRanges();
      setMoving(true);
    }
    const dx = event.clientX - from.x, dy = event.clientY - from.y;
    chosen.current = from.edge ? resizePanel(from.start, from.edge, dx, dy, screen()) : placePanel({ ...from.start, left: from.start.left + dx, top: from.start.top + dy }, screen());
    setBox(chosen.current);
  };
  const drop = () => {
    const from = pulled.current;
    pulled.current = null;
    if (!from?.started || !key) return;
    setMoving(false);
    writePreference(key, chosen.current);
    // the click that ends a drag is not a click on what is under the pointer (the backdrop would close the dialog)
    const swallow = (click: MouseEvent) => click.stopPropagation();
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
  };

  return { box, moving, grab, drag, drop };
}
