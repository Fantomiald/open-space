import type { Dictionary } from '../index.ts';

export const metrics: Dictionary['metrics'] = {
  title: 'Numbers',
  empty: 'This file does not exist yet: it will show here once a script or a Claude session has written it.',
  emptyHint: (file) => `The object reads ${file}, which you can change in Settings.`,
  loading: 'Loading…',
  changed: (duration) => `File rewritten ${duration} ago`,
};
