import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { browserId, lanesOf, shownFormat, type BrowserAction, type BrowserFormat, type BrowserInput, type MouseButton } from '../../shared/browser.ts';
import type { SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { IS_WINDOWS } from '../lib/platform.ts';
import { modifiersOf, pictureFraction, testersAtWork } from '../state/browser.ts';
import { useSessions } from '../state/sessions.ts';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DeskIcon, PhoneIcon, PipIcon, PowerIcon, RefreshIcon } from './Icons.tsx';

const BUTTONS = ['left', 'middle', 'right'] as const;
/** pointer moves sent at most this often: enough for hovers, without flooding the socket */
const MOVE_EVERY_MS = 40;

/** each tester's first name by browserId, kept once it has finished (its browser stays to look at) */
const testerNames = new Map<string, string>();

/** The lanes of the session's browsers to pick from (its own always), each with its name and whether its tester is at work. */
export function useLanes(session: SessionInfo) {
  const lanes = useSessions((s) => lanesOf(Object.keys(s.browsers), session.id).join(','));
  const running = lanes ? lanes.split(',').map(Number) : [];
  const atWork = testersAtWork(session.subagents);
  for (const [lane, name] of Object.entries(atWork)) testerNames.set(browserId(session.id, Number(lane)), name);
  return [...new Set([0, ...running])].map((lane) => ({
    lane,
    name: lane ? (testerNames.get(browserId(session.id, lane)) ?? t.session.browser.tester(lane)) : session.name,
    running: running.includes(lane),
    live: lane > 0 && lane in atWork,
  }));
}

/** The session's browsers as buttons, the one shown pressed. */
export function LanePicker({ lanes, shown, onPick }: { lanes: ReturnType<typeof useLanes>; shown: number | null; onPick: (lane: number) => void }) {
  return lanes.map((each) => (
    <button key={each.lane} type="button" role="tab" aria-selected={each.lane === shown} data-off={!each.running} data-live={each.live} onClick={() => onPick(each.lane)}>{each.name}</button>
  ));
}

/** The screen the browser's pages lay out for: a computer's (1920 × 1080) or a phone's. */
export function FormatSwitch({ session, lane, format }: { session: SessionInfo; lane: number; format: BrowserFormat | undefined }) {
  const send = useSessions((s) => s.send);
  const words = t.session.browser;
  const pick = (next: BrowserFormat) => send({ t: 'browser', sessionId: session.id, lane, action: { kind: 'format', format: next } });
  return (
    <div className="cp-browser__formats" role="group" aria-label={words.format}>
      <button type="button" className="cp-icon-button" data-size="small" aria-pressed={format === 'desktop'} aria-label={words.desktop} title={words.desktopTitle} disabled={!format} onClick={() => pick('desktop')}><DeskIcon /></button>
      <button type="button" className="cp-icon-button" data-size="small" aria-pressed={format === 'mobile'} aria-label={words.mobile} title={words.mobileTitle} disabled={!format} onClick={() => pick('mobile')}><PhoneIcon /></button>
    </div>
  );
}

/**
 * The session's browsers in place of its thread: its own, and one per tester it launched (a sub-agent with a browser of
 * its own), picked above the page. Its own is shown unless the user picks another.
 */
export function BrowserView({ session, driving }: { session: SessionInfo; driving: boolean }) {
  const lanes = useLanes(session);
  const chosen = useSessions((s) => s.browserLanes[session.id] ?? 0);
  const showLane = useSessions((s) => s.showBrowserLane);
  const running = lanes.filter((each) => each.running).map((each) => each.lane);
  const lane = running.includes(chosen) ? chosen : running.includes(0) || !running.length ? 0 : running[0];
  return (
    <BrowserPane key={lane} session={session} lane={lane} driving={driving && lane === 0}>
      {lanes.length > 1 && (
        <div className="cp-browser__lanes" role="tablist" aria-label={t.session.browser.lanes}>
          <LanePicker lanes={lanes} shown={lane} onPick={(each) => showLane(session.id, each)} />
        </div>
      )}
    </BrowserPane>
  );
}

