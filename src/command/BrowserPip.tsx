import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { browserId, lanesOf, sessionOfBrowser } from '../../shared/browser.ts';
import type { SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { drivesBrowser } from '../state/browser.ts';
import { buildFeed } from '../state/feed.ts';
import { isRunning } from '../state/labels.ts';
import { fitPip, placePip, resizePip } from '../state/pip.ts';
import type { Box } from '../state/room-frame.ts';
import { useSessions } from '../state/sessions.ts';
import type { Edge } from '../state/windows.ts';
import { BrowserScreen, FormatSwitch, LanePicker, useLanes } from './BrowserView.tsx';
import { boxVariables } from './boxes.ts';
import { FreeHandles } from './FreeHandles.tsx';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, MaximizeIcon } from './Icons.tsx';
import { INTERACTIVE } from './useWindowDrag.ts';

const NO_EVENTS: never[] = [];
/** how far a press on its title bar goes before it carries the window rather than clicking a name */
const CARRY_AFTER = 4;
const surface = () => ({ width: window.innerWidth, height: window.innerHeight });
/** where the user left it, and folded or not */
interface Placement { box: Box | null; folded: boolean }

/**
 * A browser of a session floating over the office, picture in picture: carried by its title bar, resized by its edges
 * and corners (the page keeps its proportions), folded to its title bar. The names above it switch to another browser:
 * its session's own or a tester's, of any session with one running.
 */
export function BrowserPip() {
  const pip = useSessions((s) => s.pip);
  const session = useSessions((s) => (s.pip ? s.sessions[s.pip.sessionId] : undefined));
  const closePip = useSessions((s) => s.closePip);
  // its session's window shows its browsers already
  const inView = useSessions((s) => !!s.pip && s.selectedId === s.pip.sessionId && s.panelView === 'browser');
  useEffect(() => { if (pip && !session && useSessions.getState().connection === 'live') closePip(); }, [pip, session, closePip]);
  // leaving a session's browser view (for its conversation, another view or another session), its browser floats on
  useEffect(() => useSessions.subscribe((s, before) => {
    const left = before.panelView === 'browser' ? before.selectedId : null;
    if (!left || (s.panelView === 'browser' && s.selectedId === left) || s.pip?.sessionId === left) return;
    const lanes = lanesOf(Object.keys(s.browsers), left);
    if (!lanes.length) return;
    const chosen = s.browserLanes[left] ?? 0;
    s.openPip({ sessionId: left, lane: lanes.includes(chosen) ? chosen : lanes[0] });
  }), []);
  return pip && session && !inView ? <Pip session={session} lane={pip.lane} /> : null;
}

