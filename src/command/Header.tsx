import { useMemo } from 'react';
import { plural, t } from '../i18n/index.ts';
import { roomSessions } from '../room/cast.ts';
import { arrangementOf, useSessions, type View } from '../state/sessions.ts';
import { BellIcon, CommandIcon, CrewIcon, DeskIcon, FocusIcon, FreeWindowsIcon, GridIcon, SettingsIcon, SofaIcon, SoundIcon } from './Icons.tsx';
import { PreviewMenu } from './PreviewMenu.tsx';
import { QuotaMeter } from './QuotaMeter.tsx';
import { Radio } from './Radio.tsx';

const VIEWS = [['salle', DeskIcon, 'office'], ['repos', SofaIcon, 'lounge']] as const satisfies readonly (readonly [View, () => unknown, 'office' | 'lounge'])[];
const MODIFIER = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
/** The palette opens with Cmd+K on a Mac, Ctrl+K elsewhere (App.tsx listens to both); focus mode, with Cmd+. or Ctrl+. */
const PALETTE_KEYS = `${MODIFIER} K`;
const FOCUS_KEYS = `${MODIFIER} .`;

export function Header() {
  const view = useSessions((s) => s.view);
  const setView = useSessions((s) => s.setView);
  const quota = useSessions((s) => s.quota);
  const connection = useSessions((s) => s.connection);
  const notifications = useSessions((s) => s.preferences.notifications);
  const toggleNotifications = useSessions((s) => s.toggleNotifications);
  const sound = useSessions((s) => s.sound);
  const toggleSound = useSessions((s) => s.toggleSound);
  const openPalette = useSessions((s) => s.openPalette);
  const openCrew = useSessions((s) => s.openCrew);
  const openSettings = useSessions((s) => s.openSettings);
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const windowMode = useSessions((s) => s.windowModeRequest ?? s.windowMode[arrangementOf(s.view)]);
  const requestWindowMode = useSessions((s) => s.requestWindowMode);
  const windowsOpen = useSessions((s) => s.openIds.length > 0);
  // how many sessions each room holds, the way the rooms themselves place them
  const counts = useMemo(() => {
    const list = Object.values(sessions);
    return { office: roomSessions(list, seen, 'office').flat().length, lounge: roomSessions(list, seen, 'lounge').flat().length };
  }, [sessions, seen]);

  const words = t.common.header;
  return (
    <header className="cp-header">
      <div className="cp-header__where">
        <div className="cp-header__brand">
          <span className="cp-header__signal" data-connection={connection} title={connection === 'live' ? words.connected : words.disconnected} />
          <h1 className="cp-sr-only">Open Space</h1>
        </div>
        <nav className="cp-segmented" data-icons aria-label={words.rooms}>
          {VIEWS.map(([id, ViewIcon, room]) => (
            <button key={id} type="button" aria-pressed={view === id} aria-label={words.roomSessions(words[room], plural(counts[room], words.session, words.sessions))} title={words[room]} onClick={() => setView(id)}>
              <ViewIcon /><span className="cp-header__room-count" aria-hidden="true">({counts[room]})</span>
            </button>
          ))}
          <span className="cp-header__divider" aria-hidden="true" />
          <button type="button" aria-pressed={view === 'focus'} aria-label={words.focus} title={words.focusTitle(FOCUS_KEYS)} onClick={() => setView(view === 'focus' ? 'salle' : 'focus')}>
            <FocusIcon />
          </button>
          {/* the windows in a grid or placed by hand (wide screens only, where they can be moved) */}
          {windowsOpen && (
            <>
              <span className="cp-header__divider cp-header__windows" aria-hidden="true" />
              <button type="button" className="cp-header__windows" aria-pressed={windowMode === 'grid'} aria-label={words.gridWindows} title={words.gridWindowsTitle} onClick={() => requestWindowMode('grid')}>
                <GridIcon />
              </button>
              <button type="button" className="cp-header__windows" aria-pressed={windowMode === 'free'} aria-label={words.freeWindows} title={words.freeWindowsTitle(MODIFIER)} onClick={() => requestWindowMode('free')}>
                <FreeWindowsIcon />
              </button>
            </>
          )}
        </nav>
      </div>
      <Radio />
      <div className="cp-header__tools">
        {quota && <QuotaMeter quota={quota} />}
        <button type="button" className="cp-button" data-variant="quiet" onClick={() => openCrew(true)} title={words.crewTitle}>
          <CrewIcon /> <span className="cp-header__label">{words.crew}</span>
        </button>
        <button type="button" className="cp-button" data-variant="quiet" onClick={() => openPalette(true)}>
          <CommandIcon /> <span className="cp-header__label">{words.commands}</span> <kbd className="cp-kbd">{PALETTE_KEYS}</kbd>
        </button>
        <button
          type="button" className="cp-icon-button" aria-pressed={sound} onClick={toggleSound}
          aria-label={sound ? words.soundOn : words.soundOff}
          title={words.soundTitle}
        >
          <SoundIcon muted={!sound} />
        </button>
        <button
          type="button" className="cp-icon-button" aria-pressed={notifications} onClick={toggleNotifications}
          aria-label={notifications ? words.notificationsOn : words.notificationsOff}
          title={words.notificationsTitle}
        >
          <BellIcon muted={!notifications} />
        </button>
        <PreviewMenu />
        <button type="button" className="cp-icon-button" aria-label={words.settings} title={words.settingsTitle} onClick={() => openSettings(true)}>
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
