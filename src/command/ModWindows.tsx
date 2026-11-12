import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { ModInfo } from '../../shared/mods.ts';
import { t } from '../i18n/index.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { modSlot } from '../state/docking.ts';
import { MOD_HEAD, modBox, modPlacementKey as placementKey, NOT_PLACED, openingSpots, resizeMod, type ModPlacement } from '../state/mods.ts';
import { outKey } from '../state/out.ts';
import { placePip } from '../state/pip.ts';
import type { Box } from '../state/room-frame.ts';
import { useSessions } from '../state/sessions.ts';
import type { Edge } from '../state/windows.ts';
import { boxVariables, floatingSurface } from './boxes.ts';
import { noteFloating, useDock } from './dock.ts';
import { FreeHandles } from './FreeHandles.tsx';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, MOD_ICONS, MoreIcon, PopOutIcon, RefreshIcon, SettingsIcon } from './Icons.tsx';
import { useDismiss } from './useDismiss.ts';
import { useMenuBelow } from './useMenuBelow.ts';
import { OutControls } from './OutControls.tsx';
import { useModPage } from './useModPage.tsx';
import { INTERACTIVE } from './useWindowDrag.ts';

/** how far a press on the title bar goes before it carries the window */
const CARRY_AFTER = 4;

/** The mods' windows over the office, in the order they were last touched: the last one on top. */
export function ModWindows() {
  const mods = useSessions((s) => s.mods);
  const openMods = useSessions((s) => s.openMods);
  const closeMod = useSessions((s) => s.closeMod);
  // a mod deleted elsewhere: its window goes (once the server said which mods there are)
  useEffect(() => { if (mods) for (const id of openMods) if (!mods.some((mod) => mod.id === id)) closeMod(id); }, [mods, openMods, closeMod]);
  const outKeys = useSessions((s) => s.outKeys);
  const shown = openMods.filter((id) => !outKeys.includes(outKey({ kind: 'mod', modId: id }))).map((id) => mods?.find((mod) => mod.id === id)).filter((mod): mod is ModInfo => !!mod);
  // the ones never placed by hand open side by side, in the order they were opened
  const docked = useSessions((s) => s.columns.flat().join(' '));
  const unplaced = shown.filter((mod) => !docked.split(' ').includes(modSlot(mod.id)) && readPreference(placementKey(mod.id), NOT_PLACED).left === null);
  const spots = openingSpots(unplaced.map((mod) => ({ width: mod.width, height: mod.height })), floatingSurface());
  const spotOf = (mod: ModInfo) => spots[unplaced.indexOf(mod)] ?? spots[0] ?? { left: 0, top: 0 };
  // the windows stay in one order in the page (an iframe moved in the DOM loads again); the order they were touched in sets their depth
  return [...shown].sort((a, b) => a.id.localeCompare(b.id)).map((mod) => <ModWindow key={mod.id} mod={mod} depth={openMods.indexOf(mod.id)} spot={spotOf(mod)} />);
}

/**
 * A mod's window: its page in a sandboxed frame (an origin of its own, see server/http.ts), under a title bar that
 * carries it, resized by its edges and corners, folded to its title. Docked in the sessions' grid, it sits over the slot
 * the stack laid out for it and is resized by the grid's gutters; the stack's drag carries it, docked or floating, so it
 * docks and undocks like a session's window (dock.ts). It tells the page the look of the user's windows and the data the
 * page asks for (the kit's OpenSpace.watch), while it is open. `detached`: alone in a window taken out of Open Space
 * (OutApp), which it fills; the app's window carries and resizes it.
 */
