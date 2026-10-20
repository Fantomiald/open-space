import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { t } from '../i18n/index.ts';
import { canArrange } from '../lib/drag.ts';
import type { Box } from '../state/room-frame.ts';
import { arrangementOf, maxColumnsIn, tilingOf, useSessions } from '../state/sessions.ts';
import { addTo, dropAt, moveIn, placement, type Columns } from '../state/stack.ts';
import {
  cascade, clampBox, GAP, gridBoxes, resizeBox, snapMove, snapResize, tidy, zoneAt, zoneBox, type Edge, type Guide,
} from '../state/windows.ts';
import { Detail } from './Detail.tsx';
import { FreeHandles } from './FreeHandles.tsx';
import { boxVariables } from './boxes.ts';
import { GridHandles } from './GridHandles.tsx';
import { Launcher } from './Launcher.tsx';
import { useWindowDrag, WindowDragContext, type WindowDrag } from './useWindowDrag.ts';

/** The launcher's place in the grid, among the sessions' ids. */
const LAUNCHER = 'launcher';

type Size = { width: number; height: number };

const toFractions = (box: Box, area: Size): Box => ({ left: box.left / area.width, top: box.top / area.height, width: box.width / area.width, height: box.height / area.height });
const toPixels = (box: Box, area: Size): Box => ({ left: box.left * area.width, top: box.top * area.height, width: box.width * area.width, height: box.height * area.height });
const offset = (boxes: Record<string, Box>, by: { left: number; top: number }) =>
  Object.fromEntries(Object.entries(boxes).map(([id, box]) => [id, { ...box, left: box.left + by.left, top: box.top + by.top }]));

/**
 * The area the windows are laid out in once measured, on a screen wide enough to place them by hand (null until then),
 * and the width of a window column (--detail-width).
 */
function useArea(view: string) {
  const element = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<(Size & { column: number }) | null>(null);
  useLayoutEffect(() => {
    const node = element.current!;
    const measure = () => setArea((previous) => {
      if (!canArrange()) return null;
      const width = node.clientWidth, height = node.clientHeight;
      const column = Number.parseFloat(getComputedStyle(node).getPropertyValue('--detail-width')) * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      return previous?.width === width && previous.height === height && previous.column === column ? previous : { width, height, column };
    });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
    // measured again before the first paint of another view, whose area differs (focus mode has the list beside it)
  }, [view]);
  return [element, area] as const;
}

/**
 * The open sessions, each in its place of the grid (stack.ts, windows.ts) or where it was placed by hand. All are
 * children of one element, keyed by session, so closing, zooming or moving one never remounts another: each keeps its
 * draft and where its thread was scrolled to. Tab hides them to see the room (still mounted), the button brings them
 * back. In focus mode the launcher can join them, in the place the new session will take (over all of them when there
 * is no room left).
 */