/** One browser of the session with its address bar, its tabs and the page. */
function BrowserPane({ session, lane, driving, children }: { session: SessionInfo; lane: number; driving: boolean; children: ReactNode }) {
  const send = useSessions((s) => s.send);
  const browser = useSessions((s) => s.browsers[browserId(session.id, lane)]);
  const available = useSessions((s) => s.browserAvailable);
  const openPip = useSessions((s) => s.openPip);
  const words = t.session.browser;
  const tab = browser?.tabs.find((each) => each.id === browser.active);
  const [address, setAddress] = useState('');
  const [typing, setTyping] = useState(false);
  useEffect(() => { if (!typing) setAddress(tab && tab.url !== 'about:blank' ? tab.url : ''); }, [tab, typing]);
  const act = (action: BrowserAction) => send({ t: 'browser', sessionId: session.id, lane, action });

  return (
    <section className="cp-panel-view cp-browser" aria-label={words.label}>
      <header className="cp-panel-view__head cp-browser__bar">
        <div className="cp-browser__nav">
          <button type="button" className="cp-icon-button" data-size="small" aria-label={words.back} title={words.back} disabled={!browser} onClick={() => act({ kind: 'back' })}><ChevronLeftIcon /></button>
          <button type="button" className="cp-icon-button" data-size="small" aria-label={words.forward} title={words.forward} disabled={!browser} onClick={() => act({ kind: 'forward' })}><ChevronRightIcon /></button>
          <button type="button" className="cp-icon-button" data-size="small" aria-label={words.reload} title={words.reload} disabled={!browser} onClick={() => act({ kind: 'reload' })}><RefreshIcon /></button>
        </div>
        <form className="cp-browser__address" onSubmit={(event) => { event.preventDefault(); if (address.trim()) act({ kind: 'navigate', url: address }); setTyping(false); event.currentTarget.querySelector('input')?.blur(); }}>
          <label className="cp-sr-only" htmlFor={`browser-address-${session.id}`}>{words.address}</label>
          <input
            id={`browser-address-${session.id}`} value={address} placeholder={words.addressPlaceholder} spellCheck={false} autoComplete="off" disabled={!available}
            onChange={(event) => setAddress(event.target.value)} onFocus={(event) => { setTyping(true); event.target.select(); }} onBlur={() => setTyping(false)}
            onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); event.currentTarget.blur(); } }}
          />
        </form>
        <FormatSwitch session={session} lane={lane} format={browser && shownFormat(browser)} />
        <button type="button" className="cp-icon-button" data-size="small" aria-label={words.pip} title={words.pipTitle} disabled={!available} onClick={() => openPip({ sessionId: session.id, lane })}><PipIcon /></button>
        {browser && <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={words.close} title={words.closeTitle} onClick={() => act({ kind: 'stop' })}><PowerIcon /></button>}
      </header>
      {children}
      {browser && browser.tabs.length > 1 && (
        <div className="cp-browser__tabs" role="tablist" aria-label={words.tabs}>
          {browser.tabs.map((each) => (
            <div key={each.id} className="cp-browser__tab" data-active={each.id === browser.active}>
              <button type="button" role="tab" aria-selected={each.id === browser.active} title={each.url} onClick={() => act({ kind: 'tab', id: each.id })}>{each.title || words.untitled}</button>
              <button type="button" className="cp-browser__tab-close" aria-label={words.closeTab(each.title || words.untitled)} onClick={() => act({ kind: 'closeTab', id: each.id })}><CloseIcon /></button>
            </div>
          ))}
        </div>
      )}
      <BrowserScreen session={session} lane={lane} driving={driving} />
    </section>
  );
}

/**
 * The page of one browser of the session as its pictures come (server/browser.ts), and the user's clicks, scrolls and
 * keys passed on to it. The same browser its Playwright tools drive, so both see what the other does.
 */
