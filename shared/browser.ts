// The browser each session may drive (see server/browser.ts): what the page shows of it and what the user does in it.

/**
 * Which browser of a session: its own (lane 0, driven by its Playwright server) or the one of its nth tester, a
 * sub-agent with a browser of its own (lane n). Used as the key of the browsers, in the server and in the page.
 */
export const browserId = (sessionId: string, lane = 0) => (lane ? `${sessionId}.${lane}` : sessionId);
export const sessionOfBrowser = (id: string) => id.split('.')[0];
export const laneOf = (id: string) => Number(id.split('.')[1] ?? 0);
/** The lanes of a session's running browsers, its own first. */
export const lanesOf = (ids: readonly string[], sessionId: string) => ids.filter((id) => sessionOfBrowser(id) === sessionId).map(laneOf).sort((a, b) => a - b);

export interface BrowserTab { id: string; url: string; title: string }

/** The screen the browser's pages lay out for, whatever the size of the view showing them. */
export type BrowserFormat = 'desktop' | 'mobile';

/** `scale`: the picture's pixels per page pixel, sharp enough in a view smaller than the page. */
export const FORMATS: Record<BrowserFormat, { width: number; height: number; scale: number; mobile: boolean }> = {
  desktop: { width: 1920, height: 1080, scale: 1, mobile: false },
  mobile: { width: 390, height: 844, scale: 2, mobile: true },
};

export interface BrowserState {
  tabs: BrowserTab[];
  /** the tab shown, and the one the user's clicks and keys go to */
  active: string | null;
  format: BrowserFormat;
}

export type BrowserAction =
  | { kind: 'open' }
  | { kind: 'navigate'; url: string }
  | { kind: 'back' | 'forward' | 'reload' | 'stop' }
  | { kind: 'tab' | 'closeTab'; id: string }
  | { kind: 'format'; format: BrowserFormat };

/** Bits of CDP's `modifiers`. */
export const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 } as const;

export type MouseButton = 'left' | 'middle' | 'right' | 'none';

/** What the user does over the picture of the page: x and y as fractions of it, the server turns them into the page's pixels. */
export type BrowserInput =
  | { kind: 'mouse'; type: 'mousePressed' | 'mouseReleased' | 'mouseMoved'; x: number; y: number; button: MouseButton; clicks: number; modifiers: number }
  | { kind: 'wheel'; x: number; y: number; dx: number; dy: number }
  | { kind: 'key'; type: 'keyDown' | 'keyUp'; key: string; code: string; modifiers: number }
  | { kind: 'text'; text: string };

const LOCAL = /^(localhost|127(\.\d+){3}|0\.0\.0\.0|\[::1\]|[\w-]+:\d+)(:\d+)?([/?#]|$)/i;
const HOST = /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/;

/**
 * What the address bar opens: a web address as typed, a local one in http ("localhost:5173"), a host in https,
 * anything else searched for. Other schemes (file:, javascript:, chrome:) are refused.
 */
export function addressOf(typed: string): string | null {
  const text = typed.trim();
  if (!text) return null;
  if (/^(https?:\/\/\S|about:blank$)/i.test(text)) return text;
  if (/\s/.test(text)) return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  if (LOCAL.test(text)) return `http://${text}`;
  if (HOST.test(text)) return `https://${text}`;
  if (/^[a-z][\w+.-]*:/i.test(text)) return null;
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}
