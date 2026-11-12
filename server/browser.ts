// A browser per session, which its Claude drives with Playwright and the user watches and uses in the session's window.
//
// Open Space launches a headless Chrome of its own for the session (a profile under OFFICE_DIR/browsers/<session>), the
// first time either side needs it. The session's Playwright MCP server is given `--cdp-endpoint` on Open Space
// (browserMcpConfig): Playwright asks /browser/<session>/cdp/<key>/json/version/, which launches the browser if needed
// and answers with its WebSocket. Open Space keeps a CDP connection of its own to the same browser: it follows the tabs,
// streams the shown one as JPEG pictures (Page.startScreencast, only while a page watches) and passes on clicks and keys.
//
// One more Chrome is shared by every session: the one the user signs in to their own accounts (server/shared-browser.ts).
// Each session sees its tabs there as the lane SHARED_LANE of its browsers, and its Playwright server `shared-browser`
// reaches it through Open Space, which shows each owner its own tabs only.
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, readlink, rm } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import { WebSocket } from 'ws';
import type { BrowserAction, BrowserFormat, BrowserInput, BrowserState, BrowserTab } from '../shared/browser.ts';
import { addressOf, browserId, FORMATS, laneOf, MODIFIERS, SHARED_LANE, sessionOfBrowser, shownFormat } from '../shared/browser.ts';
import type { AccountsBrowser } from '../shared/protocol.ts';
import { asArray, asJson, isJson } from './json.ts';
import { cookiesToClear, hostOf, isKept, readSites, relaySharedCdp, SHARED_PROFILE, SharedTabs, SITES_FILE, writeSites } from './shared-browser.ts';
import { recoverWindowsBrowser } from './browser-recovery.ts';
import { signalTree } from './process-tree.ts';

const CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];
const VIEWPORT = FORMATS.desktop;
const START_TIMEOUT_MS = 15_000;
/** a browser nobody watches, whose session has no process left (so no Playwright either), is closed after this */
const IDLE_MS = 10 * 60_000;
/** a page that does not read its pictures fast enough skips some rather than piling them up */
const MAX_PENDING_BYTES = 2_000_000;
const BOUNDARY = 'frame';
/** The headers of a picture of the stream, written as soon as the one before ends (picturePart). */
export const PICTURE_HEAD = `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\n\r\n`;
/**
 * A picture as written to the stream: its bytes, then the next one's headers. Chrome shows a part of a multipart stream
 * only once the next part's headers come (checked with Chrome 156), so a page that stood still showed the picture before
 * its last one, until something moved again: a sign-in step whose address had changed but whose page stayed on the last.
 */
export function picturePart(data: Buffer): Buffer {
  return Buffer.concat([data, Buffer.from(`\r\n${PICTURE_HEAD}`)]);
}
/** the largest picture asked for, either side: a computer's screen, or a phone's at its scale, whatever the agent resized it to */
const PICTURE_MAX = 1920;