export function ModWindow({ mod, depth, spot, detached = false }: { mod: ModInfo; depth: number; spot: { left: number; top: number }; detached?: boolean }) {
  const words = t.mods;
  const { closeMod, openModSettings, popOut, show } = useSessions.getState();
  const openMod = (id: string) => { if (!detached) useSessions.getState().openMod(id); };
  const writer = useSessions((s) => Object.values(s.sessions).find((session) => session.cwd === mod.folder));
  const [placement, setPlacement] = useState<ModPlacement>(() => readPreference(placementKey(mod.id), NOT_PLACED));
  const docked = useSessions((s) => !detached && s.columns.some((column) => column.includes(modSlot(mod.id))));
  const slot = useDock((s) => (detached ? undefined : s.slots[mod.id]));
  const lifted = useDock((s) => (!detached && s.carried?.id === mod.id ? s.carried.box : null));
  const carry = useDock((s) => (detached ? null : s.start));
  const covered = useDock((s) => s.covered);
  const placedByStack = useDock((s) => s.placed);
  // the stack saved where it floats (dropped out of the grid, or carried elsewhere): read it again
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the stack placed a mod or this one left the grid
  useEffect(() => { setPlacement(readPreference(placementKey(mod.id), NOT_PLACED)); }, [placedByStack, docked]);
  const [, setSurface] = useState(floatingSurface);
  const folded = !detached && !docked && placement.folded;
  const { page, question, fit, refreshNow, refreshing } = useModPage(mod, !folded);
  // `fit`: the height its page says its content needs; the window fits it until the user resizes it, and is never taller
  const box = modBox(mod, placement, spot, floatingSurface(), fit);
  const place = (next: ModPlacement) => { setPlacement(next); writePreference(placementKey(mod.id), next); };
  const carried = useRef<{ start: Box; x: number; y: number; edge: Edge | null; started: boolean } | null>(null);
  const [moving, setMoving] = useState(false);
  const [moved, setMoved] = useState<Box | null>(null);
  const ownBox = moved ?? box;
  const shownBox = lifted ?? (docked && slot ? slot : ownBox);

  // where it floats, for the stack's drag to take it from there
  useLayoutEffect(() => {
    noteFloating(mod.id, detached || docked ? null : ownBox);
  });
  useEffect(() => () => noteFloating(mod.id, null), [mod.id]);

  // a smaller page: the window stays within reach
  useEffect(() => {
    const keep = () => setSurface(floatingSurface());
    window.addEventListener('resize', keep);
    return () => window.removeEventListener('resize', keep);
  }, []);

  // alone in its own window: that window is never taller than the content either
  useEffect(() => {
    if (!detached || !fit) return;
    const keep = () => { const extra = window.innerHeight - MOD_HEAD - fit; if (extra > 1) window.resizeBy(0, -extra); };
    keep();
    window.addEventListener('resize', keep);
    return () => window.removeEventListener('resize', keep);
  }, [detached, fit]);

  const grab = (edge: Edge | null, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (!edge && (event.target as HTMLElement).closest(INTERACTIVE))) return;
    openMod(mod.id);
    // carried by the stack (which docks and undocks it) while it can move windows, else on its own
    if (!edge && carry) { carry(modSlot(mod.id), event); return; }
    carried.current = { start: box, x: event.clientX, y: event.clientY, edge, started: false };
  };
  const drag = (event: ReactPointerEvent<HTMLElement>) => {
    const from = carried.current;
    if (!from) return;
    const dx = event.clientX - from.x, dy = event.clientY - from.y;
    if (!from.started) {
      if (!from.edge && Math.hypot(dx, dy) < CARRY_AFTER) return;
      from.started = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setMoving(true);
    }
    setMoved(from.edge ? resizeMod(from.start, from.edge, dx, dy, floatingSurface(), fit) : placePip({ ...from.start, left: from.start.left + dx, top: from.start.top + dy }, floatingSurface()));
  };
  const drop = () => {
    const from = carried.current;
    carried.current = null;
    if (!from?.started || !moved) return;
    setMoving(false);
    setMoved(null);
    place({ ...placement, left: moved.left, top: moved.top, size: from.edge ? { width: moved.width, height: moved.height - MOD_HEAD } : placement.size });
  };

  const Icon = MOD_ICONS[mod.icon];
  const fold = () => place({ ...placement, folded: !placement.folded });
  // building: the page is the starter, nothing to show yet
  const building = mod.draft;
  const button = (label: string, title: string, onClick: () => void, icon: ReactNode, busy = false) => (
    <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={label} title={title} aria-busy={busy || undefined} onClick={onClick}>{icon}</button>
  );
  // the same title bar as a session's window: its own actions, then out of Open Space, then close
  return (
    <section
      className="cp-mod" aria-label={words.windowLabel(mod.name)} data-folded={folded} data-building={mod.draft} data-moving={moving || !!lifted} data-detached={detached || undefined}
      data-docked={(docked && !!slot) || undefined} data-covered={(docked && !!slot && covered) || undefined} data-carried={!!lifted || undefined}
      style={detached ? undefined : ({ ...boxVariables(shownBox), '--depth': depth } as CSSProperties)}
      {...(detached ? {} : { onPointerMove: drag, onPointerUp: drop, onPointerCancel: drop, onPointerDownCapture: () => openMod(mod.id) })}
    >
      <header className="cp-mod__head" onPointerDown={(event) => { if (!detached) grab(null, event); }} onDoubleClick={(event) => { if (!detached && !docked && !(event.target as HTMLElement).closest(INTERACTIVE)) fold(); }}>
        <span className="cp-mod__icon"><Icon /></span>
        <span className="cp-mod__title">{mod.name}</span>
        <div className="cp-detail__controls">
          {!building && button(words.reload, words.reloadTitle(mod.refresh), refreshNow, <RefreshIcon />, refreshing)}
          <ActionMenu
            items={[
              { label: words.settings, title: words.settingsTitle(mod.name), icon: <SettingsIcon />, run: () => openModSettings(mod.id) },
              ...(!docked && !detached ? [{ label: placement.folded ? words.unfold : words.fold, title: placement.folded ? words.unfold : words.fold, icon: placement.folded ? <ChevronDownIcon /> : <ChevronUpIcon />, run: fold }] : []),
              ...(detached ? [] : [{ label: t.common.out.popOut, title: t.common.out.popOutTitle, icon: <PopOutIcon />, run: () => popOut({ kind: 'mod', modId: mod.id }) }]),
            ]}
          />
          {detached ? <OutControls target={{ kind: 'mod', modId: mod.id }} variant="outlined" /> : button(words.close, words.close, () => closeMod(mod.id), <CloseIcon />)}
        </div>
      </header>
      {!folded && (building ? (
        <div className="cp-mod__building" aria-busy="true">
          <p className="cp-mod__building-title">{words.building(writer?.name ?? null)}</p>
          <p>{words.buildingText}</p>
          <span className="cp-mod__skeleton" /><span className="cp-mod__skeleton" /><span className="cp-mod__skeleton" />
          {writer && <button type="button" className="cp-button" onClick={() => show(writer.id)}>{words.showSession}</button>}
        </div>
      ) : page)}
      {!folded && !detached && !docked && <FreeHandles onPull={grab} />}
      {question}
    </section>
  );
}

