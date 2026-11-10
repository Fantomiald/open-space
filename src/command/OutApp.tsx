import { useEffect } from 'react';
import { announceOut, tellSeen } from '../net/out.ts';
import type { OutTarget } from '../state/out.ts';
import { isRunning } from '../state/labels.ts';
import { useSessions } from '../state/sessions.ts';
import { OutBrowser } from './BrowserPip.tsx';
import { CopyOnSelect } from './CopyOnSelect.tsx';
import { Detail } from './Detail.tsx';
import { ModWindow } from './ModWindows.tsx';
import { ConnectionBanner } from './Notices.tsx';
import { usePageStyle } from './usePageStyle.ts';

const NO_SPOT = { left: 0, top: 0 };

/**
 * The page of a window taken out of Open Space (src/state/out.ts): that session, mod or browser alone, filling the
 * window. It closes once what it shows is gone (a session switched off, a mod deleted).
 */
export function OutApp({ target }: { target: OutTarget }) {
  usePageStyle();
  const live = useSessions((s) => s.connection === 'live');
  // the server has listed the sessions and the mods: one missing is gone
  const known = useSessions((s) => s.claude !== null);
  const session = useSessions((s) => (target.kind === 'mod' ? undefined : s.sessions[target.sessionId]));
  const mod = useSessions((s) => (target.kind === 'mod' ? s.mods?.find((each) => each.id === target.modId) : undefined));
  const modsKnown = useSessions((s) => s.mods !== null);
  const gone = live && known && (target.kind === 'mod' ? modsKnown && !mod : !session);

  useEffect(() => announceOut(target), [target]);
  useEffect(() => { if (gone) window.close(); }, [gone]);
  // the session this window shows is the one the keyboard and its views go to
  useEffect(() => { if (target.kind === 'session') useSessions.getState().focus(target.sessionId); }, [target]);
  // what is seen here is seen in Open Space's page too
  useEffect(() => {
    if (target.kind !== 'session') return;
    return useSessions.subscribe((s, before) => { if (s.seen[target.sessionId] !== before.seen[target.sessionId]) tellSeen(target.sessionId); });
  }, [target]);
  const name = session?.name ?? mod?.name;
  useEffect(() => { document.title = name ? `${name} · Open Space` : 'Open Space'; }, [name]);

  // Escape, as in Open Space: back to the conversation from another view, then interrupts the session at work
  useEffect(() => {
    if (target.kind !== 'session') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      const state = useSessions.getState();
      const current = state.sessions[target.sessionId];
      if (!current) return;
      if (state.asides[current.id]) { e.preventDefault(); state.send({ t: 'asideClose', sessionId: current.id }); return; }
      if (state.panelView !== 'thread' && !(e.target instanceof Element && e.target.closest('.cp-files'))) { e.preventDefault(); state.showPanel('thread'); return; }
      if (isRunning(current) && current.state !== 'starting') { e.preventDefault(); state.send({ t: 'interrupt', sessionId: current.id }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target]);

  return (
    <div className="cp-out" data-kind={target.kind}>
      <ConnectionBanner />
      {target.kind === 'session' && session && <Detail sessionId={session.id} detached />}
      {target.kind === 'mod' && mod && <ModWindow mod={mod} depth={0} spot={NO_SPOT} detached />}
      {target.kind === 'browser' && session && <OutBrowser session={session} lane={target.lane} />}
      <CopyOnSelect />
    </div>
  );
}
