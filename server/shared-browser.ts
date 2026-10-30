// The shared browser: one Chrome kept signed in to the user's own accounts (Google's to start), which every session and
// every tester drives, each in tabs of its own (see server/browser.ts for the browsers of the sessions themselves).
//
// A login cannot be moved from one browser to another: Google refuses copied cookies and signs the first browser out
// too. So the accounts stay in this one Chrome, under a profile of its own that Open Space never deletes, and the user
// signs in to it by hand from a session's browser view. What an owner (a session's own lane, or one of its testers')
// may see of it is its own tabs only: those it created, which come back with the address Open Space gave them
// (`about:blank#os-<nonce>`, echoed by Chrome before it answers Target.createTarget), and the popups they open.
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { sessionOfBrowser } from '../shared/browser.ts';
import { asArray, asJson, asString } from './json.ts';

/** The folder of the shared browser's profile under OFFICE_DIR/browsers: no session id starts with "_". */
export const SHARED_PROFILE = '_shared';
/** The sites whose logins the shared browser keeps, with their subdomains: what an owner leaves on any other is cleared. */
export const KEPT_SITES: readonly string[] = ['google.com'];

const NONCE = /#os-([0-9a-f]{16})$/;

export interface TargetInfo { targetId: string; type?: string; url?: string; openerId?: string }

/** Whether `host` (or a cookie's domain, its leading dot aside) is one of the kept sites or under one. */
export function isKept(host: string, kept: readonly string[] = KEPT_SITES): boolean {
  const name = host.replace(/^\./, '').toLowerCase();
  return kept.some((site) => name === site || name.endsWith(`.${site}`));
}

const under = (host: string, domain: string) => {
  const name = domain.replace(/^\./, '').toLowerCase();
  return host === name || host.endsWith(`.${name}`);
};

/** The cookies to delete: those sent to one of `hosts`, or with no `hosts` every one, the kept sites' aside. */
export function cookiesToClear<T extends { domain: string }>(cookies: T[], hosts?: readonly string[], kept: readonly string[] = KEPT_SITES): T[] {
  return cookies.filter((cookie) => !isKept(cookie.domain, kept) && (!hosts || hosts.some((host) => under(host, cookie.domain))));
}

/** Who owns which tab of the shared browser, and the sites each owner's tabs went to. An owner is a browserId. */
export class SharedTabs {
  private readonly owners = new Map<string, string>();
  private readonly expected = new Map<string, string>();
  private readonly visited = new Map<string, Set<string>>();

  /** The address to create a tab of `owner` with: the tab is known to be its own when Chrome reports it. */
  expect(owner: string): string {
    const nonce = randomBytes(8).toString('hex');
    this.expected.set(nonce, owner);
    return `about:blank#os-${nonce}`;
  }

  /** The owner of a target, found once by its address or its opener and kept: none for a target nobody created. */
  claim(info: TargetInfo): string | undefined {
    if (info.type !== undefined && info.type !== 'page') return undefined;
    const known = this.owners.get(info.targetId);
    if (known) return known;
    const nonce = NONCE.exec(info.url ?? '')?.[1];
    const owner = (nonce && this.expected.get(nonce)) || (info.openerId ? this.owners.get(info.openerId) : undefined);
    if (!owner) return undefined;
    if (nonce) this.expected.delete(nonce);
    this.owners.set(info.targetId, owner);
    return owner;
  }

  ownerOf(targetId: string): string | undefined {
    return this.owners.get(targetId);
  }

  /** A page an owner's tab went to: its site is cleared when the owner goes. */
  visit(targetId: string, url: string) {
    const owner = this.owners.get(targetId);
    if (!owner) return;
    let host: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      host = parsed.hostname;
    } catch { return; }
    const hosts = this.visited.get(owner) ?? new Set<string>();
    hosts.add(host);
    this.visited.set(owner, hosts);
  }

  forget(targetId: string) {
    this.owners.delete(targetId);
  }

  /** The tabs of every owner of a session: its own lane and its testers'. */
  tabsOfSession(sessionId: string): string[] {
    return [...this.owners].filter(([, owner]) => sessionOfBrowser(owner) === sessionId).map(([tab]) => tab);
  }

  /** The owner is gone: its tabs to close and the sites to clear (the kept ones aside), forgotten here. */
  release(owner: string): { tabs: string[]; hosts: string[] } {
    const tabs = [...this.owners].filter(([, each]) => each === owner).map(([tab]) => tab);
    for (const tab of tabs) this.owners.delete(tab);
    for (const [nonce, each] of this.expected) if (each === owner) this.expected.delete(nonce);
    const hosts = [...(this.visited.get(owner) ?? [])].filter((host) => !isKept(host));
    this.visited.delete(owner);
    return { tabs, hosts };
  }
}

