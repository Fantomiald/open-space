import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { canArrange } from '../lib/drag.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { dock, dockAt, FLOAT_AWAY, modOfSlot, modSlot, within } from '../state/docking.ts';
import { MOD_HEAD, modPlacementKey, NOT_PLACED, type ModPlacement } from '../state/mods.ts';
import { outKey } from '../state/out.ts';
import type { Box } from '../state/room-frame.ts';
import { arrangementOf, maxColumnsIn, tilingOf, useSessions } from '../state/sessions.ts';
import { addTo, dropAt, moveIn, placement, type Columns, type DropSlot } from '../state/stack.ts';
import { clampBox, GAP, gridBoxes, resizeBox, snapMove, snapResize, zoneAt, zoneBox, type Edge, type Guide } from '../state/windows.ts';
import { Detail } from './Detail.tsx';
import { noteModPlaced, publishSlots, useDock } from './dock.ts';
import { FreeHandles } from './FreeHandles.tsx';
import { boxVariables } from './boxes.ts';
import { GridHandles } from './GridHandles.tsx';
import { Launcher } from './Launcher.tsx';
import { useWindowDrag, WindowCompactContext, WindowDragContext, type WindowDrag } from './useWindowDrag.ts';

/** The launcher's place in the grid, among the sessions' ids. */
const LAUNCHER = 'launcher';
/** A window placed by hand lower than this takes the small layout, so its thread keeps some height. */
const COMPACT_BELOW = 520;
/** the floating windows above the docked ones */
const FLOATING_DEPTH = 10;

type Size = { width: number; height: number };

const toFractions = (box: Box, area: Size): Box => ({ left: box.left / area.width, top: box.top / area.height, width: box.width / area.width, height: box.height / area.height });
const toPixels = (box: Box, area: Size): Box => ({ left: box.left * area.width, top: box.top * area.height, width: box.width * area.width, height: box.height * area.height });
const offset = (boxes: Record<string, Box>, by: { left: number; top: number }) =>
  Object.fromEntries(Object.entries(boxes).map(([id, box]) => [id, { ...box, left: box.left + by.left, top: box.top + by.top }]));

/** Where a window carried goes when let go: a place in the grid (null: the first with room, or where it was), or floating. */
type Landing = { dock: true; to: DropSlot | null } | { dock: false };

/**
 * The area the windows are laid out in once measured, on a screen wide enough to place them by hand (null until then),
 * and the width of a window column (--detail-width).
 */