function Pip({ session, lane }: { session: SessionInfo; lane: number }) {
  const browser = useSessions((s) => s.browsers[browserId(session.id, lane)]);
  // the sessions with a browser running, and this one, in the order of the sessions: the names stay in place when one is picked
  const shownSessions = useSessions((s) => {
    const running = new Set(Object.keys(s.browsers).map(sessionOfBrowser));
    return Object.keys(s.sessions).filter((id) => id === session.id || running.has(id)).join(',');
  });
  const { openPip, dismissPip, dockPip } = useSessions.getState();
  const words = t.session.browser;
  const format = browser?.format ?? 'desktop';
  const [placement, setPlacement] = useState<Placement>(() => readPreference<Placement>('pip-placement', { box: null, folded: false }));
  const box = placement.box ?? fitPip(null, format, surface());
  const place = (next: Placement) => { setPlacement(next); writePreference('pip-placement', next); };
  const carried = useRef<{ start: Box; x: number; y: number; edge: Edge | null; started: boolean } | null>(null);
  const [moving, setMoving] = useState(false);

  // a new format: the page's proportions change, the window follows
  const fitted = useRef(format);
  useEffect(() => {
    if (fitted.current === format) return;
    fitted.current = format;
    place({ ...placement, box: fitPip(box, format, surface()) });
  });
  // a smaller window: it stays within reach
  useEffect(() => {
    const keep = () => setPlacement((now) => (now.box ? { ...now, box: placePip(now.box, surface()) } : now));
    window.addEventListener('resize', keep);
    return () => window.removeEventListener('resize', keep);
  }, []);

  // its agent at work in this browser, as in its window
  const events = useSessions((s) => (lane === 0 ? (s.logs[session.id] ?? NO_EVENTS) : NO_EVENTS));
  const running = isRunning(session);
  const driving = useMemo(() => running && lane === 0 && drivesBrowser(buildFeed(events).items), [events, running, lane]);

  // the names are buttons but carry it too: it only moves once the pointer has gone a little way, else they are clicked
  const grab = (edge: Edge | null, event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || (!edge && target.closest(INTERACTIVE) && !target.closest('.cp-pip__lanes'))) return;
    carried.current = { start: box, x: event.clientX, y: event.clientY, edge, started: false };
  };
  const drag = (event: ReactPointerEvent<HTMLElement>) => {
    const from = carried.current;
    if (!from) return;
    const dx = event.clientX - from.x, dy = event.clientY - from.y;
    if (!from.started) {
      if (!from.edge && Math.hypot(dx, dy) < CARRY_AFTER) return;
      from.started = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setMoving(true);
    }
    const next = from.edge ? resizePip(from.start, from.edge, dx, dy, format, surface()) : placePip({ ...from.start, left: from.start.left + dx, top: from.start.top + dy }, surface());
    setPlacement((now) => ({ ...now, box: next }));
  };
  const drop = () => {
    const from = carried.current;
    carried.current = null;
    if (!from?.started) return;
    setMoving(false);
    setPlacement((now) => { writePreference('pip-placement', now); return now; });
  };

  return (
    <section
      className="cp-pip" aria-label={words.pipLabel(session.name)} data-folded={placement.folded} data-moving={moving}
      style={boxVariables(box)}
      onPointerMove={drag} onPointerUp={drop} onPointerCancel={drop}
    >
      <header className="cp-pip__head" onPointerDown={(event) => grab(null, event)} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest(INTERACTIVE)) place({ ...placement, folded: !placement.folded }); }}>
        <div className="cp-browser__lanes cp-pip__lanes" role="tablist" aria-label={words.lanes}>
          {shownSessions.split(',').map((id, at) => (
            <SessionLanes key={id} sessionId={id} first={at === 0} shown={id === session.id ? lane : null} onPick={(each) => openPip({ sessionId: id, lane: each })} />
          ))}
        </div>
        {!placement.folded && <FormatSwitch session={session} lane={lane} format={browser?.format} />}
        <button type="button" className="cp-icon-button" data-size="small" aria-label={placement.folded ? words.unfold : words.fold} title={placement.folded ? words.unfold : words.fold} onClick={() => place({ ...placement, folded: !placement.folded })}>
          {placement.folded ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </button>
        <button type="button" className="cp-icon-button" data-size="small" aria-label={words.dock} title={words.dockTitle(session.name)} onClick={dockPip}><MaximizeIcon /></button>
        <button type="button" className="cp-icon-button" data-size="small" aria-label={words.pipClose} title={words.pipClose} onClick={dismissPip}><CloseIcon /></button>
      </header>
      {!placement.folded && <BrowserScreen key={browserId(session.id, lane)} session={session} lane={lane} driving={driving} />}
      {!placement.folded && <FreeHandles onPull={grab} />}
    </section>
  );
}

/** A session's browsers, after a line but for the first. */
function SessionLanes({ sessionId, first, shown, onPick }: { sessionId: string; first: boolean; shown: number | null; onPick: (lane: number) => void }) {
  const session = useSessions((s) => s.sessions[sessionId]);
  if (!session) return null;
  return <>{!first && <span className="cp-pip__divider" aria-hidden="true" />}<Lanes session={session} shown={shown} onPick={onPick} /></>;
}

function Lanes({ session, shown, onPick }: { session: SessionInfo; shown: number | null; onPick: (lane: number) => void }) {
  return <LanePicker lanes={useLanes(session)} shown={shown} onPick={onPick} />;
}
