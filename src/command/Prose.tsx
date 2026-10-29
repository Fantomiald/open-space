import { useMemo } from 'react';
import { mentionNames } from '../../shared/mentions.ts';
import { mdToHtml } from '../lib/markdown.ts';
import { useSessions } from '../state/sessions.ts';

/**
 * A message or a report in Markdown, rendered. The one place HTML is set by hand: mdToHtml escapes any raw HTML in the
 * text and keeps only http(s) and mailto links, so what Claude writes cannot inject markup. The sessions named with
 * "@" show in color, as in the field.
 */
export function Prose({ text, className }: { text: string; className: string }) {
  const sessions = useSessions((s) => s.sessions);
  const html = useMemo(() => mdToHtml(text, mentionNames(Object.values(sessions))), [text, sessions]);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: mdToHtml escapes raw HTML (see src/lib/markdown.ts)
  return <div className={`${className} cp-prose`} dangerouslySetInnerHTML={{ __html: html }} />;
}