function useArea(view: string) {
  const element = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<(Size & { column: number }) | null>(null);
  useLayoutEffect(() => {
    const node = element.current!;
    const measure = () => {
      if (!canArrange()) { setArea(null); return; }
      // measured as placed (over the room, the whole page) even before React marks it so: measured at its grid size, the
      // first window would open on the left and glide to its place
      const shown = node.dataset.placed;
      node.dataset.placed = 'true';
      const width = node.clientWidth, height = node.clientHeight;
      if (shown !== undefined) node.dataset.placed = shown;
      const column = Number.parseFloat(getComputedStyle(node).getPropertyValue('--detail-width')) * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      setArea((previous) => (previous?.width === width && previous.height === height && previous.column === column ? previous : { width, height, column }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
    // measured again before the first paint of another view, whose area differs (focus mode has the list beside it)
  }, [view]);
  return [element, area] as const;
}

/**
 * The open sessions, each docked in its place of the grid (stack.ts, windows.ts) or floating where it was placed (one
 * window at a time, docking.ts). All are children of one element, keyed by session, so closing, zooming, docking or
 * moving one never remounts another: each keeps its draft and where its thread was scrolled to. The mods docked in the
 * grid take a slot laid out here, their windows staying in ModWindows (dock.ts). Tab hides them to see the room (still
 * mounted), the button brings them back. In focus mode the launcher can join them, in the place the new session will
 * take (over all of them when there is no room left).
 */
export function Stack() {
  const columns = useSessions((s) => s.columns);
  const openIds = useSessions((s) => s.openIds);
  const zoomedId = useSessions((s) => s.zoomedId);
  const hidden = useSessions((s) => s.uiHidden);
  const view = useSessions((s) => s.view);
  // with only mods docked, the launcher stays among them
  const launcherOpen = useSessions((s) => s.launcherOpen || !s.openIds.length);
  const closeLauncher = useSessions((s) => s.closeLauncher);
  const moveWindow = useSessions((s) => s.moveWindow);
  const dockWindow = useSessions((s) => s.dockWindow);
  const undockMod = useSessions((s) => s.undockMod);
  const sizes = useSessions((s) => s.gridSizes[arrangementOf(s.view)]);
  const resizeGrid = useSessions((s) => s.resizeGrid);
  const stackWidth = useSessions((s) => (s.view === 'focus' ? null : s.stackWidth));
  const setStackWidth = useSessions((s) => s.setStackWidth);
  const free = useSessions((s) => s.free[arrangementOf(s.view)]);
  const placeWindow = useSessions((s) => s.placeWindow);
  const raiseWindow = useSessions((s) => s.raiseWindow);
  const active = useSessions((s) => (s.selectedId ? s.sessions[s.selectedId]?.name : undefined));
  // the mods floating, which the stack's drag carries too (it may dock them)
  const floatingMods = useSessions((s) => s.openMods.filter((id) => !s.columns.some((column) => column.includes(modSlot(id))) && !s.outKeys.includes(outKey({ kind: 'mod', modId: id }))).map(modSlot).join(' '));
  const tiling = tilingOf(view);
  const [element, area] = useArea(view);
  const placed = area !== null;
  const max = maxColumnsIn(view);
  const withLauncherOf = (grid: Columns) => (launcherOpen ? addTo(grid, LAUNCHER, max, tiling) : null);
  const docked = columns.flat();
  const floatingSessions = openIds.filter((id) => free.boxes[id] && !docked.includes(id));
  const isFloating = (id: string) => (modOfSlot(id) !== null ? !docked.includes(id) : floatingSessions.includes(id));

  // over the room the grid keeps to the right, as wide as its columns or as pulled by hand, clear of the status card
  const widthRange = (count: number) => ({ min: count * tiling.minColumn + (count - 1) * GAP, max: window.innerWidth - 20 * 16 - 3 * GAP });
  const gridArea = (count: number): Box | null => {
    if (!area) return null;
    if (view === 'focus') return { left: 0, top: 0, width: area.width, height: area.height };
    const range = widthRange(count);
    const natural = count <= 1 ? area.column : Math.min(count * area.column + (count - 1) * GAP, range.max);
    const width = Math.min(stackWidth === null ? natural : Math.min(Math.max(stackWidth * window.innerWidth, range.min), range.max), area.width);
    return { left: area.width - width, top: 0, width, height: area.height };
  };
  const gridAt = (grid: Columns) => {
    const box = gridArea(grid.length);
    return box ? offset(gridBoxes(grid, sizes, box, tiling), box) : null;
  };
  /** where the stack is on the page: the mods' windows are placed on the page */
  const origin = () => element.current?.getBoundingClientRect() ?? { left: 0, top: 0 };

  // where the window carried would land, among the windows as they were when it was taken: in the grid (over the room,
  // anywhere over it; in focus mode, where the grid fills everything, over the edge of a window), else floating
  const before = gridAt(withLauncherOf(columns) ?? columns);
  const landing = (drag: WindowDrag): Landing => {
    const dockArea = gridArea(Math.max(columns.length, 1));
    if (!before || !dockArea) return { dock: false };
    const slots = columns.flatMap((ids, column) => ids.map((id, row) => ({ id, column, row, box: before[id] })));
    if (view === 'focus') {
      const to = dockAt(slots, drag.pointer, columns, tiling);
      return to ? { dock: true, to } : { dock: false };
    }
    const floating = isFloating(drag.id);
    // a docked window lets go of the grid a little away from it, a floating one docks only right over it
    if (!within(dockArea, drag.pointer, floating ? 0 : FLOAT_AWAY)) return { dock: false };
    return { dock: true, to: columns.length ? dropAt(slots, drag.pointer, columns, tiling) : { column: 0, row: 0 } };
  };

  // the sessions floating, in pixels
  const floatingAt = () => {
    if (!area) return {};
    return Object.fromEntries(floatingSessions.map((id) => [id, clampBox(toPixels(free.boxes[id], area), area)]));
  };
  // the status card is something to stick to as well
  const obstacles = (): Box[] => {
    const card = document.querySelector('.cp-status')?.getBoundingClientRect(), surface = element.current?.getBoundingClientRect();
    return card?.width && surface ? [{ left: card.left - surface.left, top: card.top - surface.top, width: card.width, height: card.height }] : [];
  };
  const others = (boxes: Record<string, Box>, id: string) => [...Object.entries(boxes).filter(([other]) => other !== id).map(([, box]) => box), ...obstacles()];
  /**
   * Where a window carried to float is: snapped to the edges near it, unless Cmd is held; a session's window over the
   * edge of the screen, the zone it would take. A mod keeps its size.
   */
  const carriedBox = (drag: WindowDrag, start: Box, boxes: Record<string, Box>) => {
    const spot = { left: drag.pointer.x - drag.grab.x, top: drag.pointer.y - drag.grab.y };
    const mod = modOfSlot(drag.id) !== null;
    const moved = mod ? { ...start, ...spot } : clampBox({ ...start, ...spot }, area!);
    const zone = mod ? null : zoneAt(drag.pointer, area!);
    if (zone) return { box: moved, zone: zoneBox(zone, area!), guides: [] as Guide[] };
    if (drag.loose) return { box: moved, zone: null, guides: [] as Guide[] };
    return { ...snapMove(moved, others(boxes, drag.id), area!), zone: null };
  };
  const floatingModBox = (id: string) => {
    const mod = modOfSlot(id), box = mod ? useDock.getState().floating[mod] : undefined;
    if (!box) return undefined;
    const at = origin();
    return { ...box, left: box.left - at.left, top: box.top - at.top };
  };

  const shownBoxes = useRef<Record<string, Box> | null>(null);
  const takenBoxes = useRef<Record<string, Box>>({});
  const boxOf = (id: string) => shownBoxes.current?.[id] ?? floatingModBox(id);
  const draggable = [...openIds, ...docked.filter((id) => modOfSlot(id) !== null), ...(floatingMods ? floatingMods.split(' ') : [])];
  // the box each window had when it was taken, which it keeps the size of while carried
  const { drag, start } = useWindowDrag(element, (id) => {
    const box = boxOf(id);
    if (box) takenBoxes.current = { ...takenBoxes.current, [id]: box };
    return box;
  }, draggable, (dropped) => {
    const { id } = dropped;
    const startBox = takenBoxes.current[id];
    const where = landing(dropped);
    const mod = modOfSlot(id);
    // a floating window over a full grid stays floating where it was let go
    if (where.dock && isFloating(id) && dockWindow(id, where.to)) return;
    if (where.dock && !isFloating(id)) {
      if (where.to) moveWindow(id, where.to);
      return;
    }
    if (!startBox || !area) return;
    const { box, zone } = carriedBox(dropped, startBox, { ...(shownBoxes.current ?? {}) });
    if (!mod) { placeWindow(id, toFractions(zone ?? box, area)); return; }
    // a mod floats on the page, at its size (title bar aside)
    const at = origin();
    const kept = readPreference<ModPlacement>(modPlacementKey(mod), NOT_PLACED);
    writePreference(modPlacementKey(mod), { ...kept, left: Math.round(box.left + at.left), top: Math.round(box.top + at.top), size: isFloating(id) ? kept.size : { width: box.width, height: box.height - MOD_HEAD } });
    noteModPlaced();
    if (!isFloating(id)) undockMod(mod);
  });

  const target = drag ? landing(drag) : null;
  const carrying = drag && target ? drag.id : null;
  const docking = target?.dock ? target : null;
  // the grid as it would be once the window carried is let go: moved in it, or docked in it
  const preview = (): Columns => {
    if (!drag || !docking) return columns;
    if (isFloating(drag.id)) return dock(columns, drag.id, docking.to, max, tiling) ?? columns;
    return docking.to ? moveIn(columns, drag.id, docking.to, max, tiling) : columns;
  };
  const shown = preview();
  const withLauncher = withLauncherOf(shown);
  const zoomed = launcherOpen && !withLauncher ? LAUNCHER : zoomedId;
  const laidOut = withLauncher ?? shown;
  const { rows, slots } = placement(laidOut, tiling);
  const grid = gridAt(laidOut);
  const placedFreely = floatingAt();

  // a floating window being resized by hand, as it is now
  const [resizing, setResizing] = useState<{ id: string; box: Box; guides: Guide[] } | null>(null);
  const pull = (id: string, edge: Edge, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !placedFreely[id] || !area) return;
    event.preventDefault();
    event.stopPropagation();
    raiseWindow(id);
    const handle = event.currentTarget, from = { x: event.clientX, y: event.clientY }, startBox = placedFreely[id], boxes = { ...grid, ...placedFreely };
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

  // the window carried to float (or a floating one carried anywhere) follows the pointer as a floating window would
  const afloat = drag && carrying && (isFloating(drag.id) || !docking) && takenBoxes.current[drag.id]
    ? carriedBox(drag, takenBoxes.current[drag.id], { ...grid, ...placedFreely })
    : null;
  const shownArea = gridArea(laidOut.length);
  const boxes: Record<string, Box> = {
    ...grid, ...placedFreely,
    ...(afloat && drag ? { [drag.id]: afloat.box } : {}), ...(resizing ? { [resizing.id]: resizing.box } : {}),
  };
  shownBoxes.current = area ? boxes : null;
  const whole = area ? shownArea : null;
  const boxOfSlot = (id: string) => (zoomed === id ? whole : boxes[id]);
  const guides = afloat?.guides ?? resizing?.guides ?? [];
  // where the window carried docks: the place the grid keeps for it (a docked session shows its own, lifted)
  const dockZone = drag && docking && grid?.[drag.id] && (isFloating(drag.id) || modOfSlot(drag.id) !== null) ? grid[drag.id] : null;
  const zone = afloat?.zone ?? dockZone;

  // the mods docked here: their windows (in ModWindows) sit over the slots laid out for them, a carried one follows the pointer
  useLayoutEffect(() => {
    const at = origin();
    const page = (box: Box) => ({ ...box, left: box.left + at.left, top: box.top + at.top });
    const modSlots: Record<string, Box> = {};
    if (useDock.getState().covered !== (zoomed !== null)) useDock.setState({ covered: zoomed !== null });
    if (area) {
      for (const id of laidOut.flat()) {
        const mod = modOfSlot(id);
        if (mod && grid?.[id]) modSlots[mod] = page(grid[id]);
      }
    }
    publishSlots(modSlots);
    const carriedMod = drag ? modOfSlot(drag.id) : null;
    const lifted = carriedMod && drag
      ? (afloat?.box ?? (grid?.[drag.id] && { ...grid[drag.id], left: drag.pointer.x - drag.grab.x, top: drag.pointer.y - drag.grab.y }))
      : null;
    const carried = carriedMod && lifted ? { id: carriedMod, box: page(lifted) } : null;
    const current = useDock.getState().carried;
    if (JSON.stringify(current) !== JSON.stringify(carried)) useDock.setState({ carried });
  });
  useEffect(() => () => { publishSlots({}); useDock.setState({ carried: null, start: null, covered: false }); }, []);

  // the windows glide to their new place, but not into their first one
  const [gliding, setGliding] = useState(false);
  useEffect(() => {
    if (!placed) { setGliding(false); return; }
    const frame = requestAnimationFrame(() => setGliding(true));
    return () => cancelAnimationFrame(frame);
  }, [placed]);
  // the grid places each slot from its data attributes, so the DOM keeps one order whatever the layout: React moving a
  // window to reorder them (focus mode tiles from the other side) would reset where its thread was scrolled to
  const dockedSlots = slots.filter(({ id }) => modOfSlot(id) === null);
  const floatingOnly = floatingSessions.filter((id) => !laidOut.flat().includes(id)).map((id) => ({ id, column: undefined, row: undefined, span: undefined }));
  const ordered = [...dockedSlots, ...floatingOnly].toSorted((a, b) => a.id.localeCompare(b.id));
  const several = slots.length > 1;
  const movable = placed && zoomed === null && !launcherOpen;
  useEffect(() => { useDock.setState({ start: movable ? start : null }); }, [movable, start]);
  const front = (id: string) => FLOATING_DEPTH + free.order.indexOf(id) + 1;
  const compact = (id: string) => zoomed !== id && (isFloating(id) ? (boxOfSlot(id)?.height ?? Number.POSITIVE_INFINITY) < COMPACT_BELOW : several);
  const variables = (id: string) => {
    const box = boxOfSlot(id);
    if (!box) return undefined;
    const lift = drag?.id === id && !afloat
      ? { '--drag-x': `${Math.round(drag.pointer.x - drag.grab.x - box.left)}px`, '--drag-y': `${Math.round(drag.pointer.y - drag.grab.y - box.top)}px` }
      : {};
    return { ...boxVariables(box), ...lift, ...(isFloating(id) ? { '--z': front(id) } : {}) } as CSSProperties;
  };
  const edgeRange = widthRange(laidOut.length);
  return (
    <WindowDragContext value={movable ? start : null}>
      <div
        ref={element} className="cp-stack" data-placed={placed} data-gliding={gliding} data-dragging={drag !== null}
        data-count={slots.length} data-columns={laidOut.length} data-rows={rows} data-zoomed={zoomed !== null} data-hidden={hidden} aria-hidden={hidden || undefined}
      >
        {ordered.map(({ id, column, row, span }) => (
          <div
            key={id} className="cp-stack__slot" data-session={id} data-column={column} data-row={row} data-span={span} data-zoomed={zoomed === id}
            data-floating={(placed && isFloating(id)) || undefined} data-afloat={(afloat && drag?.id === id) || undefined}
            data-compact={compact(id)} data-carried={drag?.id === id || undefined} data-resizing={resizing?.id === id || undefined} style={variables(id)}
            onPointerDownCapture={id === LAUNCHER ? undefined : (event) => {
              if (isFloating(id)) raiseWindow(id);
              if (movable && event.altKey) start(id, event);
            }}
          >
            {id === LAUNCHER ? <Launcher onClose={openIds.length ? closeLauncher : undefined} /> : <WindowCompactContext value={compact(id)}><Detail sessionId={id} /></WindowCompactContext>}
            {placed && isFloating(id) && zoomed === null && <FreeHandles onPull={(edge, event) => pull(id, edge, event)} />}
          </div>
        ))}
        {shownArea && grid && !drag && zoomed === null && laidOut.length > 0 && (
          <GridHandles
            columns={laidOut} boxes={grid} area={shownArea} tiling={tiling} sizes={sizes} onResize={resizeGrid}
            edge={view === 'focus' ? undefined : { width: shownArea.width, ...edgeRange, onResize: (next) => setStackWidth(next === null ? null : next / window.innerWidth) }}
          />
        )}
        {zone && <div className="cp-stack__zone" style={boxVariables(zone)} aria-hidden="true" />}
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
    </WindowDragContext>
  );
}
