import { type RefObject, useEffect } from 'react';
import { findInNote } from '../../shared/journal.ts';

const HIGHLIGHT = 'board-search';

/**
 * Marks where `query` is in the text shown inside `container` (case and accents aside), with the CSS highlight API so
 * the rendered Markdown is left as it is, and scrolls to the first place. A match split by formatting (a word half in
 * bold) is not marked. `key` is what the container shows: the marks are laid again when it changes.
 */
export function useSearchMarks(container: RefObject<HTMLElement | null>, query: string, key: string) {
  useEffect(() => {
    const root = container.current;
    if (!root || !query.trim() || typeof Highlight === 'undefined') return;
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const [start, end] of findInNote(node.textContent ?? '', query)) {
        const range = new Range();
        range.setStart(node, start);
        range.setEnd(node, end);
        ranges.push(range);
      }
    }
    CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges));
    const first = ranges[0]?.getBoundingClientRect();
    if (first) root.scrollTop += first.top - root.getBoundingClientRect().top - root.clientHeight / 3;
    return () => { CSS.highlights.delete(HIGHLIGHT); };
  }, [container, query, key]);
}
