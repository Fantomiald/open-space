import { isInside } from './worktrees.ts';

/** The folder a session runs in when none is given: the one chosen in the settings while it is still allowed, else the first root. */
export const defaultFolder = (roots: readonly string[], chosen = '') =>
  (chosen && roots.some((root) => isInside(chosen, root)) ? chosen : roots[0] ?? '');
