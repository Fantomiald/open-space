import { useEffect, useMemo, useRef } from 'react';
import { mentionNames } from '../../shared/mentions.ts';
import { mdToHtml } from '../lib/markdown.ts';
import { useSessions } from '../state/sessions.ts';

const LANGUAGE_CLASS = 'language-';

/**
 * Colours the code blocks that name their language, once the highlighter and that language have loaded. A block
 * replaced in the meantime (the message still streaming) is left alone: the next render colours its successor.
 */
function highlightBlocks(root: HTMLElement) {
  const blocks = [...root.querySelectorAll<HTMLElement>(`pre > code[class^="${LANGUAGE_CLASS}"]`)];
  if (blocks.length === 0) return;
  void import('../lib/highlight.ts').then(({ highlighted }) => {
    for (const block of blocks) {
      const code = block.textContent ?? '';
      void highlighted(code, block.className.slice(LANGUAGE_CLASS.length)).then((html) => {
        if (html !== null && block.isConnected && block.textContent === code) block.innerHTML = html;
      });
    }
  });
}

/**
 * A message or a report in Markdown, rendered. The one place HTML is set by hand: mdToHtml escapes any raw HTML in the
 * text and keeps only http(s) and mailto links, so what Claude writes cannot inject markup; the code blocks coloured
 * afterwards get the same escaped text, split into spans. The sessions named with "@" show in color, as in the field.
 */
export function Prose({ text, className }: { text: string; className: string }) {
  const sessions = useSessions((s) => s.sessions);
  const html = useMemo(() => mdToHtml(text, mentionNames(Object.values(sessions))), [text, sessions]);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { if (root.current) highlightBlocks(root.current); }, [html]);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: mdToHtml escapes raw HTML (see src/lib/markdown.ts)
  return <div ref={root} className={`${className} cp-prose`} dangerouslySetInnerHTML={{ __html: html }} />;
}
