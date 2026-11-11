import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { isModStoreName, type ModInfo } from '../../shared/mods.ts';
import { t } from '../i18n/index.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { modSlot } from '../state/docking.ts';
import { awaitModEnv, costsForMods, isModData, MOD_HEAD, MOD_TOKENS, modBox, modPlacementKey as placementKey, NOT_PLACED, onModStore, openingSpots, quotaForMods, resizeMod, sessionsForMods, type ModData, type ModPlacement } from '../state/mods.ts';
import { outKey } from '../state/out.ts';
import { placePip } from '../state/pip.ts';
import type { Box } from '../state/room-frame.ts';
import { useSessions, type CommandPostState } from '../state/sessions.ts';
import type { Edge } from '../state/windows.ts';
import { boxVariables, floatingSurface } from './boxes.ts';
import { noteFloating, useDock } from './dock.ts';
import { FreeHandles } from './FreeHandles.tsx';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, MOD_ICONS, MoreIcon, PopOutIcon, RefreshIcon, SettingsIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { useDismiss } from './useDismiss.ts';
import { useMenuBelow } from './useMenuBelow.ts';
import { OutControls } from './OutControls.tsx';
import { INTERACTIVE } from './useWindowDrag.ts';

/** how far a press on the title bar goes before it carries the window */
const CARRY_AFTER = 4;
/** what a mod watching the costs gets again, at most this often */
const COSTS_EVERY_MS = 60_000;
/** the refresh button turns at least this long, so a quick refresh is still seen, and at most this long */
const REFRESH_SHOWN_MS = 600;
const REFRESH_CAP_MS = 10_000;

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

/** What Open Space tells a mod's page asking for `name`. */
function dataFor(name: ModData, s: CommandPostState) {
  switch (name) {
    case 'sessions': return sessionsForMods(Object.values(s.sessions));
    case 'quota': return quotaForMods(s.quota);
    case 'costs': return costsForMods(s.costs, Date.now());
  }
}
const pick = (name: ModData) => (s: CommandPostState) => (name === 'sessions' ? s.sessions : name === 'quota' ? s.quota : s.costs);

