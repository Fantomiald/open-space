import type { CSSProperties } from 'react';
import { PIP_MARGIN, type Surface } from '../state/pip.ts';
import type { Box } from '../state/room-frame.ts';

/** A box of the stack as the variables its CSS places it with (components.css, .cp-stack[data-placed]). */
export const boxVariables = ({ left, top, width, height }: Box) =>
  ({ '--x': `${Math.round(left)}px`, '--y': `${Math.round(top)}px`, '--w': `${Math.round(width)}px`, '--h': `${Math.round(height)}px` }) as CSSProperties;

/** The page for the floating windows (mods, the browser out of its window): they stay under the header, which may wrap. */
export function floatingSurface(): Surface {
  const header = document.querySelector('.cp-header')?.getBoundingClientRect().bottom ?? 0;
  return { width: window.innerWidth, height: window.innerHeight, top: Math.round(header) + PIP_MARGIN };
}
