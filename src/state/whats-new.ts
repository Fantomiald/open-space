/**
 * The version whose news the "What's new" window tells, as major.minor: a patch shows its minor's news. A new minor
 * replaces it here, in i18n (`whatsNew.releases`) and in WhatsNewDialog.tsx (`LOOKS`): only the latest is ever shown.
 */
export const RELEASES = ['1.33'] as const;
export type Release = (typeof RELEASES)[number];

/** "1.30.1" → [1, 30]; nothing for a version that is not one. */
function minorOf(version: string): readonly [number, number] | null {
  const match = /^(\d+)\.(\d+)/.exec(version);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

const compare = (a: readonly [number, number], b: readonly [number, number]) => a[0] - b[0] || a[1] - b[1];

/**
 * The release to tell at this start: the latest one up to the version running, once, if the window was not closed on
 * it already (`seen`: the version it was last closed on, missing if never). Only that one, even after several updates:
 * the older ones are in the release notes.
 */
export function releaseToShow(current: string, seen: string | null, releases: readonly string[] = RELEASES): string | null {
  const now = minorOf(current);
  if (!now) return null;
  const latest = releases.find((release) => { const at = minorOf(release); return at !== null && compare(at, now) <= 0; });
  if (!latest) return null;
  const last = seen === null ? null : minorOf(seen);
  return last && compare(minorOf(latest)!, last) <= 0 ? null : latest;
}
