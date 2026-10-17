import { useMemo } from 'react';
import { plural, t } from '../i18n/index.ts';
import { roomSessions } from '../room/cast.ts';
import { useSessions, selectAttentionCount, type View } from '../state/sessions.ts';
import { BellIcon, CommandIcon, CrewIcon, DeskIcon, SettingsIcon, SofaIcon, SoundIcon } from './Icons.tsx';
import { PreviewMenu } from './PreviewMenu.tsx';
import { QuotaMeter } from './QuotaMeter.tsx';

const VIEWS = [['salle', DeskIcon, 'office'], ['repos', SofaIcon, 'lounge']] as const satisfies readonly (readonly [View, () => unknown, 'office' | 'lounge'])[];
/** The palette opens with Cmd+K on a Mac, Ctrl+K elsewhere (App.tsx listens to both). */
const PALETTE_KEYS = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';

export function Header() {
  const view = useSessions((s) => s.view);
  const setView = useSessions((s) => s.setView);
  const attention = useSessions(selectAttentionCount);
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
  // how many sessions each room holds, the way the rooms themselves place them
  const counts = useMemo(() => {
    const list = Object.values(sessions);
    return { office: roomSessions(list, seen, 'office').flat().length, lounge: roomSessions(list, seen, 'lounge').flat().length };
  }, [sessions, seen]);

  const words = t.common.header;
  return (
    <header className="cp-header">
      <div className="cp-header__brand">
        <span className="cp-header__signal" data-connection={connection} title={connection === 'live' ? words.connected : words.disconnected} />
        <h1 className="cp-sr-only">Open Space</h1>
        {attention > 0 && <span className="cp-count" role="status" aria-label={words.waiting(attention)}>{attention}</span>}
      </div>
      <nav className="cp-segmented" data-icons aria-label={words.rooms}>
        {VIEWS.map(([id, ViewIcon, room]) => (
          <button key={id} type="button" aria-pressed={view === id} aria-label={words.roomSessions(words[room], plural(counts[room], words.session, words.sessions))} title={words[room]} onClick={() => setView(id)}>
            <ViewIcon /><span className="cp-header__room-count" aria-hidden="true">({counts[room]})</span>
          </button>
        ))}
      </nav>
      <div className="cp-header__tools">
        {quota && <QuotaMeter quota={quota} />}
        <button type="button" className="cp-button" data-variant="quiet" onClick={() => openCrew(true)} title={words.crewTitle}>
          <CrewIcon /> {words.crew}
        </button>
        <button type="button" className="cp-button" data-variant="quiet" onClick={() => openPalette(true)}>
          <CommandIcon /> {words.commands} <kbd className="cp-kbd">{PALETTE_KEYS}</kbd>
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
