import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.ts';
import { copyCodeOnClick } from './copyCode.ts';
import { CloseIcon, DownloadIcon } from './Icons.tsx';
import { Prose } from './Prose.tsx';

/** What the viewer shows: a picture, a page, a video, or a text file (Markdown rendered, or as it is). */
export type ViewedKind = 'image' | 'page' | 'pdf' | 'video' | 'markdown' | 'text';

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
  // Escape pressed in a page shown here stays in its frame: the page passes it on (ESCAPE_RELAY in server/http.ts)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data === 'open-space:escape' && event.source === dialog.current?.querySelector('iframe')?.contentWindow) onClose();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onClose]);
  const words = t.session.feed.viewer;
  return (
    <dialog ref={dialog} className="cp-viewer" aria-label={viewed.caption || viewed.alt} onClose={onClose} onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
      <figure className="cp-viewer__figure" data-kind={viewed.kind}>
        <Shown viewed={viewed} />
        <figcaption className="cp-viewer__bar">
          <span className="cp-viewer__caption">{viewed.caption}</span>
          {(viewed.kind === 'image' || viewed.kind === 'video') && (
            <a className="cp-icon-button" href={viewed.src} download={savedName(viewed)} aria-label={t.session.feed.files.download} title={t.session.feed.files.download}><DownloadIcon /></a>
          )}
          <a className="cp-button" data-variant="quiet" href={viewed.link?.href ?? viewed.src} download={viewed.link?.download} target="_blank" rel="noopener noreferrer">{viewed.link?.label ?? words.original}</a>
        </figcaption>
      </figure>
      <button type="button" className="cp-icon-button cp-viewer__close" aria-label={words.close} title={words.close} onClick={onClose} autoFocus><CloseIcon /></button>
    </dialog>
  );
}

/** The file's title when it has an extension ("cover.png"), else the stored name (a pasted screenshot's alt is just "Image"). */
const savedName = (viewed: Viewed) => (/\.\w+$/.test(viewed.alt) ? viewed.alt : viewed.src.split('/').pop()?.split('?')[0]);

function Shown({ viewed }: { viewed: Viewed }) {
  switch (viewed.kind) {
    case 'page': return <iframe src={viewed.src} title={viewed.alt} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms" />;
    // Chromium's own PDF viewer, which a sandboxed frame would refuse
    case 'pdf': return <iframe src={viewed.src} title={viewed.alt} />;
    // biome-ignore lint/a11y/useMediaCaption: a video Claude made has no captions to give
    case 'video': return <video src={viewed.src} controls autoPlay playsInline />;
    case 'markdown': case 'text': return <TextFile src={viewed.src} markdown={viewed.kind === 'markdown'} />;
    case 'image': return <ZoomableImage key={viewed.src} src={viewed.src} alt={viewed.alt} />;
  }
}

const MAX_SCALE = 8;
const DOUBLE_CLICK_SCALE = 2.5;

/**
 * A picture that zooms where the pointer is, like any image viewer: the wheel or a trackpad pinch zooms in and out,
 * a drag moves it once zoomed, a double click goes from fit to zoomed and back.
 */
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const image = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<ImageView>({ scale: 1, x: 0, y: 0 });
  const [drag, setDrag] = useState<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);

  const zoomAt = (pointerX: number, pointerY: number, scale: (current: number) => number) =>
    setView((current) => zoomedView(current, image.current?.getBoundingClientRect(), pointerX, pointerY, scale(current.scale)));

  // React's wheel listener is passive, so it could not stop the page from scrolling
  useEffect(() => {
    const element = image.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // a pinch comes as a wheel with ctrlKey and small steps
      const speed = event.ctrlKey ? 0.01 : 0.002;
      setView((current) => zoomedView(current, element.getBoundingClientRect(), event.clientX, event.clientY, current.scale * Math.exp(-event.deltaY * speed)));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const zoomed = view.scale > 1;
  return (
    <img
      ref={image}
      src={src}
      alt={alt}
      className="cp-viewer__zoomable"
      data-zoomed={zoomed}
      data-dragging={drag !== null}
      draggable={false}
      style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      onDoubleClick={(e) => zoomAt(e.clientX, e.clientY, (scale) => (scale > 1 ? 1 : DOUBLE_CLICK_SCALE))}
      onPointerDown={(e) => {
        if (!zoomed || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ pointerX: e.clientX, pointerY: e.clientY, x: view.x, y: view.y });
      }}
      onPointerMove={(e) => {
        if (drag) setView((current) => ({ ...current, x: drag.x + e.clientX - drag.pointerX, y: drag.y + e.clientY - drag.pointerY }));
      }}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
    />
  );
}

type ImageView = { scale: number; x: number; y: number };

/** The view at `scale` that keeps the image point under the pointer where it is; the transform's origin is the image's top left corner. */
function zoomedView(current: ImageView, rect: DOMRect | undefined, pointerX: number, pointerY: number, scale: number): ImageView {
  const next = Math.min(MAX_SCALE, Math.max(1, scale));
  if (!rect || next === 1) return { scale: 1, x: 0, y: 0 };
  const imageX = (pointerX - rect.left) / current.scale;
  const imageY = (pointerY - rect.top) / current.scale;
  return { scale: next, x: current.x + pointerX - imageX * next - rect.left, y: current.y + pointerY - imageY * next - rect.top };
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
