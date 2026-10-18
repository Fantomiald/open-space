import { useEffect, useRef } from 'react';
import { t } from '../i18n/index.ts';
import { CloseIcon } from './Icons.tsx';

/** A picture of the thread, or a page (`page`); `link`: where the original is, by default the picture itself. */
export interface Viewed { src: string; alt: string; caption?: string; page?: boolean; video?: boolean; link?: { href: string; label: string; download?: string } }

/**
 * A picture or a page of the thread in large, over the page, on the native <dialog> (Escape and the focus come with
 * it): a click beside it or on the cross closes it; the original opens in a tab of its own (a published page: on
 * claude.ai, where it is the real one) or is downloaded.
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
      <figure className="cp-viewer__figure" data-page={viewed.page ? 'true' : undefined}>
        {viewed.page
          ? <iframe src={viewed.src} title={viewed.alt} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms" />
          : viewed.video
            // biome-ignore lint/a11y/useMediaCaption: a video Claude made has no captions to give
            ? <video src={viewed.src} controls autoPlay playsInline />
            : <img src={viewed.src} alt={viewed.alt} />}
        <figcaption className="cp-viewer__bar">
          <span className="cp-viewer__caption">{viewed.caption}</span>
          <a className="cp-button" data-variant="quiet" href={viewed.link?.href ?? viewed.src} download={viewed.link?.download} target="_blank" rel="noopener noreferrer">{viewed.link?.label ?? words.original}</a>
        </figcaption>
      </figure>
      <button type="button" className="cp-icon-button cp-viewer__close" aria-label={words.close} title={words.close} onClick={onClose} autoFocus><CloseIcon /></button>
    </dialog>
  );
}
