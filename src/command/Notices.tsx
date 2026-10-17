import { useEffect, useRef, useState } from 'react';
import { attentionQueue } from '../state/queue.ts';
import { useSessions } from '../state/sessions.ts';

const CONNECTION_MESSAGE = {
  connecting: 'Connexion au serveur…',
  stopped: 'Serveur arrêté : lance « npm start » dans le dossier office. Cette page se reconnecte toute seule.',
  unpaired: 'Ce navigateur n’est pas encore autorisé : ouvre le lien « Autoriser un navigateur » affiché dans le terminal (npm start l’ouvre tout seul quand aucun onglet n’est connecté).',
} as const;

export function ConnectionBanner() {
  const connection = useSessions((s) => s.connection);
  const claude = useSessions((s) => s.claude);
  if (connection === 'live') {
    return claude && !claude.found ? <p className="cp-banner" data-tone="error" role="status">Claude Code est introuvable sur cet ordinateur : impossible de lancer des sessions.</p> : null;
  }
  return <p className="cp-banner" data-tone={connection === 'connecting' ? 'neutral' : 'error'} role="status">{CONNECTION_MESSAGE[connection]}</p>;
}

export function Toasts() {
  const toasts = useSessions((s) => s.toasts);
  return (
    <div className="cp-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => <p key={toast.id} className="cp-toast" data-kind={toast.kind}>{toast.text}</p>)}
    </div>
  );
}

/** Screen-reader announcement when a session starts waiting for the user. */
export function AttentionAnnouncer() {
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const [message, setMessage] = useState('');
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const queue = attentionQueue(Object.values(sessions), seen);
    const ids = new Set(queue.map((item) => item.session.id));
    if (known.current) {
      const added = queue.filter((item) => !known.current!.has(item.session.id));
      if (added.length) setMessage(added.map((item) => `${item.session.name} attend ta réponse`).join('. '));
    }
    known.current = ids;
  }, [sessions, seen]);
  return <div className="cp-sr-only" aria-live="polite">{message}</div>;
}
