// The links a message may hold (rendered by markdown.ts), and the copied text that keeps their addresses.

/** The only links shown as links, and written out on copy: web pages and email addresses. */
export const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** A link a selection takes in, in the page's order. */
export interface CopiedLink {
  /** The link's text the selection takes: all of it, or the part a selection cut. */
  readonly text: string;
  readonly href: string;
  /** All of the link's text, when the selection cut it. */
  readonly label?: string;
  /** The selected text between the previous link (or the start) and this one, as the page holds it. */
  readonly before?: string;
}

const bare = (address: string) => address.trim().replace(SAFE_URL, '').replace(/\/$/, '').toLowerCase();

/** A bare address shown as a link (`https://…`, `www.…`, an email) already says where it goes. */
const showsItsAddress = (label: string, href: string) => bare(label) === bare(href);

/** Where `text` shows in `plain` from `from` on, after skipping `skip` of its showings. */
function nthIndex(plain: string, text: string, from: number, skip: number): number {
  let at = plain.indexOf(text, from);
  for (let left = skip; left > 0 && at >= 0; left--) at = plain.indexOf(text, at + text.length);
  return at;
}

/**
 * The plain text of a copy with its links written as Markdown, `[text](address)`, so the addresses survive a paste.
 * Each link is looked for after the previous one, past the same words written before it in the selection, so repeated
 * texts map to the right link. A link whose text is its address, one that is not http(s) or mailto, and one whose text
 * is not found (the browser spaced it otherwise) stay as they are.
 */
export function withLinks(plain: string, links: readonly CopiedLink[]): string {
  let copied = '';
  let from = 0;
  for (const link of links) {
    const text = link.text.trim();
    if (!text) continue;
    const skip = (link.before ?? '').split(text).length - 1;
    const found = nthIndex(plain, text, from, skip);
    const at = found >= 0 ? found : plain.indexOf(text, from);
    if (at < 0) continue;
    const kept = SAFE_URL.test(link.href) && !showsItsAddress(link.label ?? text, link.href);
    copied += plain.slice(from, at) + (kept ? `[${text}](${link.href})` : text);
    from = at + text.length;
  }
  return copied + plain.slice(from);
}
