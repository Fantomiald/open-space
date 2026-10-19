import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.ts';
import { copyCodeOnClick } from './copyCode.ts';
import { CloseIcon } from './Icons.tsx';
import { Prose } from './Prose.tsx';

/** What the viewer shows: a picture, a page, a video, or a text file (Markdown rendered, or as it is). */
export type ViewedKind = 'image' | 'page' | 'video' | 'markdown' | 'text';

/** Something of the thread to show in large; `link`: where the original is, by default `src` itself. */
export interface Viewed { src: string; alt: string; kind: ViewedKind; caption?: string; link?: { href: string; label: string; download?: string } }

/**
 * A picture, a page, a video or a text of the thread in large, over the page, on the native <dialog> (Escape and the
 * focus come with it): a click beside it or on the cross closes it; the original opens in a tab of its own (a published
 * page: on claude.ai, where it is the real one) or is downloaded.
 */
export function Viewer({ viewed, onClose }: { viewed: Viewed; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  const words = t.session.feed.viewer;
  return (
    <dialog ref={dialog} className="cp-viewer" aria-label={viewed.caption || viewed.alt} onClose={onClose} onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
      <figure className="cp-viewer__figure" data-kind={viewed.kind}>
        <Shown viewed={viewed} />
        <figcaption className="cp-viewer__bar">
          <span className="cp-viewer__caption">{viewed.caption}</span>
          <a className="cp-button" data-variant="quiet" href={viewed.link?.href ?? viewed.src} download={viewed.link?.download} target="_blank" rel="noopener noreferrer">{viewed.link?.label ?? words.original}</a>
        </figcaption>
      </figure>
      <button type="button" className="cp-icon-button cp-viewer__close" aria-label={words.close} title={words.close} onClick={onClose} autoFocus><CloseIcon /></button>
    </dialog>
  );
}

function Shown({ viewed }: { viewed: Viewed }) {
  switch (viewed.kind) {
    case 'page': return <iframe src={viewed.src} title={viewed.alt} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms" />;
    // biome-ignore lint/a11y/useMediaCaption: a video Claude made has no captions to give
    case 'video': return <video src={viewed.src} controls autoPlay playsInline />;
    case 'markdown': case 'text': return <TextFile src={viewed.src} markdown={viewed.kind === 'markdown'} />;
    case 'image': return <img src={viewed.src} alt={viewed.alt} />;
  }
}

type Read = { status: 'loading' } | { status: 'read'; text: string } | { status: 'failed' };

/** A text file a session sent, fetched and shown in a sheet that scrolls; Markdown goes through Prose (escaped). */
function TextFile({ src, markdown }: { src: string; markdown: boolean }) {
  const [read, setRead] = useState<Read>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    fetch(src)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((text) => { if (current) setRead({ status: 'read', text }); }, () => { if (current) setRead({ status: 'failed' }); });
    return () => { current = false; };
  }, [src]);
  const words = t.session.feed.viewer;
  if (read.status !== 'read') return <div className="cp-viewer__text"><p className="cp-muted">{read.status === 'loading' ? words.loading : words.unreadable}</p></div>;
  return markdown
    ? <div className="cp-viewer__text" onClick={(e) => copyCodeOnClick(e.target)}><Prose className="cp-viewer__prose" text={read.text} /></div>
    : <pre className="cp-viewer__text" data-plain="true">{read.text}</pre>;
}