/** The design tokens of Open Space's page as they are now: the user's window style, for the mod to dress in. */
function currentTheme() {
  const style = getComputedStyle(document.documentElement);
  const s = useSessions.getState();
  return {
    vars: Object.fromEntries(MOD_TOKENS.map((name) => [name, style.getPropertyValue(name).trim()]).filter(([, value]) => value)),
    style: document.documentElement.dataset.windowStyle ?? 'classic',
    language: s.preferences.language ?? 'fr',
    reducedMotion: s.preferences.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
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
  const { closeMod, openModSettings, popOut, send, show } = useSessions.getState();
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
  // the height its page says its content needs: the window fits it until the user resizes it, and is never taller
  const [fit, setFit] = useState<number | null>(null);
  const box = modBox(mod, placement, spot, floatingSurface(), fit);
  const place = (next: ModPlacement) => { setPlacement(next); writePreference(placementKey(mod.id), next); };
  const carried = useRef<{ start: Box; x: number; y: number; edge: Edge | null; started: boolean } | null>(null);
  const [moving, setMoving] = useState(false);
  const [moved, setMoved] = useState<Box | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [loads, setLoads] = useState(0);
  // the trigger its page asked to start, until the user says yes or no
  const [asked, setAsked] = useState<{ id: string; name: string } | null>(null);
  // set while the page refreshes itself (the kit's OpenSpace.onRefresh): a refresh tells it rather than loading it again
  const pageRefresh = useRef<{ run: () => void; replies: boolean } | null>(null);
  const refresh = () => (pageRefresh.current ? pageRefresh.current.run() : setLoads((count) => count + 1));
  // the refresh asked by the button, until the page loaded again or said it refreshed itself
  const [refreshing, setRefreshing] = useState(false);
  const refreshed = useRef<() => void>(() => {});
  const refreshNow = () => {
    if (refreshing) return;
    const since = Date.now();
    setRefreshing(true);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(cap);
      refreshed.current = () => {};
      setTimeout(() => setRefreshing(false), Math.max(0, REFRESH_SHOWN_MS - (Date.now() - since)));
    };
    const cap = setTimeout(finish, REFRESH_CAP_MS);
    refreshed.current = finish;
    const replies = pageRefresh.current?.replies ?? true;
    refresh();
    // a page refreshing itself without saying when it is done: the button turns a moment
    if (!replies) finish();
  };
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

  // the pace set in its settings, while the window shows it
  const folded = !detached && !docked && placement.folded;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh reads refs and setters only
  useEffect(() => {
    if (!mod.refresh || mod.draft || folded) return;
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, mod.refresh * 1000);
    return () => clearInterval(timer);
  }, [mod.refresh, mod.draft, folded]);

  // its data changed while its window was not open: now it is seen
  useEffect(() => { if (mod.unread) send({ t: 'modSeen', id: mod.id }); }, [mod.unread, mod.id, send]);

  // what the page asks for, told again whenever it changes, until the page stops asking or the window closes
  useEffect(() => {
    const watched = new Map<ModData, () => void>();
    // to the mod's own origin only: its variables never reach a page it navigated to
    const post = (message: object) => frame.current?.contentWindow?.postMessage(message, new URL(mod.url).origin);
    const tellTheme = () => post({ openSpace: 'theme', ...currentTheme() });
    const tell = (name: ModData) => post({ openSpace: 'data', name, value: dataFor(name, useSessions.getState()) });
    const envWaits = new Set<() => void>();
    pageRefresh.current = null;
    let costsAsked = 0;
    const askCosts = () => { if (Date.now() - costsAsked > COSTS_EVERY_MS) { costsAsked = Date.now(); useSessions.getState().loadCosts(); } };
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const message = event.data as { openSpace?: unknown; name?: unknown } | null;
      switch (message?.openSpace) {
        case 'ready': tellTheme(); break;
        case 'escape': break;
        case 'run-trigger': {
          // only the trigger its mod.json names, and only once the user confirmed
          const trigger = useSessions.getState().triggers.triggers.find((each) => each.id === mod.trigger && each.enabled);
          if (trigger) setAsked({ id: trigger.id, name: trigger.name });
          break;
        }
        case 'env': {
          const stop = awaitModEnv(mod.id, (env) => { envWaits.delete(stop); post({ openSpace: 'env', env }); });
          envWaits.add(stop);
          send({ t: 'modEnv', id: mod.id });
          break;
        }
        case 'store-get': if (isModStoreName(message.name)) send({ t: 'modStoreGet', id: mod.id, name: message.name }); break;
        case 'store-set': {
          const value = (message as { value?: unknown }).value;
          if (isModStoreName(message.name) && value !== undefined) send({ t: 'modStoreSet', id: mod.id, name: message.name, value });
          break;
        }
        case 'refreshable': {
          const { on, replies } = message as { on?: unknown; replies?: unknown };
          pageRefresh.current = on === true ? { run: () => post({ openSpace: 'refresh' }), replies: replies === true } : null;
          break;
        }
        case 'refreshed': refreshed.current(); break;
        case 'size': { const height = (message as { height?: unknown }).height; if (typeof height === 'number' && Number.isFinite(height)) setFit(Math.round(height)); break; }
        case 'watch': {
          const name = message.name;
          if (!isModData(name) || watched.has(name)) return;
          if (name === 'costs') askCosts();
          watched.set(name, useSessions.subscribe((s, before) => { if (pick(name)(s) !== pick(name)(before)) tell(name); }));
          tell(name);
          break;
        }
        case 'unwatch': {
          const name = message.name;
          if (isModData(name)) { watched.get(name)?.(); watched.delete(name); }
          break;
        }
      }
    };
    window.addEventListener('message', onMessage);
    const stopStore = onModStore(mod.id, (name, value) => post({ openSpace: 'store', name, value }));
    // the look changes with the window style, the theme, the glass and the language
    const restyle = useSessions.subscribe((s, before) => {
      const now = s.preferences, then = before.preferences;
      if (now.windowStyle !== then.windowStyle || now.theme !== then.theme || now.language !== then.language || now.reduceMotion !== then.reduceMotion) requestAnimationFrame(tellTheme);
    });
    const costsTimer = setInterval(() => { if (watched.has('costs')) askCosts(); }, COSTS_EVERY_MS);
    return () => {
      window.removeEventListener('message', onMessage);
      restyle();
      stopStore();
      clearInterval(costsTimer);
      for (const stop of watched.values()) stop();
      for (const stop of envWaits) stop();
      pageRefresh.current = null;
    };
  }, [loads, mod.version, mod.id, mod.url, mod.trigger, send]);

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
          <ModMenu
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
      ) : (
        <iframe
          key={`${mod.version}:${loads}`} ref={frame} className="cp-mod__page" title={mod.name} src={`${mod.url}?v=${mod.version}`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write"
          referrerPolicy="no-referrer" onLoad={() => refreshed.current()}
        />
      ))}
      {!folded && !detached && !docked && <FreeHandles onPull={grab} />}
      {asked && createPortal(
        <Modal title={words.runQuestion(asked.name)} onClose={() => setAsked(null)}>
          <p className="cp-muted">{words.runText(mod.name)}</p>
          <div className="cp-form__actions">
            <button type="button" className="cp-button" onClick={() => setAsked(null)}>{words.cancel}</button>
            <button type="button" className="cp-button" data-variant="primary" data-autofocus onClick={() => { useSessions.getState().runTrigger(asked.id); setAsked(null); }}>{words.run}</button>
          </div>
        </Modal>,
        document.body,
      )}
    </section>
  );
}

/** A mod's actions out of sight, as a session's window keeps its own: its settings, folding it, taking it out. */
function ModMenu({ items }: { items: readonly { label: string; title: string; icon: ReactNode; run: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  useMenuBelow(open, box, menu);
  const label = t.session.detail.more;
  return (
    <div className="cp-detail__more" ref={box}>
      <button type="button" className="cp-icon-button" data-variant="outlined" aria-expanded={open} aria-haspopup="menu" aria-label={label} title={label} onClick={() => setOpen(!open)}><MoreIcon /></button>
      {open && (
        <div ref={menu} className="cp-detail__menu" popover="manual" role="menu" aria-label={label}>
          {items.map((item) => <button key={item.label} type="button" role="menuitem" title={item.title} onClick={() => { close(); item.run(); }}>{item.icon}{item.label}</button>)}
        </div>
      )}
    </div>
  );
}
