import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { browserId, CHROME_LANE, FORMATS, lanesOf, SHARED_LANE, shownFormat, type BrowserAction, type BrowserFormat, type BrowserInput, type BrowserState, type MouseButton } from '../../shared/browser.ts';
import type { SessionInfo } from '../../shared/protocol.ts';
import { buildFeed } from '../state/feed.ts';
import { isRunning } from '../state/labels.ts';
import { darkEnoughForWhite, tagColor } from '../design/tag-colors.ts';
import { t } from '../i18n/index.ts';
import { IS_WINDOWS } from '../lib/platform.ts';
import { accountsBrowserOfLane, accountsLanes, browserActionOf, browserLanes, browserTool, launchedByLooking, usedAccountsLane, modifiersOf, pictureFraction, shownLane, testersAtWork } from '../state/browser.ts';
import { formatClock } from '../lib/format.ts';
import { useSessions } from '../state/sessions.ts';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DeskIcon, PhoneIcon, PipIcon, PowerIcon, RefreshIcon } from './Icons.tsx';

const BUTTONS = ['left', 'middle', 'right'] as const;
/** pointer moves sent at most this often: enough for hovers, without flooding the socket */
const MOVE_EVERY_MS = 40;

/** Who works in a browser and with which Playwright tool: its view outlines the page and shows its cursor. */
export interface Driver { name: string; tool: string }

const NO_EVENTS: never[] = [];

/** Who works in the browser of `lane` right now: the session's agent in its own or the shared one, a tester in its own. */
export function useDriver(session: SessionInfo, lane: number): Driver | null {
  const events = useSessions((s) => s.logs[session.id] ?? NO_EVENTS);
  const running = isRunning(session);
  const { name, subagents } = session;
  return useMemo(() => {
    if (!running || lane === CHROME_LANE) return null;
    const own = lane === 0 || lane === SHARED_LANE;
    const tester = own ? null : subagents.find((agent) => agent.type === `browser-tester-${lane}`);
    if (!own && !tester) return null;
    const tool = browserTool(buildFeed(events).items, tester?.id ?? null);
    return tool ? { name: tester?.name ?? name, tool } : null;
  }, [events, running, lane, name, subagents]);
}

/** each tester's first name by browserId, kept once it has finished (its browser stays to look at) */
const testerNames = new Map<string, string>();

/**
 * The lanes of the session's browsers to pick from (its own always, that of the user's accounts with it), each with its
 * name and whether its tester is at work. `liveOnly`: the browsers whose page Open Space shows live, without the user's Chrome.
 */
export function useLanes(session: SessionInfo, liveOnly = false) {
  const lanes = useSessions((s) => lanesOf(Object.keys(s.browsers), session.id).join(','));
  const used = usedAccountsLane(useAccountsBrowser(session));
  const accounts = accountsLanes(!!session.untrusted, useSessions((s) => s.browserAvailable)).filter((lane) => !liveOnly || lane !== CHROME_LANE);
  const running = lanes ? lanes.split(',').map(Number) : [];
  const atWork = testersAtWork(session.subagents);
  for (const [lane, name] of Object.entries(atWork)) testerNames.set(browserId(session.id, Number(lane)), name);
  const words = t.session.browser;
  return browserLanes(running, accounts).map((lane) => ({
    lane,
    name: lane === SHARED_LANE ? words.shared : lane === CHROME_LANE ? words.chrome : lane ? (testerNames.get(browserId(session.id, lane)) ?? words.tester(lane)) : session.name,
    title: lane === SHARED_LANE ? words.sharedTitle : lane === CHROME_LANE ? words.chromeTitle : undefined,
    running: running.includes(lane) || (lane === CHROME_LANE && !!session.chrome),
    live: lane > 0 && lane in atWork,
    current: accounts.includes(lane) && lane === used,
  }));
}

/** The browser of the user's accounts the session uses: its own choice, else the setting's. */
const useAccountsBrowser = (session: SessionInfo) => useSessions((s) => session.accountsBrowser ?? s.preferences.accountsBrowser);

