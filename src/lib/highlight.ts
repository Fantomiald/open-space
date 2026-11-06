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
  return highlightWith(LanguageDescription.matchLanguageName(languages, language), code);
}

/** The lines of a file's code coloured by the language its name says (a diff's lines), one HTML string per line; null when none. */
export async function highlightedLines(code: string, fileName: string): Promise<string[] | null> {
  const html = await highlightWith(LanguageDescription.matchFilename(languages, fileName.split('/').pop() ?? fileName), code);
  return html === null ? null : html.split('\n');
}

async function highlightWith(description: LanguageDescription | null, code: string): Promise<string | null> {
  if (!description) return null;
  const { language: parsed } = await description.load();
  let html = '';
  highlightCode(code, parsed.parser.parse(code), classHighlighter,
    (text, classes) => { html += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text); },
    () => { html += '\n'; });
  return html;
}