export function Stack() {
  const columns = useSessions((s) => s.columns);
  const openIds = useSessions((s) => s.openIds);
  const zoomedId = useSessions((s) => s.zoomedId);
  const hidden = useSessions((s) => s.stackHidden);
  const hideStack = useSessions((s) => s.hideStack);
  const view = useSessions((s) => s.view);
  const launcherOpen = useSessions((s) => s.launcherOpen);
  const closeLauncher = useSessions((s) => s.closeLauncher);
  const moveWindow = useSessions((s) => s.moveWindow);
  const sizes = useSessions((s) => s.gridSizes[arrangementOf(s.view)]);
  const resizeGrid = useSessions((s) => s.resizeGrid);
  const stackWidth = useSessions((s) => (s.view === 'focus' ? null : s.stackWidth));
  const setStackWidth = useSessions((s) => s.setStackWidth);
  const mode = useSessions((s) => s.windowMode[arrangementOf(s.view)]);
  const free = useSessions((s) => s.free[arrangementOf(s.view)]);
  const request = useSessions((s) => s.windowModeRequest);
  const requestWindowMode = useSessions((s) => s.requestWindowMode);
  const freeWindows = useSessions((s) => s.freeWindows);
  const tidyWindows = useSessions((s) => s.tidyWindows);
  const placeWindow = useSessions((s) => s.placeWindow);
  const raiseWindow = useSessions((s) => s.raiseWindow);
  const active = useSessions((s) => (s.selectedId ? s.sessions[s.selectedId]?.name : undefined));
  const tiling = tilingOf(view);
  const [element, area] = useArea(view);
  const placed = area !== null;
  const floating = placed && mode === 'free';
  const max = maxColumnsIn(view);
  const withLauncherOf = (grid: Columns) => (launcherOpen ? addTo(grid, LAUNCHER, max, tiling) : null);

  // over the room the grid keeps to the right, as wide as its columns or as pulled by hand, clear of the status card
  const widthRange = (count: number) => ({ min: count * tiling.minColumn + (count - 1) * GAP, max: window.innerWidth - 20 * 16 - 3 * GAP });
  const gridArea = (count: number): Box | null => {
    if (!area) return null;
    if (view === 'focus') return { left: 0, top: 0, width: area.width, height: area.height };
    const range = widthRange(count);
    const natural = count === 1 ? area.column : Math.min(count * area.column + (count - 1) * GAP, range.max);
    const width = Math.min(stackWidth === null ? natural : Math.min(Math.max(stackWidth * window.innerWidth, range.min), range.max), area.width);
    return { left: area.width - width, top: 0, width, height: area.height };
  };
  const gridAt = (grid: Columns) => {
    const box = gridArea(grid.length);
    return box ? offset(gridBoxes(grid, sizes, box, tiling), box) : null;
  };

  // where the window carried would land in the grid, among the windows as they were when it was taken
  const before = gridAt(withLauncherOf(columns) ?? columns);
  const landing = (drag: WindowDrag) => {
    if (!before) return null;
    const slots = columns.flatMap((ids, column) => ids.map((id, row) => ({ id, column, row, box: before[id] })));
    return dropAt(slots, drag.pointer, columns, tiling);
  };

  // the windows placed by hand, and where the ones never placed open (a step down and right of the front one)
  const floatingAt = (ids: readonly string[]) => {
    if (!area) return null;
    const boxes: Record<string, Box> = {};
    for (const id of ids) if (free.boxes[id]) boxes[id] = clampBox(toPixels(free.boxes[id], area), area);
    const front = free.order.filter((id) => boxes[id]).at(-1);
    let last = front ? boxes[front] : null;
    const size = { width: Math.min(area.column, area.width), height: Math.round((area.height * 2) / 3) };
    for (const id of ids) if (!boxes[id]) last = boxes[id] = cascade(last, size, area);
    return boxes;
  };
  // the status card is something to stick to as well
  const obstacles = (): Box[] => {
    const card = document.querySelector('.cp-status')?.getBoundingClientRect(), surface = element.current?.getBoundingClientRect();
    return card?.width && surface ? [{ left: card.left - surface.left, top: card.top - surface.top, width: card.width, height: card.height }] : [];
  };
  const others = (boxes: Record<string, Box>, id: string) => [...Object.entries(boxes).filter(([other]) => other !== id).map(([, box]) => box), ...obstacles()];
  /** Where the window carried is: snapped to the edges near it, unless Cmd is held; over the edge of the screen, the zone it would take. */
  const carriedBox = (drag: WindowDrag, boxes: Record<string, Box>) => {
    const moved = clampBox({ ...boxes[drag.id], left: drag.pointer.x - drag.grab.x, top: drag.pointer.y - drag.grab.y }, area!);
    const zone = zoneAt(drag.pointer, area!);
    if (zone) return { box: moved, zone: zoneBox(zone, area!), guides: [] as Guide[] };
    if (drag.loose) return { box: moved, zone: null, guides: [] as Guide[] };
    return { ...snapMove(moved, others(boxes, drag.id), area!), zone: null };
  };

  const shownBoxes = useRef<Record<string, Box> | null>(null);
  const floatingBoxes = useRef<Record<string, Box> | null>(null);
  const { drag, start } = useWindowDrag(element, (id) => shownBoxes.current?.[id], openIds, (dropped) => {
    if (floating && floatingBoxes.current) {
      const { box, zone } = carriedBox(dropped, floatingBoxes.current);
      placeWindow(dropped.id, toFractions(zone ?? box, area!));
      return;
    }
    const to = landing(dropped);
    if (to) moveWindow(dropped.id, to);
  });

  const target = drag && !floating ? landing(drag) : null;
  const shown = drag && target ? moveIn(columns, drag.id, target, max, tiling) : columns;
  const withLauncher = withLauncherOf(shown);
  const zoomed = launcherOpen && !withLauncher ? LAUNCHER : zoomedId;
  const laidOut = withLauncher ?? shown;
  const { rows, slots } = placement(laidOut, tiling);
  const placedFreely = floating ? floatingAt(laidOut.flat()) : null;
  floatingBoxes.current = placedFreely;

  // a window being resized by hand in free mode, as it is now
  const [resizing, setResizing] = useState<{ id: string; box: Box; guides: Guide[] } | null>(null);
  const pull = (id: string, edge: Edge, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !placedFreely || !area) return;
    event.preventDefault();
    event.stopPropagation();
    raiseWindow(id);
    const handle = event.currentTarget, from = { x: event.clientX, y: event.clientY }, startBox = placedFreely[id], boxes = placedFreely;
    handle.setPointerCapture(event.pointerId);
    let latest = startBox;
    const move = (pointer: PointerEvent) => {
      const pulled = clampBox(resizeBox(startBox, edge, pointer.clientX - from.x, pointer.clientY - from.y), area);
      const result = pointer.metaKey || pointer.ctrlKey ? { box: pulled, guides: [] } : snapResize(pulled, edge, others(boxes, id), area);
      latest = result.box;
      setResizing({ id, ...result });
    };
    const end = () => {
      handle.removeEventListener('lostpointercapture', end);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      setResizing(null);
      if (latest !== startBox) placeWindow(id, toFractions(latest, area));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    // the window closed while pulled: its handle is gone with the pointer
    handle.addEventListener('lostpointercapture', end, { once: true });
  };

  const carried = drag && placedFreely?.[drag.id] ? carriedBox(drag, placedFreely) : null;
  const grid = floating ? null : gridAt(laidOut);
  const shownArea = gridArea(laidOut.length);
  const boxes = placedFreely
    ? { ...placedFreely, ...(carried && drag ? { [drag.id]: carried.box } : {}), ...(resizing ? { [resizing.id]: resizing.box } : {}) }
    : grid;
  shownBoxes.current = boxes;
  const whole = area ? (floating ? zoneBox('full', area) : shownArea) : null;
  const boxOf = (id: string) => (zoomed === id ? whole : boxes?.[id]);
  const guides = carried?.guides ?? resizing?.guides ?? [];

  // the windows that opened in free mode keep the place they opened in
  const unplaced = floating ? openIds.filter((id) => !free.boxes[id]) : [];
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when windows without a place of their own show up
  useEffect(() => {
    if (!placedFreely || !area) return;
    for (const id of unplaced) placeWindow(id, toFractions(placedFreely[id], area));
  }, [unplaced.join()]);

  // the header asked for the other mode: from the grid each window stays where it is, back to the grid each one goes to
  // the place nearest to it
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each request, with the windows where they are then
  useEffect(() => {
    if (!request) return;
    if (!area || request === mode) { requestWindowMode(null); return; }
    if (request === 'free' && boxes) {
      freeWindows(Object.fromEntries(openIds.filter((id) => boxes[id]).map((id) => [id, toFractions(boxes[id], area)])));
    } else if (request === 'grid' && placedFreely) {
      const box = gridArea(columns.length)!;
      const local = offset(placedFreely, { left: -box.left, top: -box.top });
      tidyWindows(tidy(columns, Object.fromEntries(openIds.map((id) => [id, local[id]])), box, tiling, sizes));
    }
  }, [request]);

  // the windows glide to their new place, but not into their first one
  const [gliding, setGliding] = useState(false);
  useEffect(() => {
    if (!placed) { setGliding(false); return; }
    const frame = requestAnimationFrame(() => setGliding(true));
    return () => cancelAnimationFrame(frame);
  }, [placed]);
  // the grid places each slot from its data attributes, so the DOM keeps one order whatever the layout: React moving a
  // window to reorder them (focus mode tiles from the other side) would reset where its thread was scrolled to
  const ordered = slots.toSorted((a, b) => a.id.localeCompare(b.id));
  const several = slots.length > 1;
  const movable = placed && zoomed === null && (floating || (several && !launcherOpen));
  const front = (id: string) => (id === LAUNCHER ? free.order.length + 1 : free.order.indexOf(id) + 1);
  const variables = (id: string) => {
    const box = boxOf(id);
    if (!box) return undefined;
    const lift = drag?.id === id && !floating
      ? { '--drag-x': `${Math.round(drag.pointer.x - drag.grab.x - box.left)}px`, '--drag-y': `${Math.round(drag.pointer.y - drag.grab.y - box.top)}px` }
      : {};
    return { ...boxVariables(box), ...lift, ...(floating ? { '--z': front(id) } : {}) } as CSSProperties;
  };
  const edgeRange = widthRange(laidOut.length);
  return (
    <WindowDragContext value={movable ? start : null}>
      <div
        ref={element} className="cp-stack" data-placed={placed} data-mode={floating ? 'free' : 'grid'} data-gliding={gliding} data-dragging={drag !== null}
        data-count={slots.length} data-columns={laidOut.length} data-rows={rows} data-zoomed={zoomed !== null} data-hidden={hidden} aria-hidden={hidden || undefined}
      >
        {ordered.map(({ id, column, row, span }) => (
          <div
            key={id} className="cp-stack__slot" data-session={id} data-column={column} data-row={row} data-span={span} data-zoomed={zoomed === id}
            data-compact={several && zoomed !== id} data-carried={drag?.id === id || undefined} data-resizing={resizing?.id === id || undefined} style={variables(id)}
            onPointerDownCapture={id === LAUNCHER ? undefined : (event) => {
              if (floating) raiseWindow(id);
              if (movable && event.altKey) start(id, event);
            }}
          >
            {id === LAUNCHER ? <Launcher onClose={closeLauncher} /> : <Detail sessionId={id} />}
            {floating && zoomed === null && id !== LAUNCHER && <FreeHandles onPull={(edge, event) => pull(id, edge, event)} />}
          </div>
        ))}
        {shownArea && grid && !drag && zoomed === null && (
          <GridHandles
            columns={laidOut} boxes={grid} area={shownArea} tiling={tiling} sizes={sizes} onResize={resizeGrid}
            edge={view === 'focus' ? undefined : { width: shownArea.width, ...edgeRange, onResize: (next) => setStackWidth(next === null ? null : next / window.innerWidth) }}
          />
        )}
        {carried?.zone && <div className="cp-stack__zone" style={boxVariables(carried.zone)} aria-hidden="true" />}
        {guides.map((guide) => (
          <div
            key={`${guide.axis}${guide.at}`} className="cp-stack__guide" data-axis={guide.axis} aria-hidden="true"
            style={boxVariables(guide.axis === 'x' ? { left: guide.at, top: guide.from, width: 1, height: guide.to - guide.from } : { left: guide.from, top: guide.at, width: guide.to - guide.from, height: 1 })}
          />
        ))}
        {zoomed === LAUNCHER && !withLauncher && (
          <div key={LAUNCHER} className="cp-stack__slot" data-zoomed="true" style={whole ? boxVariables(whole) : undefined}><Launcher onClose={closeLauncher} replacing={active} /></div>
        )}
      </div>
      {hidden && (
        <button type="button" className="cp-button cp-stack__show" onClick={() => hideStack(false)}>
          {t.room.stack.show(slots.length)} <kbd className="cp-kbd">Tab</kbd>
        </button>
      )}
    </WindowDragContext>
  );
}