/** An item of a menu (ActionMenu): `danger` in red, for what cannot be undone. */
export interface MenuItem { label: string; title: string; icon: ReactNode; run: () => void; danger?: boolean }

/**
 * A menu under a round button: a mod's actions out of sight, as a session's window keeps its own (its settings,
 * folding it, taking it out), or a dashboard's. `trigger`: another button than the "more" one, with its words.
 */
export function ActionMenu({ items, trigger }: { items: readonly MenuItem[]; trigger?: { label: string; icon: ReactNode; text?: string } }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  useMenuBelow(open, box, menu);
  const label = trigger?.label ?? t.session.detail.more;
  return (
    <div className="cp-detail__more" ref={box}>
      <button type="button" className={trigger?.text ? 'cp-button' : 'cp-icon-button'} data-variant="outlined" aria-expanded={open} aria-haspopup="menu" aria-label={label} title={label} onClick={() => setOpen(!open)}>
        {trigger?.icon ?? <MoreIcon />}{trigger?.text}
      </button>
      {open && (
        <div ref={menu} className="cp-detail__menu" popover="manual" role="menu" aria-label={label}>
          {items.map((item) => <button key={item.label} type="button" role="menuitem" title={item.title} data-variant={item.danger ? 'danger' : undefined} onClick={() => { close(); item.run(); }}>{item.icon}{item.label}</button>)}
        </div>
      )}
    </div>
  );
}
