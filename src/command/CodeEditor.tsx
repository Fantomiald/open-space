// The editor of the file explorer, CodeMirror 6. Loaded only when a file is first opened (see FilesView), with the
// language of the file loaded by its name. Its colours come from the tokens: the highlighter only gives classes
// ("tok-keyword"…), styled in components.css.
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { classHighlighter } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

/** `text` is read once: the editor is keyed by the parent when the text under it is replaced. */
export default function CodeEditor({ path, text, label, onChange, onSave }: { path: string; text: string; label: string; onChange: (text: string) => void; onSave: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  // the latest callbacks, without making a new editor for each
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };
  // biome-ignore lint/correctness/useExhaustiveDependencies: one editor per text, read once (the parent keys it)
  useEffect(() => {
    if (!host.current) return;
    const language = new Compartment();
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), foldGutter(), history(), drawSelection(), indentOnInput(), bracketMatching(), closeBrackets(),
          autocompletion(), highlightActiveLine(), highlightSelectionMatches(), search({ top: true }), syntaxHighlighting(classHighlighter),
          EditorView.lineWrapping, language.of([]),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: () => { callbacks.current.onSave(); return true; } },
            ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab,
          ]),
          EditorView.updateListener.of((update) => { if (update.docChanged) callbacks.current.onChange(update.state.doc.toString()); }),
        ],
      }),
    });
    let current = true;
    LanguageDescription.matchFilename(languages, path.split('/').pop() ?? path)?.load().then((support) => {
      if (current) view.dispatch({ effects: language.reconfigure(support) });
    }, () => { /* left as plain text */ });
    return () => { current = false; view.destroy(); };
  }, []);
  return <div className="cp-code" ref={host} />;
}
