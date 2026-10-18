// The office's numbers object ("Chiffres"), opt-in: any Markdown file the user's scripts or a Claude session keep up to
// date (the metrics file of the settings, empty for none), shown read-only in the page, with a badge on the object
// while what changed in it is not looked at yet. Shared because the page checks the setting the way the server does.

/** The longest numbers file read, in bytes. */
export const MAX_METRICS = 1_000_000;

/** A full path ("/…" or "~/…") to a Markdown file, as the settings take it, or nothing (no numbers object). */
export const isMetricsPath = (file: string) => file.trim() === '' || (/^(\/|~\/)[^\0]*\.md$/i.test(file.trim()) && file.length <= 1000);

/** Something new not looked at yet: the file changed after the panel last showed it (`seenAt`: its change time then, 0 never). */
export const hasNewMetrics = (mtime: number | null, seenAt: number) => mtime !== null && mtime > seenAt;
