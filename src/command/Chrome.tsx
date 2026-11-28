// The elements of the page moved by hand like a window (state/chrome.ts): the sessions' panel, the status card, the Alt
// tip, the header's pills (the rooms and projects, the radio, the tools). Alt + drag takes any of them (the panel also by its
// header); they stick to the edges near them as windows do, and the panel let go near the left edge docks there again.
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { create } from 'zustand';
import { canArrange, WIDE_SCREEN } from '../lib/drag.ts';
import { useMediaQuery } from '../lib/phone.ts';
import { carryChrome, CHROME_IDS, dockZone, docksPanel, keepOnPage, MIN_CHROME, PANEL_WIDTHS, panelFloats, panelWidthOf, trimToPage, type ChromeId } from '../state/chrome.ts';
import type { Box } from '../state/room-frame.ts';
import { chromeSlot, depthOf } from '../state/docking.ts';
import { arrangementOf, dockedPanelWidth, useSessions } from '../state/sessions.ts';
import type { Edge, Guide, Size } from '../state/windows.ts';
import { boxVariables } from './boxes.ts';
import { Guides } from './Guides.tsx';
import { pullBox } from './pull.ts';
import { INTERACTIVE, useWindowDrag, type WindowDrag } from './useWindowDrag.ts';

/** An element carried or pulled now: where it shows until let go, the lines it sticks to, the dock it would take. */
interface Carried { id: ChromeId; box: Box; guides: Guide[]; zone: Box | null }
const useCarried = create<{ carried: Carried | null }>(() => ({ carried: null }));

// the page's size, the same object while it does not change
let page: Size = { width: 0, height: 0 };
const pageSize = () => {
  if (page.width !== window.innerWidth || page.height !== window.innerHeight) page = { width: window.innerWidth, height: window.innerHeight };
  return page;
};
const onResize = (changed: () => void) => {
  window.addEventListener('resize', changed);
  return () => window.removeEventListener('resize', changed);
};

const elementOf = (id: ChromeId) => document.querySelector<HTMLElement>(`[data-chrome="${id}"]`);

/** Where an element is on the page; a group laid out by its parent (display: contents) is where its children are. */
function rectOf(element: Element | null): Box | null {
  if (!element) return null;
  const rects = (getComputedStyle(element).display === 'contents' ? [...element.children] : [element]).map((child) => child.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.left)), top = Math.min(...rects.map((rect) => rect.top));
  return { left, top, width: Math.max(...rects.map((rect) => rect.right)) - left, height: Math.max(...rects.map((rect) => rect.bottom)) - top };
}

/** What an element carried sticks to: the other elements, and the windows. */
const othersOf = (id: ChromeId): Box[] => [
  ...CHROME_IDS.filter((other) => other !== id).map((other) => rectOf(elementOf(other))),
  ...[...document.querySelectorAll('.cp-stack__slot')].map(rectOf),
].filter((box): box is Box => box !== null);

/** An element let go where it now stays, in front of the floating windows. */
function place(id: ChromeId, box: Box) {
  const s = useSessions.getState();
  // folded down to the faces, the panel keeps the width it had unfolded (at least MIN_CHROME's, state/chrome.ts)
  const unfolded = id === 'panel' && s.panelNarrow ? s.chrome.places.panel : undefined;
  s.placeChrome(id, unfolded ? { ...box, width: unfolded.width } : box);
  s.raiseWindow(chromeSlot(id));
}

/**
 * What an element movable by hand spreads on its root: `data-chrome`, which the drag looks for, and once placed (or
 * while carried), where (`data-placed`, components.css), kept wholly on the page as it is now. A screen too narrow to
 * arrange anything keeps the CSS layout.
 */
export function useChromePlace(id: ChromeId, movable = true) {
  const stored = useSessions((s) => s.chrome.places[id]);
  const carried = useCarried((s) => (s.carried?.id === id ? s.carried.box : null));
  const size = useSyncExternalStore(onResize, pageSize);
  const wide = useMediaQuery(WIDE_SCREEN);
  // placed, it takes its depth in the floating windows' front order (docking.ts)
  const depth = useSessions((s) => depthOf(s.free[arrangementOf(s.view)].order, chromeSlot(id)));
  if (!movable) return {};
  const box = wide ? (carried ?? (stored ? keepOnPage(stored, size) : null)) : null;
  return { 'data-chrome': id, 'data-placed': box ? 'true' : undefined, style: box ? ({ ...boxVariables(box), '--z': depth } as CSSProperties) : undefined };
}