export function BrowserScreen({ session, lane, driving }: { session: SessionInfo; lane: number; driving: boolean }) {
  const send = useSessions((s) => s.send);
  const browser = useSessions((s) => s.browsers[browserId(session.id, lane)]);
  const available = useSessions((s) => s.browserAvailable);
  const words = t.session.browser;
  const tab = browser?.tabs.find((each) => each.id === browser.active);
  // a browser seen running then closed: its picture stream is over, it comes back on demand
  const [seen, setSeen] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => { if (browser) setSeen(true); }, [browser]);
  // a tester's browser is only ever launched by the tester
  const closed = (seen || lane > 0) && !browser;
  const picture = useRef<HTMLImageElement>(null);
  const lastMove = useRef(0);
  const pressed = useRef<MouseButton>('none');

  const input = (event: BrowserInput) => send({ t: 'browserInput', sessionId: session.id, lane, input: event });
  const point = (event: { clientX: number; clientY: number }) => {
    const image = picture.current;
    return image ? pictureFraction(image.getBoundingClientRect(), { width: image.naturalWidth, height: image.naturalHeight }, { x: event.clientX, y: event.clientY }) : null;
  };
  const mouse = (event: PointerEvent<HTMLImageElement>, type: 'mousePressed' | 'mouseReleased' | 'mouseMoved', button: MouseButton, clicks: number) => {
    const at = point(event);
    if (at) input({ kind: 'mouse', type, ...at, button, clicks, modifiers: modifiersOf(event) });
  };
  const key = (event: KeyboardEvent<HTMLDivElement>, type: 'keyDown' | 'keyUp') => {
    // ⌘V (Ctrl+V on Windows) comes as a paste event, with the text of the computer's clipboard
    if ((event.metaKey || (IS_WINDOWS && event.ctrlKey)) && event.key.toLowerCase() === 'v') return;
    event.preventDefault();
    event.stopPropagation();
    input({ kind: 'key', type, key: event.key, code: event.code, modifiers: modifiersOf(event) });
  };
  const reopen = () => { setSeen(false); setGeneration(generation + 1); };

  return (
    // focusable, so the keys typed while it is in focus go to the page
    <div
      className="cp-browser__screen" role="application" tabIndex={0} aria-label={words.view} data-driving={driving}
      onKeyDown={(event) => key(event, 'keyDown')} onKeyUp={(event) => key(event, 'keyUp')}
      onPaste={(event) => { const text = event.clipboardData.getData('text'); if (text) { event.preventDefault(); input({ kind: 'text', text }); } }}
    >
      {!available ? <p className="cp-browser__note">{words.missing}</p>
        : closed ? (
          <div className="cp-browser__note">
            <p>{words.closed}</p>
            {lane === 0 && <button type="button" className="cp-button" onClick={reopen}>{words.reopen}</button>}
          </div>
        ) : (
          <>
            <img
              key={generation} ref={picture} className="cp-browser__picture" src={`/browser/${session.id}/view?lane=${lane}&v=${generation}`} alt={tab?.title ?? ''} draggable={false}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.parentElement?.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                pressed.current = BUTTONS[event.button] ?? 'left';
                mouse(event, 'mousePressed', pressed.current, event.detail || 1);
              }}
              onPointerUp={(event) => { mouse(event, 'mouseReleased', pressed.current, event.detail || 1); pressed.current = 'none'; }}
              onPointerMove={(event) => {
                if (event.timeStamp - lastMove.current < MOVE_EVERY_MS) return;
                lastMove.current = event.timeStamp;
                mouse(event, 'mouseMoved', pressed.current, 0);
              }}
              onWheel={(event) => { const at = point(event); if (at) input({ kind: 'wheel', ...at, dx: event.deltaX, dy: event.deltaY }); }}
              onContextMenu={(event) => event.preventDefault()}
            />
            {!browser && <p className="cp-browser__note">{words.starting}</p>}
            {driving && <span className="cp-browser__driving">{words.driving(session.name)}</span>}
          </>
        )}
    </div>
  );
}
