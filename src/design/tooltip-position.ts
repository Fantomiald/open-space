export interface Rect { left: number; top: number; width: number; height: number }
export interface Size { width: number; height: number }
export type TooltipSide = 'below' | 'above';
export interface TooltipPlacement { left: number; top: number; side: TooltipSide }

/** The space between a tooltip and what it names. */
export const TOOLTIP_GAP = 6;
/** The space a tooltip keeps from the edges of the window. */
export const SCREEN_MARGIN = 8;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Where a tooltip goes, in the window's coordinates: centred under its anchor; above it when there is no room below and
 * there is above; with room on neither side, on the roomier one. It never leaves the window, minus `margin` on each edge.
 */
export function placeTooltip(anchor: Rect, bubble: Size, screen: Size, gap = TOOLTIP_GAP, margin = SCREEN_MARGIN): TooltipPlacement {
  const belowTop = anchor.top + anchor.height + gap;
  const aboveTop = anchor.top - gap - bubble.height;
  const roomBelow = screen.height - margin - belowTop;
  const roomAbove = anchor.top - gap - margin;
  const side: TooltipSide = roomBelow >= bubble.height || (roomAbove < bubble.height && roomBelow >= roomAbove) ? 'below' : 'above';
  const top = clamp(side === 'below' ? belowTop : aboveTop, margin, screen.height - margin - bubble.height);
  const left = clamp(anchor.left + anchor.width / 2 - bubble.width / 2, margin, screen.width - margin - bubble.width);
  return { left: Math.round(left), top: Math.round(top), side };
}
