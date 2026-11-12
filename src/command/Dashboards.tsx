import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { DASHBOARD_COLUMNS, DASHBOARD_ROW, hasNews, MAX_DASHBOARD_NAME, MAX_DASHBOARDS, unreadMods, type Dashboard, type DashboardTile } from '../../shared/dashboards.ts';
import type { ModInfo } from '../../shared/mods.ts';
import { t } from '../i18n/index.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { addTile, cellsOf, columnWidth, DASHBOARD_GAP, gridHeight, moveTile, removeTile, resizeTile, stacked, tileBox } from '../../shared/dashboard-grid.ts';
import { MOD_HEAD } from '../state/mods.ts';
import { useSessions } from '../state/sessions.ts';
import { boxVariables } from './boxes.ts';
import { DASHBOARDS_BAR } from './Header.tsx';
import { CloseIcon, GripIcon, MOD_ICONS, ModsIcon, PencilIcon, PlusIcon, RefreshIcon, RemoveIcon, SettingsIcon } from './Icons.tsx';
import { ActionMenu } from './ModWindows.tsx';
import { Modal } from './Modal.tsx';
import { useModPage } from './useModPage.tsx';
import { INTERACTIVE } from './useWindowDrag.ts';

/** under this width the grid becomes one column, tiles one under the other, not moved by hand */
const NARROW = 640;
/** how far a press on a title goes before it carries the tile */
const CARRY_AFTER = 4;
/** a tile carried this close to the top or bottom of the dashboards scrolls them, at most this many pixels a frame */
const SCROLL_EDGE = 64;
const SCROLL_SPEED = 18;
/** rows left free under the lowest tile while one is carried, to drop it there */
const SPARE_ROWS = 6;
const NO_DASHBOARDS: Dashboard[] = [];

/** A tile being carried (`resize`: by its corner): where the press started, the tile then, and the layout it gives now. */
interface Carry { mod: string; resize: boolean; x: number; y: number; scroll: number; start: DashboardTile; started: boolean; dx: number; dy: number; layout: DashboardTile[] }

const newId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The dashboards, beside the rooms: the user's mods laid out on a grid of 12 columns, as in Grafana. A tile is carried
 * by its title and resized by its corner; the others make room and fall back up. Several dashboards, one shown at a
 * time (the one picked last in this browser). Kept in the settings (Preferences.dashboards).
 */
