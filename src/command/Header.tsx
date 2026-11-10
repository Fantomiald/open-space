import { useEffect, useMemo, useRef } from 'react';
import { plural, t } from '../i18n/index.ts';
import { MODIFIER } from '../lib/platform.ts';
import { roomSessions, type RoomKind } from '../room/cast.ts';
import { seatedRuns } from '../state/automata.ts';
import { arrangementOf, selectOutdatedCount, useSessions, type View } from '../state/sessions.ts';
import { useProjects } from '../state/useProjects.ts';
import { AutomatonIcon, CrewIcon, DeskIcon, FocusIcon, FreeWindowsIcon, GridIcon, SearchIcon, SettingsIcon, SofaIcon } from './Icons.tsx';
import { ModsButton } from './ModsPanel.tsx';
import { QuotaMeter } from './QuotaMeter.tsx';
import { Radio } from './Radio.tsx';

/** The rooms; the server room is always there, as the triggers are made from it (ServerRoomEmpty when it is empty, its orb after). */
const VIEWS = [['salle', DeskIcon, 'office'], ['repos', SofaIcon, 'lounge'], ['automates', AutomatonIcon, 'automata']] as const satisfies readonly (readonly [View, () => unknown, RoomKind])[];
/** The search opens with Cmd+K on a Mac, Ctrl+K elsewhere (App.tsx listens to both); focus mode, with Cmd+. or Ctrl+. */
const PALETTE_KEYS = `${MODIFIER} K`;
const FOCUS_KEYS = `${MODIFIER} .`;
const SETTINGS_KEYS = `${MODIFIER} ,`;

export function Header() {
  const view = useSessions((s) => s.view);
  const setView = useSessions((s) => s.setView);
  const quota = useSessions((s) => s.quota);
  const connection = useSessions((s) => s.connection);
  const openPalette = useSessions((s) => s.openPalette);
  const openSettings = useSessions((s) => s.openSettings);
  const openCrew = useSessions((s) => s.openCrew);
  const automata = useSessions((s) => s.automata);
  const outdated = useSessions(selectOutdatedCount);
  const appReady = useSessions((s) => s.appUpdate?.state === 'ready');
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const windowMode = useSessions((s) => s.windowModeRequest ?? s.windowMode[arrangementOf(s.view)]);
  const requestWindowMode = useSessions((s) => s.requestWindowMode);
  // how many sessions each room holds, the way the rooms themselves place them
  const counts = useMemo(() => {
    const list = Object.values(sessions);
    // the server room: the triggers' runs, and every external run at work, with or without a capsule
    return { office: roomSessions(list, seen, 'office').flat().length, lounge: roomSessions(list, seen, 'lounge').flat().length, automata: roomSessions(list, seen, 'automata').flat().length + seatedRuns(automata).length };
  }, [sessions, seen, automata]);

  const words = t.common.header;
  return (
    <header className="cp-header">
      <div className="cp-header__where">
        {/* only when something is wrong: a live connection is the normal state */}
        {connection !== 'live' && <span className="cp-header__signal" data-connection={connection} title={words.disconnected} />}
        <h1 className="cp-sr-only">Open Space</h1>
        <nav className="cp-segmented" data-icons aria-label={words.rooms}>
          {VIEWS.map(([id, ViewIcon, room]) => (
            <button key={id} type="button" aria-pressed={view === id} aria-label={words.roomSessions(words[room], room === 'automata' ? plural(counts[room], words.automaton, words.automatons) : plural(counts[room], words.session, words.sessions))} title={words[room]} onClick={() => setView(id)}>
              <ViewIcon />{counts[room] > 0 && <span className="cp-header__room-count" aria-hidden="true">{counts[room]}</span>}
            </button>
          ))}
          <span className="cp-header__divider" aria-hidden="true" />
          <button type="button" aria-pressed={view === 'focus'} aria-label={words.focus} title={words.focusTitle(FOCUS_KEYS)} onClick={() => setView('focus')}>
            <FocusIcon />
          </button>
        </nav>
      </div>
      {/* how the windows are laid out: its own pill, as it is not a place (wide screens only, where they can be moved) */}
      <div className="cp-header__windows">
        <div className="cp-segmented" data-icons role="group" aria-label={words.windows}>
          <button type="button" aria-pressed={windowMode === 'grid'} aria-label={words.gridWindows} title={words.gridWindowsTitle} onClick={() => requestWindowMode('grid')}>
            <GridIcon />
          </button>
          <button type="button" aria-pressed={windowMode === 'free'} aria-label={words.freeWindows} title={words.freeWindowsTitle(MODIFIER)} onClick={() => requestWindowMode('free')}>
            <FreeWindowsIcon />
          </button>
        </div>
      </div>
      <ProjectFilter />
      <Radio />
      <div className="cp-header__tools">
        {quota && <QuotaMeter quota={quota} />}
        <ModsButton />
        <button type="button" className="cp-button" data-variant="quiet" onClick={() => openCrew(true)} aria-label={words.crew} title={words.crewTitle}>
          <CrewIcon />
        </button>
        <button type="button" className="cp-button cp-header__search" data-variant="quiet" onClick={() => openPalette(true)} aria-label={words.search} title={words.searchTitle}>
          <SearchIcon /><kbd className="cp-kbd">{PALETTE_KEYS}</kbd>
        </button>
        <button
          type="button" className="cp-icon-button cp-header__settings" data-alert={appReady || outdated > 0} onClick={() => openSettings(true)}
          aria-label={appReady ? words.settingsAppUpdate : outdated ? words.settingsUpdate : words.settings}
          title={appReady ? words.settingsAppUpdate : outdated ? words.settingsUpdate : words.settingsTitle(SETTINGS_KEYS)}
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}

/** One pill per folder the sessions work in, once there are two or more: a click keeps that project's sessions in sight, a second one shows them all. */
function ProjectFilter() {
  const { projects, project } = useProjects();
  const setProject = useSessions((s) => s.setProject);
  // the pill scrolls when the projects overflow it: the one picked stays in sight
  const pill = useRef<HTMLDivElement>(null);
  useEffect(() => { pill.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [project, projects.length]);
  if (projects.length < 2) return null;
  const words = t.common.header;
  const total = projects.reduce((sum, { count }) => sum + count, 0);
  return (
    <div className="cp-header__projects" ref={pill}>
      <div className="cp-segmented" role="group" aria-label={words.projects}>
        <button type="button" aria-pressed={project === ''} title={words.allProjectsTitle} onClick={() => setProject('')}>
          {words.allProjects}<span className="cp-header__room-count">{total}</span>
        </button>
        {projects.map(({ folder, name, count, waiting }) => (
          <button
            key={folder} type="button" aria-pressed={project === folder} title={words.projectTitle(folder, waiting)}
            onClick={() => setProject(project === folder ? '' : folder)}
          >
            {name}<span className="cp-header__room-count" data-waiting={waiting}>{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