export type CdpMessage = Record<string, unknown>;

/** The ids of the filter's own calls to Chrome (letting go of a hidden target), far above Playwright's. */
const OWN_CALLS = 1_000_000_000;
/** What would reach every site's cookies at once: reading them would copy the login out, clearing them sign the user out. */
const BLOCKED = new Set(['Storage.getCookies', 'Storage.clearCookies', 'Network.getAllCookies', 'Network.clearBrowserCookies', 'Storage.clearDataForOrigin']);
/** The browser-level calls aimed at one target, refused for a target of another owner. */
const AIMED = new Set(['Target.attachToTarget', 'Target.closeTarget', 'Target.activateTarget', 'Target.getTargetInfo', 'Target.detachFromTarget', 'Target.exposeDevToolsProtocol']);
const DISCOVERED = new Set(['Target.targetCreated', 'Target.targetInfoChanged']);
const GONE = new Set(['Target.targetDestroyed', 'Target.targetCrashed']);

/** An answer of the filter itself, on the session it was asked on (Playwright would take it for another one's otherwise). */
const refusal = (id: unknown, message: string, session?: string): CdpMessage => ({ id, error: { code: -32000, message }, ...(session !== undefined ? { sessionId: session } : {}) });
const blank = (url: unknown) => url === undefined || url === '' || url === 'about:blank';

/**
 * The shared browser as one owner's Playwright sees it: the CDP traffic between them, with every target of another owner
 * left out. Chrome attaches every client to every tab (Target.setAutoAttach), so the tabs of others are let go of here,
 * resumed first when they wait for the debugger (they would stay paused for everyone otherwise).
 */
export class SharedCdpFilter {
  private readonly owner: string;
  private readonly tabs: SharedTabs;
  /** the sessions of this owner's targets (its tabs, their frames and workers), the only ones it may send to */
  private readonly held = new Set<string>();
  /** the sessions of others' targets that Chrome attached this connection to, until they are let go of */
  private readonly hidden = new Set<string>();
  /** sessions on the browser itself (Target.attachToBrowserTarget, behind Playwright's newCDPSession): held to the browser's rules */
  private readonly browserSessions = new Set<string>();
  private readonly opening = new Set<unknown>();
  /** the targets this owner was shown, so that it hears when they go even once they are forgotten */
  private readonly shown = new Set<string>();
  private readonly listing = new Set<unknown>();
  private readonly attaching = new Set<unknown>();
  private next = OWN_CALLS;

  constructor(owner: string, tabs: SharedTabs) {
    this.owner = owner;
    this.tabs = tabs;
  }

  /** A message of Playwright: passed on to Chrome, or answered here when it reaches beyond the owner. */
  fromClient(message: CdpMessage): { upstream?: CdpMessage; client?: CdpMessage; close?: true } {
    const { id, method } = message;
    const params = asJson(message.params);
    const session = typeof message.sessionId === 'string' ? message.sessionId : undefined;
    if (typeof method !== 'string') return { client: refusal(id, 'Not a command', session) };
    if (BLOCKED.has(method)) return { client: refusal(id, `${method} is not allowed in the shared browser`, session) };
    if (session !== undefined && !this.browserSessions.has(session)) return this.held.has(session) ? { upstream: message } : { client: refusal(id, 'Session with given id not found.', session) };
    if (method === 'Browser.close') return { client: { id, result: {}, ...(session !== undefined ? { sessionId: session } : {}) }, close: true };
    if (method === 'Target.createTarget') {
      if (!blank(params.url)) return { client: refusal(id, 'Only about:blank opens in the shared browser', session) };
      // in a window of its own: a background tab of a shared window gets no animation frame, so its owner could not click in it
      return { upstream: { ...message, params: { ...params, url: this.tabs.expect(this.owner), newWindow: true } } };
    }
    if (AIMED.has(method)) {
      if (typeof params.targetId === 'string' && this.tabs.ownerOf(params.targetId) !== this.owner) return { client: refusal(id, 'No target with given id found', session) };
      if (typeof params.sessionId === 'string' && !this.held.has(params.sessionId)) return { client: refusal(id, 'Session with given id not found.', session) };
    }
    if (method === 'Target.getTargets') this.listing.add(id);
    if (method === 'Target.attachToTarget') this.attaching.add(id);
    if (method === 'Target.attachToBrowserTarget') this.opening.add(id);
    return { upstream: message };
  }

