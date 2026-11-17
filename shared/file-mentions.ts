// "@path" in a message: a file or a folder of the session's folder, written the way Claude Code reads it. Claude Code
// attaches what such a path names to the message, in `claude -p` too (a file's text, a folder's list: see
// docs/ARCHITECTURE.md). The server lists the folder (server/file-mentions.ts) and ranks its paths here; the page ranks
// the last answer again while the next one comes.
import { fold } from './search.ts';

/** A file or a folder of a session's folder, `path` from it with "/" between names (no "/" at the end of a folder). */
export interface PathEntry { path: string; folder: boolean }

/** How many paths the server answers a query with. */
export const MAX_PATH_MATCHES = 50;

/** Lowercase without accents; most paths are plain ASCII and skip the slow way. */
const folded = (text: string) => (/^[\x20-\x7e]*$/.test(text) ? text.toLowerCase() : fold(text).folded);
const depth = (path: string) => path.split('/').length;

/** The folder a path is in, from the session's folder ('' : the folder itself). */
export const folderOfPath = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/**
 * The paths that fit what follows the "@", accents and case aside, best first: the path typed in full, then the names in
 * the folder typed ("src/co": what is in src starting with "co"; without a "/", at the top of the session's folder),
 * then those names deeper or in a folder of that name anywhere, then the paths that hold the text. The shallowest first
 * in each.
 */
export function rankPaths(entries: readonly PathEntry[], query: string, limit = MAX_PATH_MATCHES): PathEntry[] {
  const wanted = folded(query.trim());
  const cut = wanted.lastIndexOf('/');
  const folder = wanted.slice(0, cut + 1);
  const start = wanted.slice(cut + 1);
  const tiers: { entry: PathEntry; key: string }[][] = [[], [], [], []];
  for (const entry of entries) {
    const key = folded(entry.path);
    const named = entry.folder ? `${key}/` : key;
    const parent = key.slice(0, key.lastIndexOf('/') + 1);
    const starts = key.slice(parent.length).startsWith(start);
    const tier = named === wanted ? 0
      : starts && parent === folder ? 1
        : starts && (!folder || parent.endsWith(`/${folder}`)) ? 2
          : named.includes(wanted) ? 3 : -1;
    if (tier >= 0) tiers[tier].push({ entry, key });
  }
  const ranked: PathEntry[] = [];
  for (const tier of tiers) {
    if (ranked.length >= limit) break;
    // a plain comparison: a large folder can match by the thousand, and a collator is slow
    const order = tier.map((item) => ({ ...item, depth: depth(item.key) })).sort((a, b) => a.depth - b.depth || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    ranked.push(...order.slice(0, limit - ranked.length).map((item) => item.entry));
  }
  return ranked;
}

/**
 * What completing a path writes in the message (`caret`: where the caret goes in it; `whole`: what is typed once it is
 * all there). A folder ends with "/" and no space, to type on into it; a path with a space goes in quotes, as Claude
 * Code writes it (`@"my notes.txt"`), the caret before the closing quote for a folder.
 */
export function pathMention(entry: PathEntry): { insert: string; caret: number; whole: string } {
  const shown = entry.folder ? `${entry.path}/` : entry.path;
  if (!/\s/.test(shown)) {
    const insert = entry.folder ? `@${shown}` : `@${shown} `;
    return { insert, caret: insert.length, whole: `@${shown}` };
  }
  if (entry.folder) return { insert: `@"${shown}"`, caret: shown.length + 2, whole: `@"${shown}` };
  return { insert: `@"${shown}" `, caret: shown.length + 4, whole: `@"${shown}"` };
}