/** The session's browsers as buttons, the one shown pressed. */
export function LanePicker({ lanes, shown, onPick }: { lanes: ReturnType<typeof useLanes>; shown: number | null; onPick: (lane: number) => void }) {
  return lanes.map((each) => (
    <button key={each.lane} type="button" role="tab" aria-selected={each.lane === shown} data-off={!each.running} data-live={each.live} data-current={each.current} title={each.current ? `${each.title} · ${t.session.browser.inUse}` : each.title} onClick={() => onPick(each.lane)}>{each.name}</button>
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
export function BrowserView({ session }: { session: SessionInfo }) {
  const lanes = useLanes(session);
  const chosen = useSessions((s) => s.browserLanes[session.id] ?? 0);
  const showLane = useSessions((s) => s.showBrowserLane);
  const running = lanes.filter((each) => each.running).map((each) => each.lane);
  const accounts = lanes.filter((each) => accountsBrowserOfLane(each.lane) !== null).map((each) => each.lane);
  const lane = shownLane(chosen, running, accounts);
  const picker = (
    <>
      {lanes.length > 1 && (
        <div className="cp-browser__lanes" role="tablist" aria-label={t.session.browser.lanes}>
          <LanePicker lanes={lanes} shown={lane} onPick={(each) => showLane(session.id, each)} />
        </div>
      )}
      {accounts.includes(lane) && <AccountsSwitch session={session} lane={lane} />}
    </>
  );
  if (lane === CHROME_LANE) return <ChromePane session={session}>{picker}</ChromePane>;
  return <BrowserPane key={lane} session={session} lane={lane}>{picker}</BrowserPane>;
}

/**
 * Over a browser of the user's accounts the session does not use: which one it uses, and the button that switches it to
 * this one (its process is released and its next message starts with it, see SessionManager.switchBrowsers).
 */
function AccountsSwitch({ session, lane }: { session: SessionInfo; lane: number }) {
  const send = useSessions((s) => s.send);
  const used = useAccountsBrowser(session);
  const shown = accountsBrowserOfLane(lane);
  const words = t.session.browser;
  if (!shown || shown === used) return null;
  return (
    <div className="cp-browser__switch">
      <span>{used === 'chrome' ? words.usesChrome : words.usesShared}</span>
      <button type="button" className="cp-button" data-size="small" onClick={() => send({ t: 'accountsBrowser', sessionId: session.id, browser: shown })}>{words.useHere}</button>
    </div>
  );
}

/**
 * The user's own Chrome, which Open Space does not show live (the session drives it through Claude in Chrome): the page
 * its agent last worked on there, and the last screenshot it took, as its calls tell them (SessionInfo.chrome).
 */
function ChromePane({ session, children }: { session: SessionInfo; children: ReactNode }) {
  const words = t.session.browser;
  const seen = session.chrome;
  const picture = seen?.picture;
  return (
    <section className="cp-panel-view cp-browser" aria-label={words.chrome}>
      <header className="cp-panel-view__head cp-browser__bar">
        <div className="cp-browser__address" data-readonly="true">
          <span className="cp-browser__page" title={seen?.url}>{seen ? seen.url : words.chromeIdle}</span>
        </div>
        {seen && <time className="cp-browser__seen" dateTime={new Date(seen.at).toISOString()}>{formatClock(seen.at)}</time>}
      </header>
      {children}
      <div className="cp-browser__screen">
        {picture
          ? <img className="cp-browser__picture" src={`/attachments/${picture.name}`} alt={seen?.title ?? ''} draggable={false} />
          : <div className="cp-browser__note"><p>{seen ? words.chromeNoPicture : words.chromeEmpty}</p></div>}
      </div>
      <p className="cp-browser__caption">{picture && picture.url !== seen?.url ? words.chromeOlderPicture(picture.url, formatClock(picture.at)) : words.chromeCaption}</p>
    </section>
  );
}

/** One browser of the session with its address bar, its tabs and the page. */
function BrowserPane({ session, lane, children }: { session: SessionInfo; lane: number; children: ReactNode }) {
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
      <BrowserScreen session={session} lane={lane} />
    </section>
  );
}

/**
 * The page of one browser of the session as its pictures come (server/browser.ts), and the user's clicks, scrolls and
 * keys passed on to it. The same browser its Playwright tools drive, so both see what the other does.
 */
export function BrowserScreen({ session, lane }: { session: SessionInfo; lane: number }) {
  const driver = useDriver(session, lane);
  const cursorShown = useSessions((s) => s.preferences.agentCursor);
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
  const closed = (seen || !launchedByLooking(lane)) && !browser;
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
      className="cp-browser__screen" role="application" tabIndex={0} aria-label={words.view} data-driving={!!driver}
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
            {driver && cursorShown && <DriverOverlay driver={driver} browser={browser} />}
          </>
        )}
    </div>
  );
}

/**
 * The agent at work in the page, as over the user's Chrome with Claude in Chrome: an outline in its colour, and its
 * cursor gliding to each point its mouse goes to, with what it does next to it.
 */
function DriverOverlay({ driver, browser }: { driver: Driver; browser: BrowserState | undefined }) {
  const words = t.session.browser;
  const size = browser?.size ?? FORMATS[browser?.format ?? 'desktop'], pointer = browser?.pointer;
  const style = { '--driver': darkEnoughForWhite(tagColor(driver.name)), '--ratio': size.width / size.height } as CSSProperties;
  return (
    <div className="cp-browser__driver" style={style} aria-hidden>
      {/* the picture's own box (it is contained in the screen): the outline goes round the page, the cursor lands on it */}
      <div className="cp-browser__stage">
        {pointer && (
          <div className="cp-browser__cursor" style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }}>
            {pointer.clicks > 0 && <span key={pointer.clicks} className="cp-browser__ripple" />}
            <svg viewBox="0 0 16 18" width="18" height="20" aria-hidden="true"><path d="M1.5 1.5 L14 8.2 L8.3 9.6 L5.6 15.6 Z" /></svg>
            <span className="cp-browser__action">{words.actions[browserActionOf(driver.tool)] ?? words.acting}</span>
          </div>
        )}
      </div>
    </div>
  );
}