  /** A message of Chrome: passed on to Playwright when it concerns this owner's targets. */
  fromUpstream(message: CdpMessage): { client?: CdpMessage; upstream: CdpMessage[] } {
    if (message.id !== undefined) return this.answer(message);
    const method = asString(message.method);
    const params = asJson(message.params);
    const session = typeof message.sessionId === 'string' ? message.sessionId : undefined;
    if (session !== undefined && !this.browserSessions.has(session)) {
      if (!this.held.has(session)) return { upstream: [] };
      // a frame or a worker of a held tab is held with it
      if (method === 'Target.attachedToTarget') this.held.add(asString(params.sessionId));
      if (method === 'Target.detachedFromTarget') this.held.delete(asString(params.sessionId));
      return { client: message, upstream: [] };
    }
    if (method === 'Target.attachedToTarget') return this.attached(message, params);
    if (method === 'Target.detachedFromTarget') {
      const detached = asString(params.sessionId);
      if (this.browserSessions.delete(detached)) return { client: message, upstream: [] };
      if (this.hidden.delete(detached) || !this.held.delete(detached)) return { upstream: [] };
      return { client: message, upstream: [] };
    }
    if (DISCOVERED.has(method)) return this.mine(asJson(params.targetInfo)) ? { client: message, upstream: [] } : { upstream: [] };
    if (GONE.has(method)) return this.shown.delete(asString(params.targetId)) ? { client: message, upstream: [] } : { upstream: [] };
    return { client: message, upstream: [] };
  }

  private mine(info: Record<string, unknown>): boolean {
    const target = asString(info.targetId);
    const mine = this.tabs.claim({ targetId: target, type: typeof info.type === 'string' ? info.type : undefined, url: asString(info.url), openerId: typeof info.openerId === 'string' ? info.openerId : undefined }) === this.owner;
    if (mine) this.shown.add(target);
    return mine;
  }

  private attached(message: CdpMessage, params: Record<string, unknown>): { client?: CdpMessage; upstream: CdpMessage[] } {
    const session = asString(params.sessionId);
    // the browser itself is only ever attached to on this connection's request (Target.attachToBrowserTarget)
    if (asJson(params.targetInfo).type === 'browser') {
      this.browserSessions.add(session);
      return { client: message, upstream: [] };
    }
    if (this.mine(asJson(params.targetInfo))) {
      this.held.add(session);
      return { client: message, upstream: [] };
    }
    this.hidden.add(session);
    const release: CdpMessage[] = [];
    if (params.waitingForDebugger === true) release.push({ id: ++this.next, method: 'Runtime.runIfWaitingForDebugger', sessionId: session, params: {} });
    release.push({ id: ++this.next, method: 'Target.detachFromTarget', params: { sessionId: session } });
    return { upstream: release };
  }

  private answer(message: CdpMessage): { client?: CdpMessage; upstream: CdpMessage[] } {
    if (typeof message.id === 'number' && message.id > OWN_CALLS) return { upstream: [] };
    const result = asJson(message.result);
    if (this.attaching.delete(message.id) && typeof result.sessionId === 'string') this.held.add(result.sessionId);
    if (this.opening.delete(message.id) && typeof result.sessionId === 'string') this.browserSessions.add(result.sessionId);
    if (this.listing.delete(message.id)) {
      const targetInfos = asArray(result.targetInfos).filter((info) => this.mine(asJson(info)));
      return { client: { ...message, result: { ...result, targetInfos } }, upstream: [] };
    }
    return { client: message, upstream: [] };
  }
}

/**
 * One owner's Playwright connected to the shared Chrome through Open Space (`client`, its WebSocket on Open Space's server),
 * every message going through the owner's filter. Either side closing closes the other: a Playwright whose browser went
 * away connects again at its next call.
 */
export function relaySharedCdp(client: WebSocket, upstreamUrl: string, owner: string, tabs: SharedTabs) {
  const filter = new SharedCdpFilter(owner, tabs);
  const upstream = new WebSocket(upstreamUrl, { perMessageDeflate: false, maxPayload: 64_000_000 });
  const waiting: string[] = [];
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    client.close();
    if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
    else upstream.close();
  };
  const parse = (data: unknown): CdpMessage | null => {
    try { return { ...asJson(JSON.parse(String(data))) }; } catch { return null; }
  };
  const toChrome = (message: CdpMessage) => {
    const data = JSON.stringify(message);
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
    else waiting.push(data);
  };
  const toPlaywright = (message: CdpMessage) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message)); };
  client.on('message', (data) => {
    const message = parse(data);
    if (!message) return;
    const result = filter.fromClient(message);
    if (result.upstream) toChrome(result.upstream);
    if (result.client) toPlaywright(result.client);
    if (result.close) end();
  });
  upstream.on('open', () => { for (const data of waiting.splice(0)) upstream.send(data); });
  upstream.on('message', (data) => {
    const message = parse(data);
    if (!message) return;
    const result = filter.fromUpstream(message);
    for (const call of result.upstream) toChrome(call);
    if (result.client) toPlaywright(result.client);
  });
  client.on('close', end);
  upstream.on('close', end);
  client.on('error', end);
  upstream.on('error', end);
}
