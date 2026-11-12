import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { isModStoreName, type ModInfo } from '../../shared/mods.ts';
import type { SessionState } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { awaitModEnv, costsForMods, isModData, MOD_TOKENS, onModStore, quotaForMods, sessionsForMods, type ModData } from '../state/mods.ts';
import { useSessions, type CommandPostState } from '../state/sessions.ts';
import { Modal } from './Modal.tsx';

/** what a mod watching the costs gets again, at most this often */
const COSTS_EVERY_MS = 60_000;
/** the refresh button turns at least this long, so a quick refresh is still seen, and at most this long */
const REFRESH_SHOWN_MS = 600;
const REFRESH_CAP_MS = 10_000;
/** a refresh that runs a trigger turns while its run works, at most this long */
const RUN_CAP_MS = 30 * 60_000;
/** a run still at it: the page loads again once it leaves these */
const RUN_BUSY: readonly SessionState[] = ['starting', 'work', 'perm'];

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
 * A mod's page wherever it is shown (its window, a dashboard's tile): the sandboxed frame (an origin of its own, see
 * server/http.ts), the look of the user's windows and the data the page asks for (the kit's OpenSpace.watch), its
 * refresh (the button, and the pace of its settings while `paced`), and the trigger it asks to start. The button runs
 * the mod's refresh trigger when its settings name one: it turns while the run works, then the page loads again.
 */
export function useModPage(mod: ModInfo, paced: boolean) {
  const words = t.mods;
  const send = useSessions((s) => s.send);
  const frame = useRef<HTMLIFrameElement>(null);
  const [loads, setLoads] = useState(0);
  // the height its page says its content needs
  const [fit, setFit] = useState<number | null>(null);
  // the trigger its page asked to start, until the user says yes or no
  const [asked, setAsked] = useState<{ id: string; name: string } | null>(null);
  // set while the page refreshes itself (the kit's OpenSpace.onRefresh): a refresh tells it rather than loading it again
  const pageRefresh = useRef<{ run: () => void; replies: boolean } | null>(null);
  const refresh = () => (pageRefresh.current ? pageRefresh.current.run() : setLoads((count) => count + 1));
  // the refresh asked by the button, until the page loaded again or said it refreshed itself
  const [refreshing, setRefreshing] = useState(false);
  const refreshed = useRef<() => void>(() => {});
  const refreshTrigger = useSessions((s) => s.triggers.triggers.find((each) => each.id === mod.refreshTrigger) ?? null);
  // stops following the run the button started, when it is shown no more
  const stopRun = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRun.current?.(), []);
  const runThenReload = (id: string) => {
    const since = Date.now();
    setRefreshing(true);
    let runId: string | null = null;
    const end = () => {
      stop();
      clearTimeout(cap);
      stopRun.current = null;
      setRefreshing(false);
      refresh();
    };
    // the firing asked for, then the session it started, until that session no longer works
    const follow = (s: CommandPostState) => {
      const run = runId ? s.triggers.runs.find((each) => each.id === runId) : s.triggers.runs.find((each) => each.triggerId === id && each.source === 'manual' && each.at >= since - 1000);
      if (!run) return;
      runId = run.id;
      if (run.outcome === 'queued') return;
      if (run.outcome !== 'started' || !run.sessionId) return end();
      const state = s.sessions[run.sessionId]?.state;
      if (state && !RUN_BUSY.includes(state)) end();
    };
    const stop = useSessions.subscribe(follow);
    const cap = setTimeout(end, RUN_CAP_MS);
    stopRun.current = () => { stop(); clearTimeout(cap); };
    useSessions.getState().runTrigger(id);
  };
  const refreshNow = () => {
    if (refreshing) return;
    if (refreshTrigger) return runThenReload(refreshTrigger.id);
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

  // the pace set in its settings, while it is shown
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh reads refs and setters only
  useEffect(() => {
    if (!mod.refresh || mod.draft || !paced) return;
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, mod.refresh * 1000);
    return () => clearInterval(timer);
  }, [mod.refresh, mod.draft, paced]);

  // its data changed while it was not shown: now it is seen
  useEffect(() => { if (mod.unread) send({ t: 'modSeen', id: mod.id }); }, [mod.unread, mod.id, send]);

  // what the page asks for, told again whenever it changes, until the page stops asking or it is no longer shown
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

  const page = (
    <iframe
      key={`${mod.version}:${loads}`} ref={frame} className="cp-mod__page" title={mod.name} src={`${mod.url}?v=${mod.version}`}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
      allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write"
      referrerPolicy="no-referrer" onLoad={() => refreshed.current()}
    />
  );
  const question = asked && createPortal(
    <Modal title={words.runQuestion(asked.name)} onClose={() => setAsked(null)}>
      <p className="cp-muted">{words.runText(mod.name)}</p>
      <div className="cp-form__actions">
        <button type="button" className="cp-button" onClick={() => setAsked(null)}>{words.cancel}</button>
        <button type="button" className="cp-button" data-variant="primary" data-autofocus onClick={() => { useSessions.getState().runTrigger(asked.id); setAsked(null); }}>{words.run}</button>
      </div>
    </Modal>,
    document.body,
  );
  const refreshTitle = refreshTrigger ? words.rerunTitle(refreshTrigger.name) : words.reloadTitle(mod.refresh);
  return { page, question, fit, refreshNow, refreshing, refreshTitle };
}
