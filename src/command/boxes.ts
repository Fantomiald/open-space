import type { CSSProperties } from 'react';
import type { Box } from '../state/room-frame.ts';

/** A box of the stack as the variables its CSS places it with (components.css, .cp-stack[data-placed]). */
export const boxVariables = ({ left, top, width, height }: Box) =>
  ({ '--x': `${Math.round(left)}px`, '--y': `${Math.round(top)}px`, '--w': `${Math.round(width)}px`, '--h': `${Math.round(height)}px` }) as CSSProperties;