export function Dashboards() {
  const words = t.mods.dashboards;
  const saved = useSessions((s) => s.preferences.dashboards ?? NO_DASHBOARDS);
  const setPreferences = useSessions((s) => s.setPreferences);
  // what was just changed here, shown until the server sends the settings back with it
  const [pending, setPending] = useState<Dashboard[] | null>(null);
  // the server's copy arrived: it is the one shown again
  useEffect(() => setPending(null), [saved]);
  const dashboards = pending ?? saved;
  const [chosen, setChosen] = useState(() => readPreference<string>('dashboard', ''));
  const shown = dashboards.find((each) => each.id === chosen) ?? dashboards[0];
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const mods = useSessions((s) => s.mods);
  const unread = unreadMods(mods);
  // the bar goes up in the header (Header.tsx makes its place while the dashboards are shown), so the grid has the page
  const [bar, setBar] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setBar(document.getElementById(DASHBOARDS_BAR)), []);

  const save = (next: Dashboard[]) => { setPending(next); setPreferences({ dashboards: next }); };
  const choose = (id: string) => { setChosen(id); writePreference('dashboard', id); setRenaming(false); };
  const change = (tiles: DashboardTile[]) => {
    // the first mod added makes the first dashboard
    if (!shown) { const id = newId(); save([{ id, name: words.firstName, tiles }]); choose(id); return; }
    save(dashboards.map((each) => (each.id === shown.id ? { ...each, tiles } : each)));
  };
  const create = () => {
    const id = newId();
    save([...dashboards, { id, name: words.newName(dashboards.length + 1), tiles: [] }]);
    choose(id);
    setRenaming(true);
  };
  const rename = (name: string) => {
    setRenaming(false);
    if (shown && name.trim() && name.trim() !== shown.name) save(dashboards.map((each) => (each.id === shown.id ? { ...each, name: name.trim() } : each)));
  };
  const remove = () => {
    setRemoving(false);
    if (shown) save(dashboards.filter((each) => each.id !== shown.id));
  };

  return (
    <section className="cp-dashboards" aria-label={words.label}>
      {bar && createPortal(<>
        {dashboards.length > 0 && (
          <div className="cp-segmented cp-dashboards__tabs" role="tablist" aria-label={words.label}>
            {dashboards.map((each) => (each.id === shown?.id && renaming ? (
              <NameField key={each.id} name={each.name} onDone={rename} />
            ) : (
              <button key={each.id} type="button" role="tab" aria-selected={each.id === shown?.id} data-news={(each.id !== shown?.id && hasNews(each, unread)) || undefined} title={each.id !== shown?.id && hasNews(each, unread) ? words.tabNews(each.name || words.firstName) : undefined} onClick={() => choose(each.id)} onDoubleClick={() => { choose(each.id); setRenaming(true); }}>
                {each.name || words.firstName}
              </button>
            )))}
          </div>
        )}
        {dashboards.length < MAX_DASHBOARDS && (
          <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={words.create} title={words.create} onClick={create}><PlusIcon /></button>
        )}
        {shown && (
          <ActionMenu
            trigger={{ label: words.more, icon: <SettingsIcon /> }}
            items={[
              { label: words.rename, title: words.renameTitle, icon: <PencilIcon />, run: () => setRenaming(true) },
              { label: words.remove, title: words.removeTitle, icon: <RemoveIcon />, run: () => setRemoving(true), danger: true },
            ]}
          />
        )}
        <span className="cp-dashboards__spacer" />
        <AddMod placed={shown?.tiles ?? []} onAdd={change} />
      </>, bar)}
      <Grid key={shown?.id ?? 'none'} tiles={shown?.tiles ?? []} onChange={change} />
      {removing && shown && (
        <Modal title={words.removeQuestion(shown.name)} onClose={() => setRemoving(false)}>
          <p className="cp-muted">{words.removeText}</p>
          <div className="cp-form__actions">
            <button type="button" className="cp-button" onClick={() => setRemoving(false)}>{words.cancel}</button>
            <button type="button" className="cp-button" data-variant="danger" data-autofocus onClick={remove}>{words.remove}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** A dashboard's name being written, in place of its tab: Enter or leaving the field keeps it, Escape does not. */
function NameField({ name, onDone }: { name: string; onDone: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { field.current?.select(); }, []);
  const submit = (event: FormEvent) => { event.preventDefault(); onDone(value); };
  return (
    <form className="cp-dashboards__rename" onSubmit={submit}>
      <input
        ref={field} value={value} maxLength={MAX_DASHBOARD_NAME} aria-label={t.mods.dashboards.nameLabel} autoComplete="off"
        onChange={(event) => setValue(event.target.value)} onBlur={() => onDone(value)}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onDone(name); } }}
      />
    </form>
  );
}

/** The button that puts a mod on the dashboard: the mods not on it yet, or the way to make one. */
function AddMod({ placed, onAdd }: { placed: readonly DashboardTile[]; onAdd: (tiles: DashboardTile[]) => void }) {
  const words = t.mods.dashboards;
  const mods = useSessions((s) => s.mods);
  const openModsPanel = useSessions((s) => s.openModsPanel);
  const left = (mods ?? []).filter((mod) => !placed.some((tile) => tile.mod === mod.id));
  // its size in cells, from the size of its window, on a page as wide as this one
  const add = (mod: ModInfo) => {
    const column = columnWidth(Math.max(NARROW, document.querySelector('.cp-dashboards__grid')?.clientWidth ?? 1200));
    onAdd(addTile(placed, mod.id, cellsOf(mod.width, column), cellsOf(mod.height + MOD_HEAD, DASHBOARD_ROW)));
  };
  const newMod = { label: words.newMod, title: words.newModTitle, icon: <ModsIcon />, run: () => openModsPanel(true) };
  return (
    <ActionMenu
      trigger={{ label: words.addTitle, icon: <PlusIcon />, text: words.add }}
      items={[
        ...left.map((mod) => { const Icon = MOD_ICONS[mod.icon]; return { label: mod.name, title: mod.description || mod.name, icon: <Icon />, run: () => add(mod) }; }),
        ...(mods?.length && !left.length ? [{ label: words.allPlaced, title: words.allPlaced, icon: <ModsIcon />, run: () => {} }] : []),
        newMod,
      ]}
    />
  );
}

