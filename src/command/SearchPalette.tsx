import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { foldQuery } from '../../shared/search.ts';
import { locale, t } from '../i18n/index.ts';
import { folderName, formatClock } from '../lib/format.ts';
import { nativeView, typedName } from '../state/commands.ts';
import { attentionKind } from '../state/queue.ts';
import { FILTERS, filterCounts, isCommandQuery, searchResults, type Action, type Filter, type Group, type Result } from '../state/search.ts';
import { commandsIn, useSessions } from '../state/sessions.ts';
import { settingEntries } from '../state/settings-index.ts';
import {
  BellIcon, ChartIcon, CommandIcon, CostIcon, CrewIcon, DeskIcon, EnterIcon, FocusIcon, KeyboardIcon, NotesIcon, PlusIcon, SearchIcon, SettingsIcon, SofaIcon, SoundIcon, WeekIcon,
} from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { SessionFace } from './SessionFace.tsx';
import { StateBadge } from './StateBadge.tsx';

/** How long the field waits after a key before it searches the threads again. */
const TYPING_PAUSE_MS = 140;

/** Everything the palette can do on its own, in the order shown when nothing is typed. */
const ACTION_IDS = ['newSession', 'usage', 'rewind', 'settings', 'crew', 'board', 'focus', 'office', 'lounge', 'shortcuts', 'sound', 'notifications'] as const;
type ActionId = (typeof ACTION_IDS)[number];

const ACTION_ICONS: Record<ActionId, () => ReactNode> = {
  newSession: PlusIcon, usage: ChartIcon, rewind: WeekIcon, settings: SettingsIcon, crew: CrewIcon, board: NotesIcon, focus: FocusIcon,
  office: DeskIcon, lounge: SofaIcon, shortcuts: KeyboardIcon, sound: () => <SoundIcon muted={false} />, notifications: () => <BellIcon muted={false} />,
};

/** The search over everything (⌘K): sessions, what was said in their threads, commands, actions and settings. */
export function SearchPalette() {
  const open = useSessions((s) => s.paletteOpen);
  return open ? <PaletteContent /> : null;
}

