import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { classHighlighter, highlightCode } from '@lezer/highlight';
import { escapeHtml } from './markdown.ts';

/**
 * A code block of a message coloured like the file editor: its text escaped, its tokens in the editor's `tok-*` classes
 * (components.css). Null for a language the editor does not know, which then stays as it is. The language's parser is
 * loaded on first use, so this module is only imported once a message shows a block that names one.
 */
export async function highlighted(code: string, language: string): Promise<string | null> {
  const description = LanguageDescription.matchLanguageName(languages, language);
  if (!description) return null;
  const { language: parsed } = await description.load();
  let html = '';
  highlightCode(code, parsed.parser.parse(code), classHighlighter,
    (text, classes) => { html += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text); },
    () => { html += '\n'; });
  return html;
}
