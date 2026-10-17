import { useEffect, useRef, useState, type RefObject } from 'react';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, SearchIcon } from './Icons.tsx';
import { useFeedSearch } from './useFeedSearch.ts';

/**
 * The search bar over a thread: what is typed is highlighted in `thread` (capitals and accents ignored), the match in
 * view more strongly. Enter goes to the next one, Shift+Enter to the previous one, Escape closes the bar.
 */
export function FeedSearch({ thread, version }: { thread: RefObject<HTMLElement | null>; version: unknown }) {
  const openSearch = useSessions((s) => s.openSearch);
  const [query, setQuery] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const { count, index, next, previous } = useFeedSearch(thread, query, version);

  useEffect(() => { field.current?.focus(); }, []);

  const typed = query.trim() !== '';
  return (
    <div className="cp-search" role="search">
      <SearchIcon />
      <label className="cp-sr-only" htmlFor="feed-search">{t.session.search.label}</label>
      <input
        ref={field} id="feed-search" type="search" value={query} placeholder={t.session.search.label} autoComplete="off" spellCheck={false}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); if (event.shiftKey) previous(); else next(); }
          // Escape closes the bar here, instead of interrupting the session (App.tsx)
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); openSearch(false); }
        }}
      />
      <span className="cp-search__count" aria-live="polite">{!typed ? '' : count === 0 ? t.session.search.none : t.session.search.position(index + 1, count)}</span>
      <button type="button" className="cp-icon-button" data-size="small" aria-label={t.session.search.previous} title={t.session.search.previousTitle} disabled={count < 2} onClick={previous}><ChevronUpIcon /></button>
      <button type="button" className="cp-icon-button" data-size="small" aria-label={t.session.search.next} title={t.session.search.nextTitle} disabled={count < 2} onClick={next}><ChevronDownIcon /></button>
      <button type="button" className="cp-icon-button" data-size="small" aria-label={t.session.search.close} title={t.session.search.closeTitle} onClick={() => openSearch(false)}><CloseIcon /></button>
    </div>
  );
}