/**
 * One of an element's sides or corners pulled to resize it, as a floating window's. The docked panel only widens: the
 * page beside it follows (--panel-width on the app) until let go.
 */
export function pullChrome(id: ChromeId, edge: Edge, event: ReactPointerEvent<HTMLElement>) {
  const element = event.currentTarget.closest<HTMLElement>('[data-chrome]'), start = rectOf(element);
  if (!element || !start || !canArrange()) return;
  const surface = pageSize();
  if (id === 'panel' && !panelFloats(useSessions.getState().chrome)) {
    const app = element.closest<HTMLElement>('.cp-app');
    element.dataset.pulling = 'true';
    pullBox(event, {
      start, edge, min: { width: PANEL_WIDTHS.min, height: start.height }, fit: (box) => ({ ...start, width: panelWidthOf(box.width) }), others: [], surface,
      onMove: ({ box }) => app?.style.setProperty('--panel-width', `${box.width}px`),
      onEnd: (box) => {
        delete element.dataset.pulling;
        if (box) useSessions.getState().resizePanel(box.width);
      },
    });
    return;
  }
  pullBox(event, {
    start, edge, min: MIN_CHROME, fit: (box) => trimToPage(box, surface), others: othersOf(id), surface,
    onMove: ({ box, guides }) => useCarried.setState({ carried: { id, box, guides, zone: null } }),
    onEnd: (box) => {
      useCarried.setState({ carried: null });
      if (box) place(id, box);
    },
  });
}

/** Takes the elements of the page with Alt (the panel by its header too), and draws the lines they stick to. */
export function ChromeArranger() {
  const root = useRef<HTMLElement>(document.documentElement);
  // the box the element had when taken, and what it may stick to, measured once
  const taken = useRef<{ box: Box; others: Box[] } | null>(null);
  const carriedAt = (drag: WindowDrag): Carried | null => {
    if (!taken.current) return null;
    const id = drag.id as ChromeId, surface = pageSize();
    const moved = { ...taken.current.box, left: drag.pointer.x - drag.grab.x, top: drag.pointer.y - drag.grab.y };
    const { box, guides } = carryChrome(moved, taken.current.others, surface, drag.loose);
    const docks = id === 'panel' && docksPanel(box);
    return { id, box, guides: docks ? [] : guides, zone: docks ? dockZone(dockedPanelWidth(useSessions.getState()), surface) : null };
  };
  const { drag, start } = useWindowDrag(root, (id) => {
    const box = rectOf(elementOf(id as ChromeId));
    taken.current = box ? { box, others: othersOf(id as ChromeId) } : null;
    return box ?? undefined;
  }, CHROME_IDS, (dropped) => {
    const at = carriedAt(dropped);
    if (!at) return;
    if (at.zone) useSessions.getState().dockPanel();
    else place(at.id, at.box);
  }, false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each move of the drag, with the box taken then
  useLayoutEffect(() => {
    useCarried.setState({ carried: drag ? carriedAt(drag) : null });
  }, [drag]);

  useEffect(() => {
    const onPress = (event: PointerEvent) => {
      if (event.button !== 0 || !canArrange() || !(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>('[data-chrome]'), id = element?.dataset.chrome as ChromeId | undefined;
      if (!id) return;
      // placed, a press brings it in front of the floating windows, as a window's does
      if (element?.dataset.placed) useSessions.getState().raiseWindow(chromeSlot(id));
      const byHead = id === 'panel' && event.target.closest('.cp-list__head') !== null && event.target.closest(INTERACTIVE) === null;
      if (!event.altKey && !byHead) return;
      // the room or a window under it does not take it too
      if (event.altKey) event.stopPropagation();
      start(id, event);
    };
    window.addEventListener('pointerdown', onPress, { capture: true });
    return () => window.removeEventListener('pointerdown', onPress, { capture: true });
  }, [start]);

  const carried = useCarried((s) => s.carried);
  if (!carried) return null;
  return <div className="cp-chrome-guides" aria-hidden="true"><Guides guides={carried.guides} zone={carried.zone} /></div>;
}
