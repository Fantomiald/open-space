// A dialog carried and resized by hand (the settings, Modal's `movable`): where it sits and how big it is. Pure functions.
import { within } from './pip.ts';
import type { Box } from './room-frame.ts';
import type { Edge } from './windows.ts';

type Size = { width: number; height: number };

/** no smaller than its menu beside a readable section */
export const PANEL_MIN: Size = { width: 560, height: 360 };
/** its distance to the edges of the window, which it never crosses */
export const PANEL_MARGIN = 12;

/** Its size within the window (no smaller than PANEL_MIN unless the window is), then the whole of it within the window. */
export function placePanel(box: Box, screen: Size): Box {
  const most = { width: screen.width - 2 * PANEL_MARGIN, height: screen.height - 2 * PANEL_MARGIN };
  const width = Math.round(within(box.width, Math.min(PANEL_MIN.width, most.width), most.width));
  const height = Math.round(within(box.height, Math.min(PANEL_MIN.height, most.height), most.height));
  const left = within(box.left, PANEL_MARGIN, screen.width - PANEL_MARGIN - width);
  const top = within(box.top, PANEL_MARGIN, screen.height - PANEL_MARGIN - height);
  return { left: Math.round(left), top: Math.round(top), width, height };
}

/** `start` pulled by `edge` by dx, dy, within the window; the opposite side or corner stays. */
export function resizePanel(start: Box, edge: Edge, dx: number, dy: number, screen: Size): Box {
  const right = start.left + start.width, bottom = start.top + start.height;
  const horizontal = edge.includes('w') ? { from: within(start.left + dx, PANEL_MARGIN, right - PANEL_MIN.width), to: right }
    : edge.includes('e') ? { from: start.left, to: within(right + dx, start.left + PANEL_MIN.width, screen.width - PANEL_MARGIN) }
    : { from: start.left, to: right };
  const vertical = edge.includes('n') ? { from: within(start.top + dy, PANEL_MARGIN, bottom - PANEL_MIN.height), to: bottom }
    : edge.includes('s') ? { from: start.top, to: within(bottom + dy, start.top + PANEL_MIN.height, screen.height - PANEL_MARGIN) }
    : { from: start.top, to: bottom };
  return placePanel({ left: horizontal.from, top: vertical.from, width: horizontal.to - horizontal.from, height: vertical.to - vertical.from }, screen);
}
