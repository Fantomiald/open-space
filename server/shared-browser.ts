// The shared browser: one Chrome kept signed in to the user's own accounts (Google's to start), which every session and
// every tester drives, each in tabs of its own (see server/browser.ts for the browsers of the sessions themselves).
//
// A login cannot be moved from one browser to another: Google refuses copied cookies and signs the first browser out
// too. So the accounts stay in this one Chrome, under a profile of its own that Open Space never deletes, and the user
// signs in to it by hand from a session's browser view. What an owner (a session's own lane, or one of its testers')
// may see of it is its own tabs only: those it created, which come back with the address Open Space gave them
// (`about:blank#os-<nonce>`, echoed by Chrome before it answers Target.createTarget), and the popups they open.
import { randomBytes } from 'node:crypto';
import { sessionOfBrowser } from '../shared/browser.ts';

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
