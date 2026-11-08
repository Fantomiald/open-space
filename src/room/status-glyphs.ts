import type { Status } from './cast.ts';

/** Pixels of a glyph, as [x, y] on its grid. */
export type Glyph = readonly (readonly [number, number])[];

/** The status glyphs, on a 5 x 5 grid: on the room's name tags and on the faces of the session list. */
export const STATUS_GLYPHS: Readonly<Record<Exclude<Status, 'working' | null>, Glyph>> = {
  // two chevrons pressing a bar from above and below: the conversation shrinks
  compacting: [[1, 0], [2, 1], [3, 0], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 4], [2, 3], [3, 4]],
  permission: [[2, 0], [2, 1], [2, 2], [2, 4]],
  question: [[1, 0], [2, 0], [3, 0], [3, 1], [2, 2], [2, 4]],
  finished: [[0, 2], [1, 3], [2, 2], [3, 1], [4, 0]],
  error: [[0, 0], [4, 0], [1, 1], [3, 1], [2, 2], [1, 3], [3, 3], [0, 4], [4, 4]],
};

/**
 * A git branch on a 6 x 7 grid, after the name of a session on a branch of its own, like the page's icon: the trunk
 * down to its node at the bottom left, the branch's node at the top right, and the branch coming down to the trunk.
 */
export const BRANCH_GLYPH: Glyph = [
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [0, 5], [2, 5], [1, 6],
  [4, 0], [3, 1], [5, 1], [4, 2],
  [4, 3], [3, 4],
];
export const BRANCH_GLYPH_WIDTH = 6;
export const BRANCH_GLYPH_HEIGHT = 7;

/** Working is three dots on the middle row, one lifted at a time, each for WORKING_STEP_MS. */
export const WORKING_DOTS = [0, 2, 4] as const;
export const WORKING_STEP_MS = 300;

/**
 * A little robot's head on a 7 x 7 grid, before the role of an automaton (shared/automata.ts): its antenna, a square
 * head, two eyes and a mouth, so an automaton's tag never reads as a session's.
 */
export const BOT_GLYPH: Glyph = [
  [3, 0],
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
  [0, 2], [6, 2], [0, 3], [2, 3], [4, 3], [6, 3], [0, 4], [6, 4],
  [0, 5], [2, 5], [3, 5], [4, 5], [6, 5],
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6],
];
export const BOT_GLYPH_SIZE = 7;
