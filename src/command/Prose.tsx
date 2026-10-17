import { mdToHtml } from '../lib/markdown.ts';

/**
 * A message or a report in Markdown, rendered. The one place HTML is set by hand: mdToHtml escapes any raw HTML in the
 * text and keeps only http(s) and mailto links, so what Claude writes cannot inject markup.
 */
export function Prose({ text, className }: { text: string; className: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: mdToHtml escapes raw HTML (see src/lib/markdown.ts)
  return <div className={`${className} cp-prose`} dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />;
}
