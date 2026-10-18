// The office's numbers object ("Chiffres"): the Markdown file of the settings (`metricsFile`, empty for none) that the
// user's scripts or sessions keep up to date. Only read, on its real path, and only when that is a Markdown file: a
// link named ".md" leading to another file is not followed. Its change time tells the page whether something new waits
// (shared/metrics.ts).
import { readFile, stat } from 'node:fs/promises';
import { MAX_METRICS } from '../shared/metrics.ts';
import type { MetricsFile } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import { resolveFileWith } from './paths.ts';

/** When the numbers file last changed (ms), null when there is none (or not a Markdown file). */
export async function metricsChangedAt(file: string): Promise<number | null> {
  const real = file ? resolveFileWith(file, '.md') : null;
  if (!real) return null;
  try { return Math.round((await stat(real)).mtimeMs); } catch { return null; }
}

/** The numbers file, null when there is none yet. */
export async function readMetrics(file: string): Promise<MetricsFile | null> {
  const real = file ? resolveFileWith(file, '.md') : null;
  if (!real) return null;
  const info = await stat(real);
  if (info.size > MAX_METRICS) throw new Error(st.metrics.tooBig);
  return { text: await readFile(real, 'utf8'), mtime: Math.round(info.mtimeMs) };
}
