// Markdown displayed safely (every message): raw HTML is escaped, only http(s)/mailto links (opened in a new tab),
// remote images are replaced by their alt text. Code blocks get a copy button (copyCodeOnClick copies them).
import { Marked } from 'marked';
import { findMentions } from '../../shared/mentions.ts';
import { t } from '../i18n/index.ts';

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A clipboard, then a tick once copied (components.css swaps them). */
const copyButton = () => `<button type="button" class="cp-code__copy" data-copy aria-label="${escapeHtml(t.common.code.copy)}" title="${escapeHtml(t.common.code.copyTitle)}">`
  + '<svg class="cp-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<g class="cp-code__clipboard"><rect x="4.5" y="3" width="8" height="10.5" rx="1.5"/><path d="M6.5 3V2h4v1"/></g>'
  + '<path class="cp-code__done" d="M3.5 8.5l3 3 6-7"/></svg></button>';

// the session names "@" can name, for the text being parsed (marked has no per-call option an extension can read)
let names: readonly string[] = [];

const marked = new Marked({ breaks: true, gfm: true });
marked.use({
  extensions: [{
    name: 'mention',
    level: 'inline',
    start: (src) => findMentions(src, names)[0]?.start,
    tokenizer(src) {
      const mention = findMentions(src, names)[0];
      if (mention?.start === 0) return { type: 'mention', raw: src.slice(0, mention.end) };
    },
    renderer: ({ raw }) => `<span class="cp-mention"><span class="cp-at">@</span>${escapeHtml(raw.slice(1))}</span>`,
  }],
  renderer: {
    html: ({ text }) => escapeHtml(text ?? ''),
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!SAFE_URL.test(href ?? '')) return text;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    image({ text }) { return escapeHtml(text ?? ''); },
    code({ text, lang, escaped }) {
      const language = /^[\w+-]+$/.test(lang ?? '') ? ` class="language-${lang}"` : '';
      const body = `${text.replace(/\n$/, '')}\n`;
      return `<div class="cp-code"><pre><code${language}>${escaped ? body : escapeHtml(body)}</code></pre>${copyButton()}</div>\n`;
    },
  },
});

/** `mentions`: the session names an "@" in the text can name, shown as in the field. */
export function mdToHtml(text: string, mentions: readonly string[] = []): string {
  names = mentions;
  return marked.parse(text, { async: false }) as string;
}
