import { useMemo } from 'react';
import { roomSessions } from '../room/cast.ts';
import { useSessions, selectAttentionCount, type View } from '../state/sessions.ts';
import { BellIcon, CommandIcon, CrewIcon, DeskIcon, SettingsIcon, SofaIcon, SoundIcon } from './Icons.tsx';
import { PreviewMenu } from './PreviewMenu.tsx';
import { QuotaMeter } from './QuotaMeter.tsx';

const VIEWS = [['salle', 'Bureau', DeskIcon, 'office'], ['repos', 'Salle de repos', SofaIcon, 'lounge']] as const satisfies readonly (readonly [View, string, () => unknown, string])[];
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

  return (
    <header className="cp-header">
      <div className="cp-header__brand">
        <span className="cp-header__signal" data-connection={connection} title={connection === 'live' ? 'Relié au serveur' : 'Pas relié au serveur'} />
        <h1 className="cp-sr-only">Open Space</h1>
        {attention > 0 && <span className="cp-count" role="status" aria-label={`${attention} en attente`}>{attention}</span>}
      </div>
      <nav className="cp-segmented" data-icons aria-label="Pièce">
        {VIEWS.map(([id, label, ViewIcon, room]) => (
          <button key={id} type="button" aria-pressed={view === id} aria-label={`${label} : ${counts[room]} session${counts[room] > 1 ? 's' : ''}`} title={label} onClick={() => setView(id)}>
            <ViewIcon /><span className="cp-header__room-count" aria-hidden="true">({counts[room]})</span>
          </button>
        ))}
      </nav>
      <div className="cp-header__tools">
        {quota && <QuotaMeter quota={quota} />}
        <button type="button" className="cp-button" data-variant="quiet" onClick={() => openCrew(true)} title="Les prénoms et les looks de ton équipe, et le tien">
          <CrewIcon /> Équipe
        </button>
        <button type="button" className="cp-button" data-variant="quiet" onClick={() => openPalette(true)}>
          <CommandIcon /> Commandes <kbd className="cp-kbd">{PALETTE_KEYS}</kbd>
        </button>
        <button
          type="button" className="cp-icon-button" aria-pressed={sound} onClick={toggleSound}
          aria-label={sound ? 'Son activé' : 'Son coupé'}
          title="Un ding quand une session a fini, deux quand elle attend ta réponse, un son grave quand elle plante"
        >
          <SoundIcon muted={!sound} />
        </button>
        <button
          type="button" className="cp-icon-button" aria-pressed={notifications} onClick={toggleNotifications}
          aria-label={notifications ? 'Notifications macOS activées' : 'Notifications macOS coupées'}
          title="Une notification macOS quand une session a fini, attend ta réponse ou plante, et que Open Space n’est pas devant toi"
        >
          <BellIcon muted={!notifications} />
        </button>
        <PreviewMenu />
        <button type="button" className="cp-icon-button" aria-label="Réglages" title="Réglages : tes dossiers, le modèle par défaut, les fêtes…" onClick={() => openSettings(true)}>
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