/** The grid of one dashboard: its tiles where they are, the one carried under the pointer and its spot drawn under it. */
function Grid({ tiles, onChange }: { tiles: DashboardTile[]; onChange: (tiles: DashboardTile[]) => void }) {
  const words = t.mods.dashboards;
  const mods = useSessions((s) => s.mods);
  const grid = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  const [carry, setCarry] = useState<Carry | null>(null);

  // a mod deleted since it was put here is left out of the grid, the others close up
  const known = mods ? tiles.filter((tile) => mods.some((mod) => mod.id === tile.mod)) : tiles;
  const narrow = width > 0 && width < NARROW;
  const layout = narrow ? stacked(known) : carry?.started ? carry.layout : known;
  const column = columnWidth(width);

  const scroller = () => grid.current?.closest<HTMLElement>('.cp-dashboards') ?? null;
  const press = (mod: string, resize: boolean, event: ReactPointerEvent<HTMLElement>) => {
    if (narrow || event.button !== 0 || (!resize && (event.target as HTMLElement).closest(INTERACTIVE))) return;
    const start = known.find((tile) => tile.mod === mod);
    if (!start) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { x: event.clientX, y: event.clientY };
    setCarry({ mod, resize, x: event.clientX, y: event.clientY, scroll: scroller()?.scrollTop ?? 0, start, started: resize, dx: 0, dy: 0, layout: known });
  };
  // the pointer's travel since the press, the dashboards' scroll since then counted in
  const follow = (clientX: number, clientY: number) => {
    if (!carry) return;
    const dx = clientX - carry.x, dy = clientY - carry.y + (scroller()?.scrollTop ?? 0) - carry.scroll;
    if (!carry.started && Math.hypot(dx, dy) < CARRY_AFTER) return;
    const { start } = carry;
    const from = tileBox(start, column);
    const layout = carry.resize
      ? resizeTile(known, carry.mod, cellsOf(from.width + dx, column), cellsOf(from.height + dy, DASHBOARD_ROW))
      : moveTile(known, carry.mod, start.x + Math.round(dx / (column + DASHBOARD_GAP)), start.y + Math.round(dy / (DASHBOARD_ROW + DASHBOARD_GAP)));
    setCarry({ ...carry, started: true, dx, dy, layout });
  };
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef(follow);
  latest.current = follow;
  const move = (event: ReactPointerEvent<HTMLElement>) => { pointer.current = { x: event.clientX, y: event.clientY }; follow(event.clientX, event.clientY); };
  // near the top or bottom edge, the dashboards scroll under the carried tile, which keeps up with them
  const carrying = !!carry?.started;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroller reads a ref
  useEffect(() => {
    if (!carrying) return;
    let frame = requestAnimationFrame(function step() {
      const area = scroller(), at = pointer.current;
      if (area && at) {
        const box = area.getBoundingClientRect();
        const push = at.y > box.bottom - SCROLL_EDGE ? (at.y - (box.bottom - SCROLL_EDGE)) / SCROLL_EDGE : at.y < box.top + SCROLL_EDGE ? -((box.top + SCROLL_EDGE) - at.y) / SCROLL_EDGE : 0;
        const before = area.scrollTop;
        if (push) area.scrollTop += Math.round(Math.max(-1, Math.min(1, push)) * SCROLL_SPEED);
        if (area.scrollTop !== before) latest.current(at.x, at.y);
      }
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [carrying]);
  const drop = () => {
    if (carry?.started && carry.layout.some((tile, index) => JSON.stringify(tile) !== JSON.stringify(known[index]))) onChange(carry.layout);
    setCarry(null);
  };

  if (!known.length) {
    return (
      <div className="cp-dashboards__grid cp-dashboards__empty" ref={grid}>
        <p className="cp-dashboards__empty-title">{words.empty}</p>
        <p>{mods?.length ? words.emptyText : words.noMods}</p>
      </div>
    );
  }

  const carried = carry?.started ? carry : null;
  const spot = carried && layout.find((tile) => tile.mod === carried.mod);
  return (
    <div className="cp-dashboards__grid" ref={grid} data-carrying={!!carried || undefined} data-narrow={narrow || undefined} style={{ '--grid-h': `${gridHeight(layout, carried ? SPARE_ROWS : 0)}px` } as CSSProperties}>
      {spot && <div className="cp-dashboards__spot" style={boxVariables(tileBox(spot, column))} />}
      {/* one order in the page whatever the layout: an iframe moved in the DOM loads again */}
      {[...known].sort((a, b) => a.mod.localeCompare(b.mod)).map((tile) => {
        const mod = mods?.find((each) => each.id === tile.mod);
        if (!mod) return null;
        const at = tileBox(layout.find((each) => each.mod === tile.mod) ?? tile, column);
        // the one carried follows the pointer, from where it was
        const box = carried?.mod === tile.mod ? carriedBox(carried, column) : at;
        return (
          <Tile
            key={tile.mod} mod={mod} box={box} carried={carried?.mod === tile.mod} narrow={narrow}
            onPress={(resize, event) => press(tile.mod, resize, event)} onFollow={move} onDrop={drop}
            onTakeOff={() => onChange(removeTile(known, tile.mod))}
          />
        );
      })}
    </div>
  );
}

/** Where the carried tile is drawn: moved by the pointer from where it was, or stretched by it from its corner. */
function carriedBox(carry: Carry, column: number) {
  const from = tileBox(carry.start, column);
  if (!carry.resize) return { ...from, left: from.left + carry.dx, top: from.top + carry.dy };
  const min = tileBox({ x: 0, y: 0, w: 2, h: 3 }, column);
  return { ...from, width: Math.max(min.width, Math.min(from.width + carry.dx, tileBox({ x: 0, y: 0, w: DASHBOARD_COLUMNS - carry.start.x, h: 1 }, column).width)), height: Math.max(min.height, from.height + carry.dy) };
}

/** One mod on the dashboard: its title bar (carries it), its page, and its corner (resizes it). */
function Tile({ mod, box, carried, narrow, onPress, onFollow, onDrop, onTakeOff }: {
  mod: ModInfo; box: { left: number; top: number; width: number; height: number }; carried: boolean; narrow: boolean;
  onPress: (resize: boolean, event: ReactPointerEvent<HTMLElement>) => void; onFollow: (event: ReactPointerEvent<HTMLElement>) => void; onDrop: () => void; onTakeOff: () => void;
}) {
  const words = t.mods;
  const { page, question, refreshNow, refreshing } = useModPage(mod, true);
  const openModSettings = useSessions((s) => s.openModSettings);
  const writer = useSessions((s) => Object.values(s.sessions).find((session) => session.cwd === mod.folder));
  const show = useSessions((s) => s.show);
  const Icon = MOD_ICONS[mod.icon];
  const carry = { onPointerMove: onFollow, onPointerUp: onDrop, onPointerCancel: onDrop };
  // shown, the mod counts as seen at once (useModPage.tsx): the dot stays on its title until the pointer comes over it
  const [fresh, setFresh] = useState(mod.unread);
  useEffect(() => { if (mod.unread) setFresh(true); }, [mod.unread]);
  return (
    <section className="cp-mod cp-dashboards__tile" aria-label={words.dashboards.tileLabel(mod.name)} data-carried={carried || undefined} data-building={mod.draft} style={boxVariables(box)} onPointerEnter={() => setFresh(false)}>
      <header className="cp-mod__head" data-fixed={narrow || undefined} onPointerDown={(event) => onPress(false, event)} {...carry}>
        <span className="cp-mod__icon"><Icon /></span>
        <span className="cp-mod__title">{mod.name}</span>
        {fresh && <span className="cp-dashboards__news" role="img" aria-label={words.unread} title={words.unread} />}
        <div className="cp-detail__controls">
          {!mod.draft && <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={words.reload} title={words.reloadTitle(mod.refresh)} aria-busy={refreshing || undefined} onClick={refreshNow}><RefreshIcon /></button>}
          <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={words.settings} title={words.settingsTitle(mod.name)} onClick={() => openModSettings(mod.id)}><SettingsIcon /></button>
          <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={words.dashboards.takeOff} title={words.dashboards.takeOffTitle(mod.name)} onClick={onTakeOff}><CloseIcon /></button>
        </div>
      </header>
      {mod.draft ? (
        <div className="cp-mod__building" aria-busy="true">
          <p className="cp-mod__building-title">{words.building(writer?.name ?? null)}</p>
          <p>{words.buildingText}</p>
          {writer && <button type="button" className="cp-button" onClick={() => show(writer.id)}>{words.showSession}</button>}
        </div>
      ) : page}
      {!narrow && (
        <span className="cp-dashboards__corner" role="presentation" title={words.dashboards.resize} onPointerDown={(event) => onPress(true, event)} {...carry}>
          <GripIcon />
        </span>
      )}
      {question}
    </section>
  );
}
