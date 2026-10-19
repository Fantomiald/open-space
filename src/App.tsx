import { useEffect } from 'react';
import { BoardDialog } from './command/BoardDialog.tsx';
import { MetricsDialog } from './command/MetricsDialog.tsx';
import { CommandPalette } from './command/CommandPalette.tsx';
import { CrewDialog } from './command/CrewDialog.tsx';
import { Onboarding } from './command/Onboarding.tsx';
import { SettingsDialog } from './command/SettingsDialog.tsx';
import { Header } from './command/Header.tsx';
import { Launcher } from './command/Launcher.tsx';
import { AttentionAnnouncer, ConnectionBanner, Toasts } from './command/Notices.tsx';
import { RoomView } from './room/RoomView.tsx';
import { Sky } from './room/Sky.tsx';
import { chibiBust, chibiIcon } from './room/chibi.ts';
import { useFestival } from './room/useFestival.ts';
import { Stack } from './command/Stack.tsx';
import { StatusPanel } from './command/StatusPanel.tsx';
import { TrustDialog } from './command/TrustDialog.tsx';
import { defaultFolder } from './lib/format.ts';
import { runningShells } from './state/feed.ts';
import { isRunning } from './state/labels.ts';
import { selectAttentionCount, useSessions } from './state/sessions.ts';
import { tabTitle } from './state/queue.ts';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function App() {
  const view = useSessions((s) => s.view);
  const withMetrics = useSessions((s) => s.preferences.metricsFile !== '');
  const day = useFestival();
  const attention = useSessions(selectAttentionCount);
  const selectedId = useSessions((s) => s.selectedId);
  const openIds = useSessions((s) => s.openIds);
  const live = useSessions((s) => s.connection === 'live');
  const known = useSessions((s) => s.claude !== null);
  const onboarded = useSessions((s) => s.onboarded);

  useEffect(() => { document.title = tabTitle(attention); }, [attention]);

  // the user's own bust: the tab's icon, and the macOS app's (kept by the server, see scripts/macos-app.py)
  const selfLook = useSessions((s) => s.crew.find((member) => member.self)?.look);
  useEffect(() => {
    if (!selfLook) return;
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) { icon.type = 'image/png'; icon.href = chibiIcon(selfLook).toDataURL('image/png'); }
    if (live) useSessions.getState().send({ t: 'avatar', png: chibiBust(selfLook).toDataURL('image/png').split(',')[1] });
  }, [selfLook, live]);

  // what happened in the open session while the tab was hidden is seen once the tab is back
  useEffect(() => {
    const onVisible = () => {
      const state = useSessions.getState();
      if (document.visibilityState === 'visible' && state.selectedId) state.markSeen(state.selectedId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // whether this tab is in front: the server sends no macOS notification while one is (the page rings instead)
  useEffect(() => {
    if (!live) return;
    const report = () => useSessions.getState().send({ t: 'presence', active: document.visibilityState === 'visible' && document.hasFocus() });
    report();
    document.addEventListener('visibilitychange', report);
    window.addEventListener('focus', report);
    window.addEventListener('blur', report);
    return () => {
      document.removeEventListener('visibilitychange', report);
      window.removeEventListener('focus', report);
      window.removeEventListener('blur', report);
    };
  }, [live]);

  // a link to a session (a click on a macOS notification opens the page on #session=<id>) opens it
  useEffect(() => {
    if (!known) return;
    const openLinked = () => {
      const id = /^#session=([\w-]+)$/.exec(location.hash)?.[1];
      if (!id) return;
      history.replaceState(null, '', location.pathname + location.search);
      const state = useSessions.getState();
      if (state.sessions[id]) state.show(id);
    };
    openLinked();
    window.addEventListener('hashchange', openLinked);
    return () => window.removeEventListener('hashchange', openLinked);
  }, [known]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = useSessions.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); state.openPalette(!state.paletteOpen); return; }
      // Cmd+F with a session open searches its thread (the browser's own search does not see folded actions)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && state.selectedId && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        state.openSearch(true);
        document.getElementById('feed-search')?.focus();
        return;
      }
      // Escape, as in Claude Code: interrupts the open session while it works and stops its "!" commands (even from the
      // message field); otherwise, outside a field, it hides the panel. A dialog, or the command suggestions of a field,
      // take it first.
      if (e.key === 'Escape' && !e.isComposing && !document.querySelector('dialog[open]')) {
        const session = state.selectedId ? state.sessions[state.selectedId] : undefined;
        const shells = session ? runningShells(state.logs[session.id] ?? []) : [];
        const working = session && isRunning(session) && session.state !== 'starting';
        if (session && (working || shells.length)) {
          e.preventDefault();
          for (const shellId of shells) state.send({ t: 'stopShell', sessionId: session.id, shellId });
          if (working) state.send({ t: 'interrupt', sessionId: session.id });
          return;
        }
        if (state.zoomedId) { e.preventDefault(); state.zoom(null); return; }
        if (session && !isTyping(e.target)) { state.closeOpen(session.id); return; }
      }
      // Tab, outside a field: the open sessions step aside to see and click the room, and come back (Shift+Tab still
      // moves the focus). In the message field it does nothing, so a Tab pressed while writing neither hides the
      // sessions nor leaves the field; other fields, a dialog or the command suggestions keep it.
      if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.defaultPrevented && state.openIds.length && !document.querySelector('dialog[open]')) {
        const target = e.target instanceof HTMLElement ? e.target : null;
        if (target?.matches('.cp-composer textarea')) {
          e.preventDefault();
          return;
        }
        if (!isTyping(target)) {
          e.preventDefault();
          if (state.stackHidden) {
            state.hideStack(false);
            if (state.selectedId) document.getElementById(`composer-field-${state.selectedId}`)?.focus({ preventScroll: true });
          } else {
            target?.blur();
            state.hideStack(true);
          }
          return;
        }
      }
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target) && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        // Shift+N: a session at once, in the default folder with the default model and mode, opened to write to it; N: the launcher's field
        const { preferences } = state;
        if (e.shiftKey) state.createSession({ cwd: defaultFolder(state.roots, preferences.defaultFolder), model: preferences.model, permissionMode: preferences.permissionMode });
        else state.openNewSession({});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onResize = () => useSessions.getState().fitOpen();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // the first start: nothing else until the user said who they are and where sessions may work
  if (known && !onboarded) return <div className="cp-app"><Onboarding /><Toasts /></div>;

  return (
    <div className="cp-app">
      <Sky festival={day.festival} />
      <Header />
      <ConnectionBanner />
      <main className="cp-main" data-detail={selectedId !== null} data-view={view}>
        <div className="cp-main__content"><RoomView key={`${view}:${day.festival}:${day.guests.join()}:${withMetrics}`} room={view === 'repos' ? 'lounge' : 'office'} day={day}/></div>
        {openIds.length ? <Stack /> : <Launcher />}
      </main>
      <StatusPanel />
      <CommandPalette />
      <CrewDialog />
      <SettingsDialog />
      <BoardDialog />
      <MetricsDialog />
      <TrustDialog />
      <Toasts />
      <AttentionAnnouncer />
    </div>
  );
}