/** "14:29" today, "Mon 19" this week, "Oct 3" before. */
function when(at: number, now: Date) {
  const date = new Date(at);
  if (date.toDateString() === now.toDateString()) return formatClock(at);
  if (now.getTime() - at < 6 * 86_400_000) return date.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' });
  return date.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

/** The snippet with the words found in it marked. */
function Snippet({ text, start, length }: { text: string; start: number; length: number }) {
  return <>{text.slice(0, start)}<mark>{text.slice(start, start + length)}</mark>{text.slice(start + length)}</>;
}

function PaletteContent() {
  const sessions = useSessions((s) => s.sessions);
  const selected = useSessions((s) => (s.selectedId ? s.sessions[s.selectedId] : undefined));
  const seen = useSessions((s) => s.seen);
  const sound = useSessions((s) => s.sound);
  const notifications = useSessions((s) => s.preferences.notifications);
  const searchResultsState = useSessions((s) => s.searchResults);
  const initial = useSessions((s) => s.paletteQuery);
  const [query, setQuery] = useState(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [target, setTarget] = useState<'selected' | 'new'>(selected ? 'selected' : 'new');
  const commands = useSessions((s) => commandsIn(s, target === 'selected' ? selected?.cwd : undefined));
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const store = useSessions.getState;
  const words = t.search;
  const now = new Date();

  const commandMode = isCommandQuery(query);
  const typed = query.trim();
  const threadQuery = !commandMode && foldQuery(typed).length >= 2 ? typed : '';

  // the threads are searched by the server, a moment after the last key
  useEffect(() => {
    if (!threadQuery) return;
    const timer = window.setTimeout(() => store().searchThreads(threadQuery), TYPING_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [threadQuery, store]);
  const hits = threadQuery && searchResultsState?.query === threadQuery ? searchResultsState.hits : [];
  const searching = threadQuery !== '' && searchResultsState?.query !== threadQuery;

  const actions = useMemo<Action[]>(() => ACTION_IDS.map((id) => {
    const label = id === 'sound' ? (sound ? words.actions.soundOff : words.actions.soundOn)
      : id === 'notifications' ? (notifications ? words.actions.notificationsOff : words.actions.notificationsOn) : words.actions[id];
    const more = id === 'sound' ? words.actionWords.soundOn : id === 'notifications' ? words.actionWords.notificationsOn : words.actionWords[id];
    return { id, label, words: more };
  }), [sound, notifications, words]);
  const settings = useMemo(settingEntries, []);

  const everything = useMemo(
    () => searchResults({ query, filter: 'all', sessions: Object.values(sessions), hits, commands, actions, settings }),
    [query, sessions, hits, commands, actions, settings],
  );
  const counts = filterCounts(everything);
  const groups: Group[] = typed && !commandMode
    ? everything.filter((group) => filter === 'all' || group.id === filter || (filter === 'action' && group.id === 'setting'))
    : searchResults({ query, filter, sessions: Object.values(sessions), hits, commands, actions, settings });
  const flat = groups.flatMap((group) => group.results);
  const current = flat[Math.min(active, flat.length - 1)];

  useEffect(() => { setActive(0); }, [query, filter]);
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, query, filter]);

  const close = () => store().openPalette(false);

  const runCommand = (text: string) => {
    const s = store();
    close();
    // a view of Open Space's own for the open session (/mcp, /context, /usage), rather than Claude Code's line of text
    const view = nativeView(text);
    if (target === 'selected' && selected && view) s.showPanel(view);
    else if (target === 'selected' && selected) s.sendText(selected.id, text);
    else s.openNewSession({ command: text });
  };

  const runAction = (id: string) => {
    const s = store();
    close();
    switch (id as ActionId) {
      case 'newSession': s.openNewSession({}); break;
      case 'usage': s.openSettings(true, 'usage'); break;
      case 'rewind': s.openSettings(true, 'usage', 'rewind'); break;
      case 'settings': s.openSettings(true); break;
      case 'crew': s.openCrew(true); break;
      case 'board': s.openBoard(true); break;
      case 'focus': s.setView('focus'); break;
      case 'office': s.setView('salle'); break;
      case 'lounge': s.setView('repos'); break;
      case 'shortcuts': s.openSettings(true, 'shortcuts'); break;
      case 'sound': s.toggleSound(); break;
      case 'notifications': s.toggleNotifications(); break;
    }
  };

  const pick = (result: Result) => {
    const s = store();
    switch (result.kind) {
      case 'session': close(); s.show(result.session.id); break;
      case 'message': close(); s.show(result.session.id); s.openSearch(true, typed); break;
      case 'setting': close(); s.openSettings(true, result.section, result.row); break;
      case 'action': runAction(result.action); break;
      case 'command': {
        const name = `/${typedName(result.command)}`;
        // a command that takes arguments waits for them in the field
        if (result.command.argumentHint && !/\s/.test(typed)) { setQuery(`${name} `); field.current?.focus(); }
        else runCommand(/\s/.test(typed) && typed.split(/\s/)[0] === name ? typed : name);
        break;
      }
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(index + 1, flat.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter') {
      event.preventDefault();
      // "/command its arguments" goes as typed, even when the list shows another command
      if (commandMode && /\s/.test(typed)) runCommand(typed);
      else if (current) pick(current);
    } else if (event.key === 'Tab' && commandMode) {
      event.preventDefault();
      if (current?.kind === 'command') setQuery(`/${typedName(current.command)} `);
    } else if (event.key === 'Tab' && typed) {
      event.preventDefault();
      const shown = FILTERS.filter((id) => id === 'all' || counts[id] > 0);
      const at = shown.indexOf(filter);
      setFilter(shown[(at + (event.shiftKey ? shown.length - 1 : 1)) % shown.length]);
    }
  };

  const line = (result: Result, index: number) => {
    const attributes = {
      id: `palette-${index}`, role: 'option', 'aria-selected': index === active, 'data-active': index === active, 'data-kind': result.kind,
      className: 'cp-find__row', onMouseMove: () => { if (index !== active) setActive(index); }, onClick: () => pick(result),
    } as const;
    switch (result.kind) {
      case 'session': return (
        <div key={result.key} {...attributes}>
          <SessionFace session={result.session} />
          <span className="cp-find__text">
            <span className="cp-find__line">
              <span className="cp-find__name">{result.session.name}</span>
              {result.session.tag && <span className="cp-tag">{result.session.tag}</span>}
              <StateBadge session={result.session} kind={attentionKind(result.session, seen)} />
              <span className="cp-find__when">{when(result.session.stateSince, now)}</span>
            </span>
            <span className="cp-find__detail"><span className="cp-find__folder">{folderName(result.session.cwd)}</span>{result.session.lastMessage && <> · {result.session.lastMessage}</>}</span>
          </span>
        </div>
      );
      case 'message': return (
        <div key={result.key} {...attributes}>
          <SessionFace session={result.session} />
          <span className="cp-find__text">
            <span className="cp-find__line">
              <span className="cp-find__name">{result.session.name}</span>
              {result.hit.who !== 'agent' && <span className="cp-find__who" data-who={result.hit.who}>{result.hit.who === 'user' ? words.you : words.peer}</span>}
              <span className="cp-find__when">{when(result.hit.at, now)}</span>
            </span>
            <span className="cp-find__detail"><Snippet text={result.hit.snippet} start={result.hit.start} length={result.hit.length} /></span>
          </span>
        </div>
      );
      case 'command': return (
        <div key={result.key} {...attributes}>
          <span className="cp-find__icon"><CommandIcon /></span>
          <span className="cp-find__text">
            <span className="cp-find__line"><span className="cp-find__name cp-find__mono">/{typedName(result.command)}</span>{result.command.argumentHint && <span className="cp-find__hint">{result.command.argumentHint}</span>}</span>
            {result.command.description && <span className="cp-find__detail">{result.command.description}</span>}
          </span>
        </div>
      );
      case 'action': {
        const ActionIcon = ACTION_ICONS[result.action as ActionId];
        return (
          <div key={result.key} {...attributes}>
            <span className="cp-find__icon">{ActionIcon ? <ActionIcon /> : <CostIcon />}</span>
            <span className="cp-find__text"><span className="cp-find__line"><span className="cp-find__name">{result.label}</span></span></span>
          </div>
        );
      }
      case 'setting': return (
        <div key={result.key} {...attributes}>
          <span className="cp-find__icon"><SettingsIcon /></span>
          <span className="cp-find__text"><span className="cp-find__line"><span className="cp-find__name">{result.label}</span><span className="cp-find__when">{result.sectionLabel}</span></span></span>
        </div>
      );
    }
  };

  let index = 0;
  return (
    <Modal title={words.title} onClose={close} look="palette">
      <div className="cp-find" onKeyDown={onKeyDown}>
        <div className="cp-find__field">
          <SearchIcon />
          <label className="cp-sr-only" htmlFor="palette-query">{words.field}</label>
          <input
            ref={field} id="palette-query" value={query} autoFocus autoComplete="off" spellCheck={false}
            placeholder={commandMode ? words.commandPlaceholder : words.placeholder}
            onChange={(event) => setQuery(event.target.value)}
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={current ? `palette-${flat.indexOf(current)}` : undefined}
          />
          <kbd className="cp-kbd">esc</kbd>
        </div>
        {commandMode ? (
          <div className="cp-find__bar">
            <span className="cp-find__label">{words.sendTo}</span>
            <div className="cp-segmented" role="radiogroup" aria-label={words.sendTo}>
              {selected && <button type="button" role="radio" aria-checked={target === 'selected'} onClick={() => setTarget('selected')}>{selected.name}</button>}
              <button type="button" role="radio" aria-checked={target === 'new' || !selected} onClick={() => setTarget('new')}>{words.newSession}</button>
            </div>
          </div>
        ) : typed ? (
          <div className="cp-find__bar" role="tablist" aria-label={words.filtersLabel}>
            {FILTERS.filter((id) => id === 'all' || counts[id] > 0 || id === filter).map((id) => (
              <button key={id} type="button" role="tab" className="cp-chip" aria-selected={filter === id} onClick={() => { setFilter(id); field.current?.focus(); }}>
                {words.filters[id]} <span className="cp-chip__count">{counts[id]}</span>
              </button>
            ))}
            {searching && <span className="cp-find__busy" role="status">{words.searching}</span>}
          </div>
        ) : null}
        <div className="cp-find__list" id="palette-list" role="listbox" aria-label={words.results} ref={list}>
          {groups.map((group) => (
            <section key={group.id} className="cp-find__group" aria-label={words.groups[group.id]}>
              <h3 className="cp-find__heading">{words.groups[group.id]}</h3>
              {group.results.map((result) => line(result, index++))}
            </section>
          ))}
          {flat.length === 0 && !searching && (
            <div className="cp-find__empty">
              <p>{commandMode ? words.noCommand : words.noResult(typed)}</p>
              {!commandMode && <p className="cp-muted">{words.noResultHint}</p>}
            </div>
          )}
        </div>
        <footer className="cp-find__keys">
          <span><kbd className="cp-kbd">↑</kbd><kbd className="cp-kbd">↓</kbd> {words.keys.navigate}</span>
          <span><kbd className="cp-kbd"><EnterIcon /></kbd> {words.keys.open}</span>
          {(typed || commandMode) && <span><kbd className="cp-kbd">tab</kbd> {commandMode ? words.keys.complete : words.keys.filter}</span>}
          <span><kbd className="cp-kbd">esc</kbd> {words.keys.close}</span>
        </footer>
      </div>
    </Modal>
  );
}