/** The Chrome Open Space launches: OFFICE_CHROME, else the first one installed. */
export function findChrome(env: NodeJS.ProcessEnv): string | null {
  const chosen = env.OFFICE_CHROME;
  if (chosen) return existsSync(chosen) ? chosen : null;
  const windows = [env.PROGRAMFILES, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter((folder): folder is string => !!folder).flatMap((folder) => [
    path.join(folder, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(folder, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(folder, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(folder, 'Chromium', 'Application', 'chrome.exe'),
  ]);
  return [...windows, ...CHROMES, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((file) => existsSync(file)) ?? null;
}

/**
 * The arguments of a Chrome Open Space launches on `profile`. The shared one keeps every window drawn: each owner works
 * in a window of its own, and Chrome stops drawing a window under another one after a few seconds otherwise (checked
 * with Chrome 156), so its owner's Playwright could not click in it any more. None plays sound: what an agent tests
 * (a video, a song) would play out loud on the user's speakers, and the page only shows its picture.
 */
export function chromeArgs(profile: string, shared: boolean): string[] {
  return [
    ...(process.platform === 'win32' ? ['--enable-automation'] : []),
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, `--force-device-scale-factor=${VIEWPORT.scale}`,
    '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen', '--hide-crash-restore-bubble',
    ...(shared ? ['--disable-backgrounding-occluded-windows'] : []), 'about:blank',
  ];
}

/**
 * The address a tab Open Space opens for itself starts on (an `os-secret auth` sign-in): no view shows it, and its closing does
 * not stop a session's browser left with blank tabs only. In the shared browser it has no owner, like any tab without one.
 */
export const HELPER_TAB = 'about:blank#open-space-helper';

/** How long a site may take to answer `os-secret auth`'s sign-in (Browsers.signIn). */
const SIGN_IN_TIMEOUT_MS = 20_000;
/** How long a refused or failed sign-in's tab may take to show its page before it is closed anyway. */
const CLOSE_WAIT_MS = 2_000;

/**
 * The field that has focus in a page, looked for down the frames of the page's own site and the web components (open shadow
 * roots): 'password', 'text' (another input, a text area, an editable element), 'frame' (the focus is in a frame of another
 * site, whose field is not checked) or false.
 */
export const FOCUSED_FIELD = `(() => { let root = document; for (;;) { const at = root.activeElement; if (!at) return false;
  if (at.shadowRoot && at.shadowRoot.activeElement) { root = at.shadowRoot; continue; }
  if (at.tagName === 'IFRAME') { root = at.contentDocument; if (!root) return 'frame'; continue; }
  if (at.tagName === 'INPUT' && at.type === 'password') return 'password';
  if (at.isContentEditable || at.tagName === 'TEXTAREA') return 'text';
  return at.tagName === 'INPUT' && !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(at.type) ? 'text' : false; } })()`;

/**
 * What `os-secret auth` answers a password prompt met on the way to `site`: the login ('login') when the site's own host asks
 * (any scheme or port: http://site sending to https://site is asked again), once per origin; the same origin asking again
 * has refused it ('refused'); another host or a proxy never gets it ('elsewhere').
 */
export function authAnswer(site: string, challenge: { source?: unknown; origin?: unknown }, answered: ReadonlySet<string>): 'login' | 'refused' | 'elsewhere' {
  const origin = typeof challenge.origin === 'string' ? challenge.origin : '';
  if (challenge.source !== 'Server' || !URL.canParse(origin) || new URL(origin).hostname !== new URL(site).hostname) return 'elsewhere';
  return answered.has(origin) ? 'refused' : 'login';
}

/** Whether `address` is on the site (scheme, host and port) of `url`, under its path. */
function onSite(address: string, url: string): boolean {
  try {
    const at = new URL(address);
    const wanted = new URL(url);
    return at.origin === wanted.origin && at.pathname.startsWith(wanted.pathname);
  } catch { return false; }
}

/**
 * The tab `os-secret type` types into: the first on the site of `url`, else the only one. Never the one the view shows: a
 * tab a page opened becomes it, while the agent goes on in its own (Playwright stays there), so it may be another site's.
 */
export function typingTab(tabs: readonly BrowserTab[], url: string): BrowserTab | undefined {
  if (url) return tabs.find((tab) => onSite(tab.url, url));
  return tabs.length === 1 ? tabs[0] : undefined;
}

/** A tab's address as `os-secret` tells it back: without its query nor fragment, which may hold a token. */
export function shortAddress(url: string): string {
  try { const at = new URL(url); return at.origin === 'null' ? url.split(/[?#]/)[0] : `${at.origin}${at.pathname}`; } catch { return url.split(/[?#]/)[0]; }
}

/** The key in the CDP endpoint given to a session: without it, another program of the machine cannot launch its browser. */
export const browserKey = (secret: string, sessionId: string) => createHmac('sha256', secret).update(`browser:${sessionId}`).digest('hex').slice(0, 32);

/** Options of the Playwright MCP server that pick another browser than the one given by --cdp-endpoint, with how many values follow each. */
const BROWSER_FLAGS: Record<string, number> = {
  '--cdp-endpoint': 1, '--cdp-header': 1, '--browser': 1, '--executable-path': 1, '--user-data-dir': 1, '--device': 1, '--viewport-size': 1,
  '--headless': 0, '--isolated': 0, '--extension': 0,
};

type McpServer = Record<string, unknown> & { command?: string; args?: string[] };

/**
 * The user's own Playwright server (from ~/.claude.json), else `npx @playwright/mcp`, pointed at `endpoint`, and run through
 * `filter` (server/playwright-filter.ts), which hides the session's keys in what it answers.
 */
function playwrightServer(endpoint: string, userServers: Record<string, unknown>, filter?: string): { name: string; server: McpServer } {
  const found = Object.entries(userServers).find(([name, raw]) => {
    const server = asJson(raw);
    return name === 'playwright' || (Array.isArray(server.args) && server.args.some((arg) => typeof arg === 'string' && arg.includes('@playwright/mcp')));
  });
  const base: McpServer = found ? { ...asJson(found[1]) } : process.platform === 'win32'
    ? { type: 'stdio', command: 'cmd.exe', args: ['/d', '/c', 'npx', '-y', '@playwright/mcp@latest'] }
    : { type: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'] };
  const args: string[] = [];
  const given = Array.isArray(base.args) ? base.args.filter((arg): arg is string => typeof arg === 'string') : [];
  for (let at = 0; at < given.length; at++) {
    const [flag, inline] = given[at].split('=', 2);
    if (flag in BROWSER_FLAGS) { if (inline === undefined) at += BROWSER_FLAGS[flag]; continue; }
    args.push(given[at]);
  }
  const server = { ...base, args: [...args, '--cdp-endpoint', endpoint] };
  const filtered = filter && typeof server.command === 'string' ? { ...server, command: 'node', args: [filter, server.command, ...server.args] } : server;
  return { name: found?.[0] ?? 'playwright', server: filtered };
}

/**
 * The browser through which a session reaches the user's signed-in accounts, the one chosen in the settings
 * (Preferences.accountsBrowser): none for a session whose folder was not trusted, since both reach those accounts.
 */
export function accountsBrowserOf(chosen: AccountsBrowser, untrusted: boolean): AccountsBrowser | null {
  return untrusted ? null : chosen;
}

/** The name of the server `claude --chrome` adds, on the user's own Chrome: its tools' prefix. */
export const CHROME_SERVER = 'claude-in-chrome';

/** The name of the session's Playwright server on the shared browser (server/shared-browser.ts), its tools' prefix. */
export const SHARED_SERVER = 'shared-browser';

/** Whether a session's --mcp-config gives it the shared browser. */
export function hasSharedBrowser(mcpConfig: string | undefined): boolean {
  if (!mcpConfig) return false;
  try { return SHARED_SERVER in asJson(asJson(JSON.parse(mcpConfig)).mcpServers); } catch { return false; }
}

/**
 * The --mcp-config of a session: its Playwright server (same name as the user's, so it takes its place) on its browser,
 * and with `sharedEndpoint` a second one on the shared browser.
 */
export function browserMcpConfig(endpoint: string, userServers: Record<string, unknown>, sharedEndpoint?: string, filter?: string): string {
  const { name, server } = playwrightServer(endpoint, userServers, filter);
  const shared = sharedEndpoint ? { [SHARED_SERVER]: playwrightServer(sharedEndpoint, userServers, filter).server } : {};
  return JSON.stringify({ mcpServers: { [name]: server, ...shared } });
}

/** Testers a session can run at once, each with a browser of its own (lanes 1 to TESTERS, see shared/browser.ts). */
export const TESTERS = 4;
/** The name the session's Claude launches the nth tester by (the Agent tool's subagent_type). */
export const testerAgent = (lane: number) => `browser-tester-${lane}`;
/** The lane of a tester from its subagent_type, 0 for any other sub-agent. */
export const testerLane = (type: string) => Number(/^browser-tester-(\d+)$/.exec(type)?.[1] ?? 0);

/**
 * The --agents of a session: its testers, sub-agents whose Playwright server drives a browser of their own
 * (`${endpoint}/lane/<n>`), so that several test flows at once, each shown in Open Space. One agent per lane: Claude
 * Code runs a single server for every run of a same agent, which would have them share a tab. The server has a name
 * of its own, and the session's Playwright tools are kept from it, like the user's own Chrome when the session has it (`chrome`).
 */
export function testerAgents(endpoint: string, userServers: Record<string, unknown>, words: { description: string; prompt: string; shared?: string }, sharedEndpoint?: string, chrome = false, filter?: string): string {
  return JSON.stringify(Object.fromEntries(Array.from({ length: TESTERS }, (_, at) => {
    const lane = at + 1;
    const { name, server } = playwrightServer(`${endpoint}/lane/${lane}`, userServers, filter);
    const own = `tester-browser-${lane}`;
    if (!sharedEndpoint) return [testerAgent(lane), { description: words.description, prompt: words.prompt.replaceAll('tester-browser', own), mcpServers: [{ [own]: server }], disallowedTools: [`mcp__${name}`, ...(chrome ? [`mcp__${CHROME_SERVER}`] : [])] }];
    // its tabs of the shared browser are its own too, apart from the session's
    const shared = `tester-shared-${lane}`;
    return [testerAgent(lane), {
      description: words.description,
      prompt: `${words.prompt}${words.shared ?? ''}`.replaceAll('tester-browser', own).replaceAll(SHARED_SERVER, shared),
      mcpServers: [{ [own]: server }, { [shared]: playwrightServer(`${sharedEndpoint}/lane/${lane}`, userServers, filter).server }],
      disallowedTools: [`mcp__${name}`, `mcp__${SHARED_SERVER}`],
    }];
  })));
}

/** The user's MCP servers in ~/.claude.json, read again only when the file changes (it can weigh a few MB). */
export function userMcpServers(file: string): () => Record<string, unknown> {
  let seen = -1;
  let servers: Record<string, unknown> = {};
  return () => {
    try {
      const changed = statSync(file).mtimeMs;
      if (changed !== seen) {
        seen = changed;
        servers = asJson(asJson(JSON.parse(readFileSync(file, 'utf8'))).mcpServers);
      }
    } catch { servers = {}; }
    return servers;
  };
}

/** Windows virtual key codes of the keys that type no character (CDP needs them for Enter, the arrows…). */
const KEY_CODES: Record<string, number> = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, ' ': 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46,
};
/** the editing shortcuts of macOS, which a headless browser does not map to commands by itself */
const MAC_COMMANDS: Record<string, string> = { a: 'selectAll', c: 'copy', x: 'cut', v: 'paste', z: 'undo' };

/** A key as CDP's Input.dispatchKeyEvent takes it. */
export function keyEvent(input: Extract<BrowserInput, { kind: 'key' }>): Record<string, unknown> {
  const printable = [...input.key].length === 1;
  const shortcut = (input.modifiers & (MODIFIERS.ctrl | MODIFIERS.meta)) !== 0;
  // a letter or a digit is sent with its own key's code; other characters with none, since their character code is the
  // one of a key that types nothing (. is 46, Delete; ' and ( are 39 and 40, the arrows) and Chrome would run that key instead
  // ponytail: 0 for punctuation, the US layout's codes (190 for .) if a page ever reads them
  const code = KEY_CODES[input.key] ?? (/^[a-z0-9]$/i.test(input.key) ? input.key.toUpperCase().charCodeAt(0) : 0);
  const text = input.key === 'Enter' ? '\r' : printable && !shortcut ? input.key : undefined;
  const command = input.modifiers === MODIFIERS.meta ? MAC_COMMANDS[input.key.toLowerCase()] : undefined;
  return {
    type: input.type === 'keyDown' && text ? 'keyDown' : input.type === 'keyDown' ? 'rawKeyDown' : 'keyUp',
    key: input.key, code: input.code, windowsVirtualKeyCode: code, modifiers: input.modifiers,
    ...(input.type === 'keyDown' && text ? { text, unmodifiedText: text } : {}),
    ...(input.type === 'keyDown' && command ? { commands: [command] } : {}),
  };
}

/** A CDP connection: calls answered by id, events (of the browser or of an attached tab's session) to `onEvent`. */
class Cdp {
  private readonly socket: WebSocket;
  private next = 0;
  private readonly calls = new Map<number, { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  readonly opened: Promise<void>;

  constructor(url: string, onEvent: (method: string, params: Record<string, unknown>, session?: string) => void, onClose: () => void) {
    this.socket = new WebSocket(url, { perMessageDeflate: false, maxPayload: 64_000_000 });
    this.opened = new Promise((resolve, reject) => { this.socket.once('open', () => resolve()); this.socket.once('error', reject); });
    this.socket.on('message', (data) => {
      let message: Record<string, unknown>;
      try { message = asJson(JSON.parse(String(data))); } catch { return; }
      if (typeof message.id === 'number') {
        const call = this.calls.get(message.id);
        this.calls.delete(message.id);
        if (isJson(message.error)) call?.reject(new Error(String(message.error.message)));
        else call?.resolve(asJson(message.result));
        return;
      }
      if (typeof message.method === 'string') onEvent(message.method, asJson(message.params), typeof message.sessionId === 'string' ? message.sessionId : undefined);
    });
    this.socket.on('close', () => {
      for (const call of this.calls.values()) call.reject(new Error('browser closed'));
      this.calls.clear();
      onClose();
    });
    this.socket.on('error', () => {});
  }

  send(method: string, params: Record<string, unknown> = {}, session?: string): Promise<Record<string, unknown>> {
    if (this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('browser closed'));
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.calls.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
    });
  }

  close() { this.socket.close(); }
}

/** A Chrome Open Space launched: a session's, a tester's, or the shared one (shown by a view per session). */
interface Chrome {
  process: ChildProcess;
  port: number;
  /** its own WebSocket, the one a session's Playwright connects to */
  socket: string;
  cdp: Cdp;
}

/** A browser as the views show it: a session's or a tester's Chrome, or a session's tabs of the shared one. */
interface Live {
  chrome: Chrome;
  tabs: Map<string, BrowserTab>;
  active: string | null;
  /** Open Space's own CDP session on the shown tab, for its pictures and the user's input */
  attached: { tab: string; session: string } | null;
  casting: boolean;
  /** the moves of `attached`, one after the other: a new tab and a page that starts watching can come together */
  following: Promise<void>;
  frame: { data: Buffer; width: number; height: number } | null;
  format: BrowserFormat;
  viewers: Set<http.ServerResponse>;
  idleSince: number;
}

export interface BrowsersDeps {
  chrome: string | null;
  /** OFFICE_DIR/browsers: one profile per browser (shared/browser.ts browserId) */
  folder: string;
  /** a session still has a process (its Playwright may come back to its browser) */
  sessionAlive: (sessionId: string) => boolean;
  /** `id`: see browserId */
  onState: (id: string, state: BrowserState | null) => void;
  log: (message: string, error?: unknown) => void;
  now?: () => number;
}

/** The shared Chrome (server/shared-browser.ts), its tabs whoever owns them, and how many Playwright are connected to it. */
interface Shared {
  chrome: Chrome;
  tabs: Map<string, BrowserTab>;
  relays: number;
  idleSince: number;
}

export class Browsers {
  private readonly live = new Map<string, Live>();
  /** who owns which tab of the shared browser */
  readonly sharedTabs = new SharedTabs();
  private shared: Shared | null = null;
  private sharedStarting: Promise<Shared> | null = null;
  /** the sites the shared browser's owners went to since it was launched: their site data goes at its next launch */
  private readonly sites = new Set<string>();
  private savingSites: Promise<void> = Promise.resolve();
  private readonly starting = new Map<string, Promise<Live>>();
  /** the format last picked for each browser, kept when it is closed and launched again */
  private readonly formats = new Map<string, BrowserFormat>();
  private readonly deps: BrowsersDeps;
  private readonly sweep: NodeJS.Timeout;

  constructor(deps: BrowsersDeps) {
    this.deps = deps;
    this.sweep = setInterval(() => this.closeIdle(), 60_000);
    this.sweep.unref();
  }

  get available() { return this.deps.chrome !== null; }

  private now() { return (this.deps.now ?? Date.now)(); }

  state(id: string): BrowserState | null {
    const live = this.live.get(id);
    return live ? { tabs: [...live.tabs.values()], active: live.active, format: live.format, size: live.frame && { width: live.frame.width, height: live.frame.height } } : null;
  }

  states(): Record<string, BrowserState> {
    return Object.fromEntries([...this.live.keys()].map((id) => [id, this.state(id) as BrowserState]));
  }

  /** The session's browser, launched if it is not running. */
  ensure(id: string): Promise<Live> {
    const live = this.live.get(id);
    if (live) return Promise.resolve(live);
    if (laneOf(id) === SHARED_LANE) return this.sharedView(id);
    let starting = this.starting.get(id);
    if (!starting) {
      starting = this.launch(id).finally(() => this.starting.delete(id));
      this.starting.set(id, starting);
    }
    return starting;
  }

  /**
   * A cookie of `os-secret cookie` (server/secrets.ts) in the session's own browser, launched if needed. A session cookie:
   * it goes with the browser, nothing of the key stays in the profile.
   */
  async setCookie(sessionId: string, cookie: { name: string; value: string; url: string }, shared = false) {
    // the user's own accounts (Google…) are kept in the shared browser: no session overwrites them, as its filter refuses too
    if (shared && isKept(hostOf(cookie.url))) throw new Error('that site holds your own accounts in the shared browser');
    const chrome = shared ? (await this.ensureShared()).chrome : (await this.ensure(sessionId)).chrome;
    if (shared) this.visitedBy(sessionId, cookie.url);
    await chrome.cdp.send('Storage.setCookies', { cookies: [cookie] });
  }

  /** A site a session reached in the shared browser without a tab (a cookie or a login it set): cleared when it goes, and at the next launch. */
  private visitedBy(sessionId: string, url: string) {
    this.visited(this.sharedTabs.visitAs(browserId(sessionId), url));
  }

  /**
   * `os-secret type` (server/secrets.ts): the key typed into the field that has focus in a tab of the session's own browser,
   * or of its own tabs in the shared one (its lane's and its testers', never another session's), as a paste would
   * (Input.insertText), on a connection of Open Space's own. The tab on the site of `url`, else its only one (typingTab). A
   * password field only, unless `anyField`: another field may show the key back on the page. Answers the tab's address (shortAddress).
   */
  async typeInto(sessionId: string, value: string, url: string, shared: boolean, anyField = false): Promise<string> {
    const mine = shared ? this.shared : this.live.get(browserId(sessionId));
    if (!mine) throw new Error(`your ${shared ? 'shared ' : ''}browser is not open`);
    const tabs = shared ? this.sharedTabs.tabsOfSession(sessionId).flatMap((id) => this.shared?.tabs.get(id) ?? []) : [...mine.tabs.values()];
    const tab = typingTab(tabs, url);
    if (!tab) throw new Error(url ? `no tab of yours is on ${url}` : tabs.length ? 'several tabs: give the address of the one to type in (https://site/…)' : 'no tab of yours is open');
    const cdp = new Cdp(mine.chrome.socket, () => {}, () => {});
    try {
      await cdp.opened;
      const session = String((await cdp.send('Target.attachToTarget', { targetId: tab.id, flatten: true })).sessionId);
      const focused = asJson((await cdp.send('Runtime.evaluate', { expression: FOCUSED_FIELD, returnByValue: true }, session)).result).value;
      if (focused === 'frame') throw new Error(`the field that has focus in ${shortAddress(tab.url)} is in a frame of another site`);
      if (focused !== 'password' && focused !== 'text') throw new Error(`no field to type in has focus in ${shortAddress(tab.url)}: click in it first`);
      if (focused === 'text' && !anyField) throw new Error(`the field that has focus in ${shortAddress(tab.url)} is not a password field: add --any-field to type the key into it (the page may show it back)`);
      await cdp.send('Input.insertText', { text: value }, session);
    } finally {
      cdp.close();
    }
    return shortAddress(tab.url);
  }

  /**
   * A site's basic-auth login (`os-secret auth`, server/secrets.ts) in the session's own browser: never the shared one, where
   * Chrome would keep it after the session (no CDP call clears its login cache). A tab of Open Space's own, on a connection of
   * its own, opens the address and answers the password prompts of the site's host only (authAnswer; Fetch auth, at the
   * request stage: a 401 paused at the response stage never reaches the prompt, checked with Chrome 156). Only that page
   * loads, its scripts off: nothing of the site runs there (no tag, no analytics hit), and the login is in no address. A page
   * that asks for no login is a failure. Chrome keeps it for that site (by its realm, whatever the path) and sends it by
   * itself with every page and call afterwards, in memory only, until that Chrome closes.
   */
  async signIn(sessionId: string, site: string, login: { username: string; password: string }) {
    const { chrome } = await this.ensure(sessionId);
    const refused = () => new Error('the site refused this user and password');
    let tab = '';
    let targetId = '';
    let navigating = false;
    // the page's own answer once signed in: a 403 or 500 after the login is no way in
    let status = 0;
    // the origins given the login (authAnswer)
    const answered = new Set<string>();
    let done!: { resolve: () => void; reject: (error: Error) => void };
    let loaded!: () => void;
    const settled = new Promise<void>((resolve) => { loaded = resolve; });
    const outcome = new Promise<void>((resolve, reject) => { done = { resolve, reject }; });
    // awaited below: a failure before that (the browser closing meanwhile) must not end Open Space as an unhandled rejection
    outcome.catch(() => {});
    const cdp = new Cdp(chrome.socket, (method, params, session) => {
      if (session !== tab) return;
      const requestId = params.requestId;
      if (method === 'Fetch.authRequired') {
        const challenge = asJson(params.authChallenge);
        const answer = authAnswer(site, challenge, answered);
        if (answer === 'login') answered.add(String(challenge.origin));
        void cdp.send('Fetch.continueWithAuth', { requestId, authChallengeResponse: answer === 'login' ? { response: 'ProvideCredentials', ...login } : { response: 'CancelAuth' } }, tab).catch(() => {});
        if (answer === 'refused') done.reject(refused());
        if (answer === 'elsewhere') done.reject(new Error(`${challenge.source === 'Proxy' ? 'a proxy' : String(challenge.origin)} asked for the login, not ${new URL(site).origin}: not given`));
      } else if (method === 'Fetch.requestPaused') {
        const page = params.resourceType === 'Document' && params.frameId === targetId;
        void cdp.send(page ? 'Fetch.continueRequest' : 'Fetch.failRequest', page ? { requestId } : { requestId, errorReason: 'Aborted' }, tab).catch(() => {});
      } else if (method === 'Network.responseReceived' && params.type === 'Document' && params.frameId === targetId) {
        status = Number(asJson(params.response).status) || 0;
      } else if (method === 'Page.loadEventFired' && navigating) {
        // not at Page.navigate's answer: Chrome may still be committing the page then, and ignores a close meanwhile
        loaded();
        if (answered.size && status >= 400) done.reject(new Error(`the site took the login but answered ${status}`));
        else if (answered.size) done.resolve();
        else done.reject(new Error('this page asked for no login (or this browser is signed in to it already): give the address of a page behind the password prompt'));
      }
    }, () => done.reject(new Error('browser closed')));
    let timer: NodeJS.Timeout | undefined;
    try {
      await cdp.opened;
      targetId = String((await cdp.send('Target.createTarget', { url: HELPER_TAB, background: true })).targetId);
      tab = String((await cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId);
      await cdp.send('Page.enable', {}, tab);
      await cdp.send('Network.enable', {}, tab);
      await cdp.send('Emulation.setScriptExecutionDisabled', { value: true }, tab);
      await cdp.send('Fetch.enable', { handleAuthRequests: true, patterns: [{ urlPattern: '*' }] }, tab);
      navigating = true;
      cdp.send('Page.navigate', { url: site }, tab).then(({ errorText }) => {
        if (errorText) done.reject(errorText === 'net::ERR_INVALID_AUTH_CREDENTIALS' ? refused() : new Error(String(errorText)));
      }, (error: Error) => done.reject(error));
      timer = setTimeout(() => done.reject(new Error('the site did not answer')), SIGN_IN_TIMEOUT_MS);
      await outcome;
    } finally {
      clearTimeout(timer);
      // a refused login still shows Chrome's 401 page: closed once there too, if it comes
      await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, CLOSE_WAIT_MS))]);
      if (targetId) await cdp.send('Target.closeTarget', { targetId }).catch((error) => this.deps.log('cannot close the sign-in tab', error));
      cdp.close();
    }
  }

  /** What Playwright asks for before connecting: the browser's own /json/version, with its WebSocket address. */
  async version(sessionId: string, lane: number): Promise<Record<string, unknown>> {
    // the session's own browser or a tester's: the view of the shared one is reached through its filter only (sharedVersion)
    if (lane < 0 || lane > TESTERS) throw new Error('no such browser');
    const live = await this.ensure(browserId(sessionId, lane));
    const answer = await fetch(`http://127.0.0.1:${live.chrome.port}/json/version`);
    return asJson(await answer.json());
  }

  /** The shared Chrome's /json/version, launching it if needed (its WebSocket is replaced by Open Space's, see http.ts). */
  async sharedVersion(): Promise<Record<string, unknown>> {
    const shared = await this.ensureShared();
    const answer = await fetch(`http://127.0.0.1:${shared.chrome.port}/json/version`);
    return asJson(await answer.json());
  }

  /** The shared Chrome's own WebSocket, which an owner's Playwright reaches through `relay` only. */
  async sharedSocket(): Promise<string> {
    return (await this.ensureShared()).chrome.socket;
  }

  /** An owner's Playwright connected to the shared Chrome, each message through its filter. */
  relay(client: WebSocket, upstreamUrl: string, owner: string) {
    const shared = this.shared;
    if (!shared) { client.close(); return; }
    // counted once relayed only: a client gone while the shared Chrome started would keep it from idling out
    if (!relaySharedCdp(client, upstreamUrl, owner, this.sharedTabs)) return;
    shared.relays++;
    client.once('close', () => { shared.relays--; shared.idleSince = this.now(); });
  }

  /** An owner is gone (a tester done, a session rested or forgotten): its tabs close, and what it left on other sites than the kept ones goes. */
  async releaseOwner(owner: string) {
    const { tabs, origins } = this.sharedTabs.release(owner);
    const shared = this.shared;
    if (!shared) return;
    await Promise.all(tabs.map((targetId) => shared.chrome.cdp.send('Target.closeTarget', { targetId }).catch(() => {})));
    if (origins.length) await this.clearSites(shared.chrome, origins).catch((error) => this.deps.log('cannot clear the shared browser', error));
  }

  private get sitesFile() { return path.join(this.deps.folder, SHARED_PROFILE, SITES_FILE); }

  /** A site (origin) an owner's tab went to, kept on disk until the next launch clears it (Open Space may stop before its owner goes). */
  private visited(origin: string | undefined) {
    if (!origin || this.sites.has(origin)) return;
    this.sites.add(origin);
    const hosts = [...this.sites];
    this.savingSites = this.savingSites.then(() => writeSites(this.sitesFile, hosts)).catch((error) => this.deps.log('cannot keep the shared browser’s sites', error));
  }

  /** The cookies sent to the `sites` (origins) deleted (every one with no `sites`), the kept sites' aside, and the data of the `sites` (or of `storage`). */
  private async clearSites(chrome: Chrome, sites?: string[], storage: string[] = sites ?? []) {
    const { cookies } = await chrome.cdp.send('Storage.getCookies');
    const gone = cookiesToClear(asArray(cookies).map((cookie): Record<string, unknown> & { domain: string } => ({ ...asJson(cookie), domain: String(asJson(cookie).domain ?? '') })), sites);
    // a cookie set again already expired is deleted (Network.deleteCookies needs a page)
    if (gone.length) await chrome.cdp.send('Storage.setCookies', { cookies: gone.map((cookie) => ({
      name: cookie.name, value: '', domain: cookie.domain, path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly, expires: 1,
      ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}), ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
    })) });
    await this.clearStorage(chrome, storage);
  }

  /**
   * The data of `origins` (local storage, IndexedDB…), cleared through a tab's session: Chrome 156 answers "Internal error"
   * at the browser level. A blank tab of its own, closed after: the owner's tabs are closing when it goes (releaseOwner).
   */
  private async clearStorage(chrome: Chrome, origins: string[]) {
    if (!origins.length) return;
    const targetId = String((await chrome.cdp.send('Target.createTarget', { url: 'about:blank' })).targetId);
    try {
      const { sessionId } = await chrome.cdp.send('Target.attachToTarget', { targetId, flatten: true });
      for (const origin of origins) {
        await chrome.cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }, String(sessionId)).catch((error) => this.deps.log(`cannot clear ${origin} in the shared browser`, error));
      }
    } finally {
      await chrome.cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    }
  }

  /**
   * A Chrome left by an Open Space that did not stop cleanly still holds the profile (a second one exits with code 21):
   * it is stopped, its lock is its "host-pid". Only if that process is still a Chrome on this profile: a pid is reused.
   */
  private async freeProfile(profile: string) {
    if (process.platform === 'win32') {
      // a failed recovery (PowerShell blocked, WMI down) must not stop the launch: Chrome says itself if the profile is taken
      await recoverWindowsBrowser(profile, this.deps.chrome!).catch((error) => this.deps.log('cannot free the browser profile', error));
      return;
    }
    const lock = path.join(profile, 'SingletonLock');
    const pid = Number((await readlink(lock).catch(() => '')).split('-').at(-1));
    if (!Number.isInteger(pid) || pid <= 0) return;
    const command = await new Promise<string>((resolve) => execFile('ps', ['-p', String(pid), '-o', 'command='], (_error, stdout) => resolve(stdout)));
    if (command.includes(`--user-data-dir=${profile}`)) { try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ } }
    for (let tries = 0; tries < 30; tries++) {
      try { process.kill(pid, 0); } catch { break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await Promise.all(['SingletonLock', 'SingletonSocket', 'SingletonCookie'].map((name) => rm(path.join(profile, name), { force: true })));
  }

  /** A view of `chrome`, showing nothing yet. */
  private view(chrome: Chrome, id: string): Live {
    return { chrome, tabs: new Map(), active: null, attached: null, casting: false, following: Promise.resolve(), frame: null, format: this.formats.get(id) ?? 'desktop', viewers: new Set(), idleSince: this.now() };
  }

  private async launch(id: string): Promise<Live> {
    // the events only come once Open Space asks for them, when `live` is set; a Chrome gone while it starts stops nothing
    let started: Chrome | undefined;
    const chrome = await this.startChrome(id, (method, params, session) => {
      const live = this.live.get(id);
      if (live && live.chrome === started) this.onEvent(id, live, method, params, session);
    }, () => { if (started && this.live.get(id)?.chrome === started) void this.stop(id); });
    started = chrome;
    const live = this.view(chrome, id);
    this.live.set(id, live);
    await chrome.cdp.send('Target.setDiscoverTargets', { discover: true });
    return live;
  }

  private async startChrome(name: string, onEvent: (method: string, params: Record<string, unknown>, session?: string) => void, onGone: () => void): Promise<Chrome> {
    const chrome = this.deps.chrome;
    if (!chrome) throw new Error('no Chrome installed');
    const profile = path.join(this.deps.folder, name);
    await mkdir(profile, { recursive: true, mode: 0o700 });
    await this.freeProfile(profile);
    const portFile = path.join(profile, 'DevToolsActivePort');
    await rm(portFile, { force: true });
    const child = spawn(chrome, chromeArgs(profile, name === SHARED_PROFILE), { stdio: 'ignore' });
    const exited = new Promise<never>((_, reject) => child.once('exit', (code) => reject(new Error(`Chrome stopped (${code})`))));
    exited.catch(() => {});
    const deadline = this.now() + START_TIMEOUT_MS;
    let lines: string[] = [];
    while (lines.length < 2) {
      if (this.now() > deadline) { child.kill('SIGKILL'); throw new Error('Chrome did not start'); }
      await Promise.race([new Promise((resolve) => setTimeout(resolve, 100)), exited]);
      lines = (await readFile(portFile, 'utf8').catch(() => '')).split('\n').filter(Boolean);
    }
    const port = Number(lines[0]);
    const socket = `ws://127.0.0.1:${port}${lines[1]}`;
    const cdp = new Cdp(socket, onEvent, onGone);
    try { await cdp.opened; } catch (error) { child.kill('SIGKILL'); throw error; }
    child.once('exit', onGone);
    return { process: child, port, socket, cdp };
  }

  /** The shared Chrome, launched on its own profile if it is not running. */
  private ensureShared(): Promise<Shared> {
    if (this.shared) return Promise.resolve(this.shared);
    this.sharedStarting ??= this.launchShared().finally(() => { this.sharedStarting = null; });
    return this.sharedStarting;
  }

  private async launchShared(): Promise<Shared> {
    let started: Chrome | undefined;
    const chrome = await this.startChrome(SHARED_PROFILE, (method, params, session) => this.onSharedEvent(method, params, session), () => { void this.stopShared(started); });
    started = chrome;
    const shared: Shared = { chrome, tabs: new Map(), relays: 0, idleSince: this.now() };
    this.shared = shared;
    await chrome.cdp.send('Target.setDiscoverTargets', { discover: true });
    // one download folder for every owner: none, the shared browser is for reading (each owner's setting is answered by its filter)
    await chrome.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
    // logins to apps left by an Open Space that stopped, or a Chrome that idled out, before their owner went: only the
    // kept accounts last (every other cookie, and the data of the sites visited, in local storage too)
    for (const site of await readSites(this.sitesFile)) this.sites.add(site);
    const left = [...this.sites];
    await this.clearSites(chrome, undefined, left).catch((error) => this.deps.log('cannot clear the shared browser', error));
    for (const site of left) this.sites.delete(site);
    const kept = [...this.sites];
    this.savingSites = this.savingSites.then(() => writeSites(this.sitesFile, kept)).catch((error) => this.deps.log('cannot keep the shared browser’s sites', error));
    return shared;
  }

  /** A session's view of the shared browser: its tabs (its own lane's and its testers'), shown like a browser of its own. */
  private async sharedView(id: string): Promise<Live> {
    const shared = await this.ensureShared();
    const existing = this.live.get(id);
    if (existing) return existing;
    const live = this.view(shared.chrome, id);
    for (const tab of this.sharedTabs.tabsOfSession(sessionOfBrowser(id))) {
      const known = shared.tabs.get(tab);
      if (known) live.tabs.set(tab, known);
    }
    this.live.set(id, live);
    this.show(id, live, [...live.tabs.keys()].at(-1) ?? null);
    return live;
  }

  /**
   * An event of the shared Chrome, to the view of the session owning its tab: the tabs nobody owns (the one Chrome
   * opens with) are in no view. Pictures and the cut of Open Space's own session go to the view following that tab.
   */
  private onSharedEvent(method: string, params: Record<string, unknown>, session?: string) {
    const shared = this.shared;
    if (!shared) return;
    if (session !== undefined || method === 'Target.detachedFromTarget') {
      const followed = session ?? params.sessionId;
      for (const [id, live] of this.live) if (live.chrome === shared.chrome && live.attached?.session === followed) this.onEvent(id, live, method, params, session);
      return;
    }
    const info = asJson(params.targetInfo);
    const target = String(info.targetId ?? params.targetId ?? '');
    if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') {
      const owner = this.sharedTabs.claim({ targetId: target, type: String(info.type ?? ''), url: String(info.url ?? ''), openerId: typeof info.openerId === 'string' ? info.openerId : undefined });
      if (!owner) return;
      shared.tabs.set(target, { id: target, url: String(info.url ?? ''), title: String(info.title ?? '') });
      this.visited(this.sharedTabs.visit(target, String(info.url ?? '')));
      const id = browserId(sessionOfBrowser(owner), SHARED_LANE);
      const live = this.live.get(id);
      // the session's first tab there: its view appears, with the tab in it
      if (!live) { void this.ensure(id).catch((error) => this.deps.log('cannot show the shared browser', error)); return; }
      this.onEvent(id, live, live.tabs.has(target) || method === 'Target.targetCreated' ? method : 'Target.targetCreated', params);
      return;
    }
    if (method === 'Target.targetDestroyed') {
      shared.tabs.delete(target);
      const owner = this.sharedTabs.ownerOf(target);
      this.sharedTabs.forget(target);
      const live = owner && this.live.get(browserId(sessionOfBrowser(owner), SHARED_LANE));
      if (owner && live) this.onEvent(browserId(sessionOfBrowser(owner), SHARED_LANE), live, method, params);
    }
  }

  private onEvent(id: string, live: Live, method: string, params: Record<string, unknown>, session?: string) {
    if (method === 'Page.screencastFrame' && session && session === live.attached?.session) {
      void live.chrome.cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId }, session).catch(() => {});
      const meta = asJson(params.metadata);
      const width = Number(meta.deviceWidth) || VIEWPORT.width, height = Number(meta.deviceHeight) || VIEWPORT.height;
      const resized = live.frame?.width !== width || live.frame?.height !== height;
      live.frame = { data: Buffer.from(String(params.data), 'base64'), width, height };
      for (const viewer of live.viewers) this.sendFrame(viewer, live.frame.data);
      if (resized) this.deps.onState(id, this.state(id));
      return;
    }
    // Open Space's session on the tab was cut (the tab moved to another process, or another client detached it): followed again
    if (method === 'Target.detachedFromTarget' && params.sessionId === live.attached?.session) {
      live.attached = null;
      live.casting = false;
      if (live.active && live.tabs.has(live.active)) this.show(id, live, live.active);
      return;
    }
    const info = asJson(params.targetInfo);
    // Open Space's own tab, known by its first address (Chrome may tell it only once the tab exists): out of the view
    if ((method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') && info.url === HELPER_TAB) {
      if (!live.tabs.delete(String(info.targetId))) return;
      if (live.active === info.targetId) this.show(id, live, [...live.tabs.keys()].at(-1) ?? null);
      else this.deps.onState(id, this.state(id));
      return;
    }
    if (method === 'Target.targetCreated' && info.type === 'page') {
      const tab = { id: String(info.targetId), url: String(info.url ?? ''), title: String(info.title ?? '') };
      live.tabs.set(tab.id, tab);
      // a new tab, opened by the agent or by a link, is the one to look at
      this.show(id, live, tab.id);
      return;
    }
    if (method === 'Target.targetInfoChanged' && live.tabs.has(String(info.targetId))) {
      const tab = String(info.targetId), url = String(info.url ?? '');
      // another site may run in another process, whose pictures and size are to be asked for again
      if (tab === live.active && live.tabs.get(tab)?.url !== url) void this.restart(live).catch(() => {});
      live.tabs.set(tab, { id: tab, url, title: String(info.title ?? '') });
      this.deps.onState(id, this.state(id));
      return;
    }
    if (method === 'Target.targetDestroyed' && live.tabs.delete(String(params.targetId))) {
      // its last page closed (Playwright's browser_close, or the user's last tab): the browser goes, rather than staying
      // blank in the views
      if ([...live.tabs.values()].every((tab) => tab.url === 'about:blank')) { this.stop(id); return; }
      if (live.active === params.targetId) this.show(id, live, [...live.tabs.keys()].at(-1) ?? null);
      else this.deps.onState(id, this.state(id));
    }
  }

  /** Shows `tab`: Open Space's CDP session moves to it, and its pictures go on if a page watches. */
  private show(id: string, live: Live, tab: string | null) {
    live.active = tab;
    this.deps.onState(id, this.state(id));
    void this.attach(live).catch((error) => this.deps.log('cannot follow the browser tab', error));
  }

  private attach(live: Live): Promise<void> {
    const next = live.following.then(() => this.follow(live));
    live.following = next.catch(() => {});
    return next;
  }

  private async follow(live: Live) {
    const tab = live.active;
    if (live.attached?.tab === tab) { await this.cast(live); return; }
    const previous = live.attached;
    live.attached = null;
    live.casting = false;
    if (previous) await live.chrome.cdp.send('Target.detachFromTarget', { sessionId: previous.session }).catch(() => {});
    if (!tab) return;
    const { sessionId: session } = await live.chrome.cdp.send('Target.attachToTarget', { targetId: tab, flatten: true });
    if (live.active !== tab) { await live.chrome.cdp.send('Target.detachFromTarget', { sessionId: session }).catch(() => {}); return; }
    live.attached = { tab, session: String(session) };
    await live.chrome.cdp.send('Page.enable', {}, live.attached.session);
    await this.fit(live);
    await this.cast(live);
  }

  /**
   * The shown tab laid out for the browser's format, as on that screen. Set on Open Space's own CDP session: it lasts
   * while Open Space follows the tab (a headless window's own size does not reach the page's layout reliably).
   */
  private async fit(live: Live) {
    const page = live.attached?.session;
    if (!page) return;
    const { width, height, scale, mobile } = FORMATS[live.format];
    await live.chrome.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile }, page);
    await live.chrome.cdp.send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false }, page);
  }

  /**
   * The pictures asked for again, and with `refit` the format laid out again. Not refitted otherwise: the layout lasts
   * through navigations, and setting it once more after the agent resized the page (browser_resize) would size the
   * pictures for the format around a page left at the agent's size.
   */
  private restart(live: Live, refit = false): Promise<void> {
    const next = live.following.then(async () => {
      const page = live.attached?.session;
      if (!page) return;
      if (refit) await this.fit(live);
      if (!live.casting) return;
      await live.chrome.cdp.send('Page.stopScreencast', {}, page).catch(() => {});
      live.casting = false;
      await this.cast(live);
    });
    live.following = next.catch(() => {});
    return next;
  }

  /** Pictures only while someone watches. */
  private async cast(live: Live) {
    const wanted = live.viewers.size > 0;
    if (!live.attached || wanted === live.casting) return;
    live.casting = wanted;
    if (wanted) await live.chrome.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 75, maxWidth: PICTURE_MAX, maxHeight: PICTURE_MAX }, live.attached.session);
    else await live.chrome.cdp.send('Page.stopScreencast', {}, live.attached.session).catch(() => {});
  }

  private sendFrame(viewer: http.ServerResponse, data: Buffer) {
    if (viewer.writableLength > MAX_PENDING_BYTES) return;
    viewer.write(picturePart(data));
  }

  /** The shown tab as a stream of JPEG pictures (multipart/x-mixed-replace, which an <img> plays), launching the browser if needed. */
  async watch(id: string, res: http.ServerResponse) {
    const live = await this.ensure(id);
    res.writeHead(200, { 'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.write(PICTURE_HEAD);
    live.viewers.add(res);
    if (live.frame) this.sendFrame(res, live.frame.data);
    res.on('close', () => {
      live.viewers.delete(res);
      if (!live.viewers.size) live.idleSince = this.now();
      void this.cast(live).catch(() => {});
    });
    if (!live.active) await live.chrome.cdp.send('Target.createTarget', { url: this.blank(id), ...(laneOf(id) === SHARED_LANE ? { newWindow: true } : {}) });
    else await this.attach(live).catch((error) => this.deps.log('cannot follow the browser tab', error));
  }

  /** The address of a new empty tab: in the shared browser, one the session owns (see SharedTabs.expect). */
  private blank(id: string): string {
    return laneOf(id) === SHARED_LANE ? this.sharedTabs.expect(browserId(sessionOfBrowser(id), 0)) : 'about:blank';
  }

  async act(id: string, action: BrowserAction) {
    if (action.kind === 'stop') { this.stop(id); return; }
    const live = await this.ensure(id);
    const page = live.attached?.session;
    switch (action.kind) {
      case 'open': return;
      case 'format':
        // picked again while the agent's resizing shows another one: laid out again, the user takes the page back
        if (live.format === action.format && shownFormat(this.state(id) as BrowserState) === action.format) return;
        live.format = action.format;
        this.formats.set(id, action.format);
        this.deps.onState(id, this.state(id));
        await this.restart(live, true);
        return;
      case 'navigate': {
        const url = addressOf(action.url);
        if (!url) return;
        if (page) await live.chrome.cdp.send('Page.navigate', { url }, page);
        else if (laneOf(id) !== SHARED_LANE) await live.chrome.cdp.send('Target.createTarget', { url });
        else {
          // a tab of the shared browser is created empty, to be known as the session's, then sent to the address
          const { targetId } = await live.chrome.cdp.send('Target.createTarget', { url: this.blank(id), newWindow: true });
          const { sessionId } = await live.chrome.cdp.send('Target.attachToTarget', { targetId, flatten: true });
          await live.chrome.cdp.send('Page.navigate', { url }, String(sessionId)).finally(() => live.chrome.cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {}));
        }
        return;
      }
      case 'reload': if (page) await live.chrome.cdp.send('Page.reload', {}, page); return;
      case 'back':
      case 'forward': {
        if (!page) return;
        const history = await live.chrome.cdp.send('Page.getNavigationHistory', {}, page);
        const entries = Array.isArray(history.entries) ? history.entries.map(asJson) : [];
        const entry = entries[Number(history.currentIndex) + (action.kind === 'back' ? -1 : 1)];
        if (entry) await live.chrome.cdp.send('Page.navigateToHistoryEntry', { entryId: entry.id }, page);
        return;
      }
      case 'tab':
        if (!live.tabs.has(action.id)) return;
        await live.chrome.cdp.send('Target.activateTarget', { targetId: action.id });
        this.show(id, live, action.id);
        return;
      case 'closeTab': if (live.tabs.has(action.id)) await live.chrome.cdp.send('Target.closeTarget', { targetId: action.id }); return;
    }
  }

  async input(id: string, input: BrowserInput) {
    const live = this.live.get(id);
    const page = live?.attached?.session;
    if (!live || !page) return;
    const { width, height } = live.frame ?? VIEWPORT;
    switch (input.kind) {
      case 'mouse':
        await live.chrome.cdp.send('Input.dispatchMouseEvent', { type: input.type, x: input.x * width, y: input.y * height, button: input.button, clickCount: input.clicks, modifiers: input.modifiers }, page);
        return;
      case 'wheel':
        await live.chrome.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: input.x * width, y: input.y * height, deltaX: input.dx, deltaY: input.dy }, page);
        return;
      case 'key': await live.chrome.cdp.send('Input.dispatchKeyEvent', keyEvent(input), page); return;
      case 'text': await live.chrome.cdp.send('Input.insertText', { text: input.text }, page); return;
    }
  }

  /** A browser or a view stopped: resolves once its Chrome has exited (it still writes to its profile while it shuts down), a view's at once. */
  stop(id: string): Promise<void> {
    const lane = laneOf(id);
    if (lane > 0 && lane <= TESTERS) void this.releaseOwner(id);
    const live = this.live.get(id);
    if (!live) return Promise.resolve();
    this.live.delete(id);
    if (lane === SHARED_LANE) {
      for (const viewer of live.viewers) viewer.end();
      if (live.attached) void live.chrome.cdp.send('Target.detachFromTarget', { sessionId: live.attached.session }).catch(() => {});
      this.deps.onState(id, null);
      return Promise.resolve();
    }
    for (const viewer of live.viewers) viewer.end();
    const exited = this.kill(live.chrome);
    // a tester starts from a clean profile each time its browser is launched
    if (id !== sessionOfBrowser(id)) void exited.then(() => rm(path.join(this.deps.folder, id), { recursive: true, force: true, maxRetries: 5 }));
    this.deps.onState(id, null);
    return exited;
  }

  /** The shared Chrome stopped (idle, gone or Open Space closing), its views with it; its profile stays. */
  private stopShared(chrome?: Chrome): Promise<void> {
    const shared = this.shared;
    if (!shared || (chrome && shared.chrome !== chrome)) return Promise.resolve();
    this.shared = null;
    for (const [id, live] of [...this.live]) if (live.chrome === shared.chrome) void this.stop(id);
    return this.kill(shared.chrome);
  }

  /** Resolves once Chrome has exited: it still writes to its profile while it shuts down. */
  private kill(chrome: Chrome): Promise<void> {
    const exited = chrome.process.exitCode !== null || chrome.process.signalCode !== null
      ? Promise.resolve()
      : new Promise<void>((resolve) => { chrome.process.once('exit', () => resolve()); });
    if (process.platform === 'win32') {
      // Let Chromium release its profile and stop its sandboxed subprocesses itself first.
      void chrome.cdp.send('Browser.close').catch(() => {}).finally(() => chrome.cdp.close());
    } else {
      chrome.cdp.close();
      chrome.process.kill('SIGTERM');
    }
    setTimeout(() => {
      if (chrome.process.exitCode !== null || chrome.process.signalCode !== null) return;
      if (process.platform === 'win32') signalTree(chrome.process.pid, 'SIGKILL');
      else chrome.process.kill('SIGKILL');
    }, 3000).unref();
    return exited;
  }

  /** The session's browser and its testers'. */
  async stopSession(sessionId: string) {
    await Promise.all([...this.live.keys()].filter((id) => sessionOfBrowser(id) === sessionId).map((id) => this.stop(id)));
    // its tabs of the shared browser, its own lane's and its testers'
    await Promise.all(Array.from({ length: TESTERS + 1 }, (_, lane) => this.releaseOwner(browserId(sessionId, lane))));
  }

  /** The session is gone: its browsers and its profile (cookies, history) with them. */
  async forget(sessionId: string) {
    await this.stopSession(sessionId);
    await rm(path.join(this.deps.folder, sessionId), { recursive: true, force: true });
  }

  /** The profiles of sessions that no longer exist (forgotten while Open Space was not running), and the testers' left behind. */
  async sweepProfiles(known: ReadonlySet<string>) {
    const names = await readdir(this.deps.folder).catch(() => []);
    await Promise.all(names.filter((name) => !known.has(name) && name !== SHARED_PROFILE).map((name) => rm(path.join(this.deps.folder, name), { recursive: true, force: true })));
  }

  private closeIdle() {
    for (const [id, live] of this.live) {
      if (live.viewers.size || this.deps.sessionAlive(sessionOfBrowser(id))) { live.idleSince = this.now(); continue; }
      if (this.now() - live.idleSince > IDLE_MS) this.stop(id);
    }
    // the shared Chrome goes when nobody watches it and no Playwright is connected to it
    const shared = this.shared;
    if (!shared) return;
    if (shared.relays || [...this.live.values()].some((live) => live.chrome === shared.chrome && live.viewers.size)) shared.idleSince = this.now();
    else if (this.now() - shared.idleSince > IDLE_MS) void this.stopShared();
  }

  shutdown() {
    clearInterval(this.sweep);
    for (const id of [...this.live.keys()]) this.stop(id);
    void this.stopShared();
  }
}
