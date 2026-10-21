import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { findAll, fold, foldQuery } from '../../shared/search.ts';

const ALL = 'cp-search';
const CURRENT = 'cp-search-current';
/** The highlights of the page (CSS Custom Highlight API, Chromium and Safari): no element is added to the thread. */
const highlights = () => (typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : null);

/** Every place the query is found in `root`'s text, as ranges; texts of different thread items never join. */
function rangesOf(root: HTMLElement, query: string): Range[] {
  const needle = foldQuery(query);
  if (!needle) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  // the folded text of one thread item at a time, each folded character pointing back to its node and offset
  const ranges: Range[] = [];
  let haystack = '';
  let places: { node: Text; offset: number }[] = [];
  let item: Element | null = null;
  const flush = () => {
    for (const start of findAll(haystack, needle)) {
      const first = places[start], last = places[start + needle.length - 1];
      const range = document.createRange();
      range.setStart(first.node, first.offset);
      range.setEnd(last.node, last.offset + 1);
      ranges.push(range);
    }
    haystack = '';
    places = [];
  };
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const owner = node.parentElement?.closest('.cp-feed__item') ?? null;
    if (owner !== item) { flush(); item = owner; }
    const { folded, origin } = fold(node.data);
    haystack += folded;
    for (const offset of origin) places.push({ node, offset });
  }
  flush();
  return ranges;
}

/**
 * Searches the thread shown in `container` and highlights what it finds; `current` is the match in view (closed
 * groups of actions holding it open, the thread scrolls to it). `version` changes when the thread does.
 */
export function useFeedSearch(container: RefObject<HTMLElement | null>, query: string, version: unknown) {
  const [ranges, setRanges] = useState<Range[]>([]);
  const [current, setCurrent] = useState(0);

  useLayoutEffect(() => {
    setRanges(container.current ? rangesOf(container.current, query) : []);
  }, [container, query, version]);

  // a new query starts at the latest match, the bottom of the thread being where the conversation is
  useEffect(() => { setCurrent(Number.MAX_SAFE_INTEGER); }, [query]);
  const index = ranges.length ? Math.min(current, ranges.length - 1) : -1;

  useEffect(() => {
    const registry = highlights();
    if (!registry) return;
    registry.set(ALL, new Highlight(...ranges));
    const shown = ranges[index];
    if (shown) {
      registry.set(CURRENT, new Highlight(shown));
      for (let element = shown.startContainer.parentElement; element; element = element.parentElement) {
        if (element instanceof HTMLDetailsElement) element.open = true;
      }
      shown.startContainer.parentElement?.scrollIntoView({ block: 'center' });
    } else registry.delete(CURRENT);
    return () => { registry.delete(ALL); registry.delete(CURRENT); };
  }, [ranges, index]);

  const step = (by: number) => setCurrent(ranges.length ? (index + by + ranges.length) % ranges.length : 0);
  return { count: ranges.length, index, next: () => step(1), previous: () => step(-1) };
}
