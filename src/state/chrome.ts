// What sits around the windows and the room, moved by hand like a window: the sessions' panel, the status card, the Alt
// tip, and the header's pills (the rooms and projects, the radio, the tools). Each stays where the CSS puts it until it is
// placed somewhere else; the panel docks down the left of the page or floats. Pure functions, kept in this browser.
import type { Box } from './room-frame.ts';
import { clampBox, GAP, snapMove, type Guide, type Size } from './windows.ts';

/**
 * `headerStart` held the radio too before it moved on its own: a layout saved then keeps the radio in its place of the
 * CSS (no `radio` entry), the rooms and projects where they were.
 */
export const CHROME_IDS = ['panel', 'status', 'hint', 'headerStart', 'radio', 'headerEnd'] as const;
export type ChromeId = (typeof CHROME_IDS)[number];

/** How the page's elements were placed by hand. */
export interface ChromeLayout {
  /** the elements moved, in pixels of the page (absent: where the CSS puts them); the panel placed here floats */
  places: Partial<Record<ChromeId, Box>>;
  /** the width of the docked panel pulled by hand, in pixels (null: --list-width) */
  panelWidth: number | null;
}

export const DEFAULT_CHROME: ChromeLayout = { places: {}, panelWidth: null };

/** how wide the docked panel may be pulled; 18rem (--list-width) until it is */
export const PANEL_WIDTHS = { min: 14 * 16, max: 30 * 16, initial: 18 * 16 };
/** the smallest a floating panel may be pulled to */
export const MIN_CHROME: Size = { width: PANEL_WIDTHS.min, height: 12 * 16 };
/** the panel let go with its left side this close to the page's left edge docks there again */
export const DOCK_DISTANCE = 32;

const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isBox = (value: unknown): value is Box =>
  isRecord(value) && ['left', 'top', 'width', 'height'].every((key) => Number.isFinite(value[key])) && (value.width as number) > 0 && (value.height as number) > 0;
/** The box an element keeps: the panel never smaller than MIN_CHROME (one let go folded down to the faces unfolds whole). */
const sizedFor = (id: ChromeId, box: Box): Box => {
  const min = id === 'panel' ? MIN_CHROME : { width: 0, height: 0 };
  return { left: box.left, top: box.top, width: Math.max(box.width, min.width), height: Math.max(box.height, min.height) };
};

export const panelWidthOf = (width: number) => within(Math.round(width), PANEL_WIDTHS.min, PANEL_WIDTHS.max);

/** What this browser kept, without what a broken value or an element that no longer exists left there. */
export function sanitizeChrome(raw: unknown): ChromeLayout {
  const places: ChromeLayout['places'] = {};
  const kept = isRecord(raw) && isRecord(raw.places) ? raw.places : {};
  for (const id of CHROME_IDS) {
    const box = kept[id];
    if (isBox(box)) places[id] = sizedFor(id, box);
  }
  const width = isRecord(raw) ? raw.panelWidth : null;
  return { places, panelWidth: Number.isFinite(width) ? panelWidthOf(width as number) : null };
}

export const panelFloats = (layout: ChromeLayout) => layout.places.panel !== undefined;

/** Wholly on the page when it fits (a page made smaller since, another screen), else from its top left corner. */
export function keepOnPage(box: Box, page: Size): Box {
  const width = Math.min(box.width, page.width), height = Math.min(box.height, page.height);
  return { left: within(box.left, 0, page.width - width), top: within(box.top, 0, page.height - height), width, height };
}

/** Pulled by a side past the edge of the page: that side stops there, the others stay where they are. */
export function trimToPage(box: Box, page: Size): Box {
  const left = Math.max(box.left, 0), top = Math.max(box.top, 0);
  return { left, top, width: Math.min(box.left + box.width, page.width) - left, height: Math.min(box.top + box.height, page.height) - top };
}

export const placeChrome = (layout: ChromeLayout, id: ChromeId, box: Box): ChromeLayout => ({ ...layout, places: { ...layout.places, [id]: sizedFor(id, box) } });

/** The panel back down the left of the page, at the width it had there. */
export function dockPanel(layout: ChromeLayout): ChromeLayout {
  const { panel: _floating, ...places } = layout.places;
  return { ...layout, places };
}

export const resizePanel = (layout: ChromeLayout, width: number): ChromeLayout => ({ ...layout, panelWidth: panelWidthOf(width) });

/** Where the panel carried docks when let go: its left side near the page's left edge. */
export const docksPanel = (box: Box) => box.left <= DOCK_DISTANCE;

/** The place the docked panel takes, drawn while it is carried there. */
export const dockZone = (width: number, page: Size): Box => ({ left: GAP, top: GAP, width, height: page.height - 2 * GAP });

/** An element carried: on the page, sticking to the edges near it (the page's, the others') unless `loose` (Cmd held). */
export function carryChrome(box: Box, others: readonly Box[], page: Size, loose: boolean): { box: Box; guides: Guide[] } {
  const kept = keepOnPage(box, page);
  return loose ? { box: kept, guides: [] } : snapMove(kept, others, page);
}

/** A window placed by hand stays on the page, clear of the docked panel on its left: moved, it is pushed back. */
export function fitWindow(box: Box, area: Size, panelDocked: boolean): Box {
  const kept = clampBox(box, area);
  return panelDocked ? { ...kept, left: Math.max(kept.left, 0) } : kept;
}

/** Pulled by its left side past the docked panel: that side stops at 0, the right side stays put. */
export function fitPulledWindow(box: Box, area: Size, panelDocked: boolean): Box {
  const kept = clampBox(box, area);
  return panelDocked && kept.left < 0 ? { ...kept, left: 0, width: kept.width + kept.left } : kept;
}
