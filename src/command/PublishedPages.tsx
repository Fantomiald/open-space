import { useCallback, useRef, useState } from 'react';
import { t } from '../i18n/index.ts';
import type { PublishedPage } from '../state/feed.ts';
import { ExternalLinkIcon, LinkIcon } from './Icons.tsx';
import { useDismiss } from './useDismiss.ts';

/** The pages a session published on claude.ai: a chip in its head, opening their list, each opened on claude.ai in a new tab. */
export function PublishedPages({ pages }: { pages: readonly PublishedPage[] }) {
  const words = t.session.detail;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);

  return (
    <div className="cp-pages" ref={box}>
      <button type="button" className="cp-changes-chip" aria-expanded={open} aria-haspopup="true" title={words.pagesTitle} onClick={() => setOpen(!open)}>
        <LinkIcon />{words.pages(pages.length)}
      </button>
      {open && (
        <ul className="cp-pages__panel" aria-label={words.pagesTitle}>
          {pages.map((page) => (
            <li key={page.url}>
              <a className="cp-pages__open" href={page.url} target="_blank" rel="noopener noreferrer" title={words.openPage(page.title)} onClick={close}>
                <span className="cp-pages__title">{page.title}</span><ExternalLinkIcon />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
