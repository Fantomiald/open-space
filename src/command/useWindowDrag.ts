// A window taken by its title bar (or anywhere with Alt) and carried with the pointer. This hook follows the pointer and
// says where it is; the stack decides what that means (a place in the grid, or a spot of its own) when it is let go.
import { createContext, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { markArranged, startsDrag, swallowAltRelease } from '../lib/drag.ts';
import type { Box } from '../state/room-frame.ts';

type Point = { x: number; y: number };

/**
 * `grab`: where the window was taken, from its top left corner; `pointer`: where the pointer is, in the stack; `loose`:
 * Cmd (Ctrl elsewhere) held, the magnets off.
 */
export interface WindowDrag { id: string; grab: Point; pointer: Point; loose: boolean }

/** What a window's title bar calls to be carried (null where windows cannot be moved). */
export const WindowDragContext = createContext<((id: string, event: ReactPointerEvent) => void) | null>(null);

/** In the title bar, these keep their click. */
export const INTERACTIVE = 'button, input, textarea, select, form, a, [role="menu"], [role="menuitem"]';

export function useWindowDrag(stack: RefObject<HTMLElement | null>, boxOf: (id: string) => Box | undefined, openIds: readonly string[], onDrop: (drag: WindowDrag) => void) {
  const [drag, setDrag] = useState<WindowDrag | null>(null);
  const latest = useRef({ boxOf, onDrop });
  latest.current = { boxOf, onDrop };
  const stop = useRef<(() => void) | null>(null);

  // stable, so the windows reading it from the context are not drawn again on each move
  const start = useCallback((id: string, event: ReactPointerEvent) => {
    const box = latest.current.boxOf(id);
    if (event.button !== 0 || !box || !stack.current) return;
    if (event.altKey) event.preventDefault();
    stop.current?.();
    const press = { x: event.clientX, y: event.clientY };
    const inStack = (x: number, y: number) => {
      const area = stack.current!.getBoundingClientRect();
      return { x: x - area.left, y: y - area.top };
    };
    const at = inStack(press.x, press.y);
    const grab = { x: at.x - box.left, y: at.y - box.top };
    let current: WindowDrag | null = null;
    const move = (pointer: PointerEvent) => {
      if (!current && !startsDrag(press, { x: pointer.clientX, y: pointer.clientY })) return;
      if (!current) window.getSelection()?.removeAllRanges();
      current = { id, grab, pointer: inStack(pointer.clientX, pointer.clientY), loose: pointer.metaKey || pointer.ctrlKey };
      setDrag(current);
    };
    const end = () => {
      const dropped = current;
      finish();
      if (!dropped) return;
      if (event.altKey) { swallowAltRelease(); markArranged(); }
      latest.current.onDrop(dropped);
      // the click that ends a drag is not a click on what is under the pointer
      const swallow = (click: MouseEvent) => click.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    };
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== 'Escape') return;
      key.preventDefault();
      key.stopImmediatePropagation();
      finish();
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('keydown', onKey, { capture: true });
      stop.current = null;
      current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('keydown', onKey, { capture: true });
    stop.current = finish;
  }, [stack]);

  // a session closed or put away while it was carried: the drag ends there
  useEffect(() => {
    if (drag && !openIds.includes(drag.id)) stop.current?.();
  }, [drag, openIds]);
  useEffect(() => () => stop.current?.(), []);

  return { drag, start, cancel: () => stop.current?.() };
}
