// The floating browser over the office (BrowserPip): where it sits and how big it is. Pure functions.
import { FORMATS, type BrowserFormat, type BrowserState } from '../../shared/browser.ts';
import type { Box } from './room-frame.ts';
import type { Edge } from './windows.ts';

type Size = { width: number; height: number };

/** the height of its title bar, over the page */
export const PIP_HEAD = 36;
/** its distance to the edges of the window, where it sticks when brought near */
export const PIP_MARGIN = 12;
const STICK = 20;
const MIN_PICTURE = { desktop: 240, mobile: 160 } as const;
/** the size it opens at: the picture's width for a computer's screen, its height for a phone's */
const OPENING = { desktop: 480, mobile: 680 } as const;
/** it opens at the top left, under the header: the sessions' windows and their message fields are on the right */
const OPENING_TOP = 72;

const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
/** the picture's height per pixel of width */
const ratio = (format: BrowserFormat) => FORMATS[format].height / FORMATS[format].width;

/** The width of a picture of `format` and the box that holds it with its title bar, no bigger than the window. */
function sized(width: number, format: BrowserFormat, surface: Size): Size {
  const most = Math.min(surface.width - 2 * PIP_MARGIN, (surface.height - 2 * PIP_MARGIN - PIP_HEAD) / ratio(format));
  const picture = within(width, Math.min(MIN_PICTURE[format], most), most);
  return { width: Math.round(picture), height: Math.round(picture * ratio(format) + PIP_HEAD) };
}

/** Its title bar within the window; near an edge, against it. */
export function placePip(box: Box, surface: Size): Box {
  let left = within(box.left, PIP_MARGIN, surface.width - box.width - PIP_MARGIN);
  let top = within(box.top, PIP_MARGIN, surface.height - box.height - PIP_MARGIN);
  if (Math.abs(left - PIP_MARGIN) < STICK) left = PIP_MARGIN;
  if (Math.abs(surface.width - PIP_MARGIN - box.width - left) < STICK) left = surface.width - PIP_MARGIN - box.width;
  if (Math.abs(top - PIP_MARGIN) < STICK) top = PIP_MARGIN;
  if (Math.abs(surface.height - PIP_MARGIN - box.height - top) < STICK) top = surface.height - PIP_MARGIN - box.height;
  return { left: Math.round(left), top: Math.round(top), width: box.width, height: box.height };
}

/**
 * Its box for `format`, the picture without bands: the size it opens at, or the one it had when the format changes,
 * kept in the corner it is closest to.
 */
export function fitPip(previous: Box | null, format: BrowserFormat, surface: Size): Box {
  const width = previous ? (format === 'desktop' ? Math.max(previous.width, OPENING.desktop) : (Math.max(previous.height, OPENING.mobile) - PIP_HEAD) / ratio(format)) : format === 'desktop' ? OPENING.desktop : OPENING.mobile / ratio(format);
  const size = sized(width, format, surface);
  if (!previous) return placePip({ left: 0, top: OPENING_TOP, ...size }, surface);
  const right = previous.left + previous.width / 2 > surface.width / 2, bottom = previous.top + previous.height / 2 > surface.height / 2;
  return placePip({ left: right ? previous.left + previous.width - size.width : previous.left, top: bottom ? previous.top + previous.height - size.height : previous.top, ...size }, surface);
}

const shownUrl = (state: BrowserState | null | undefined) => state?.tabs.find((tab) => tab.id === state.active)?.url;

/** A browser shows a page, not a blank one: worth floating in sight. */
export const showsPage = (state: BrowserState | null | undefined) => { const url = shownUrl(state); return !!url && url !== 'about:blank'; };

/** A browser just went to a page (not a blank one): its agent or a tester is at work in it, worth floating in sight. */
export function wentToPage(previous: BrowserState | undefined, next: BrowserState | null): boolean {
  return showsPage(next) && shownUrl(next) !== shownUrl(previous);
}

/** `start` pulled by `edge` by dx, dy, its picture keeping the format's proportions; the opposite side or corner stays. */
export function resizePip(start: Box, edge: Edge, dx: number, dy: number, format: BrowserFormat, surface: Size): Box {
  const across = edge === 'n' || edge === 's';
  const pulled = across ? (start.height - PIP_HEAD + (edge === 'n' ? -dy : dy)) / ratio(format) : start.width + (edge.includes('w') ? -dx : dx);
  const size = sized(pulled, format, surface);
  const left = edge.includes('w') ? start.left + start.width - size.width : across ? start.left + (start.width - size.width) / 2 : start.left;
  const top = edge.includes('n') ? start.top + start.height - size.height : start.top;
  return { left: Math.round(within(left, 0, surface.width - size.width)), top: Math.round(within(top, 0, surface.height - size.height)), ...size };
}
