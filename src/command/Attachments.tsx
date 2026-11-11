import { useRef, useState } from 'react';
import { t } from '../i18n/index.ts';
import type { Attachments } from './useAttachments.ts';
import { previewOf } from '../state/files.ts';
import { CloseIcon, FileIcon, FileTextIcon, PaperclipIcon, PlayIcon } from './Icons.tsx';
import { Viewer, type Viewed } from './Viewer.tsx';

/** The files waiting to go with the message, pictures as thumbnails (a click shows them in large) and others by name, each with a button to take it off. */
export function AttachmentStrip({ attachments }: { attachments: Attachments }) {
  const [viewing, setViewing] = useState<Viewed | null>(null);
  if (!attachments.items.length && !attachments.preparing) return null;
  return (
    <>
      <ul className="cp-attachments" aria-label={t.composer.attachments.label}>
        {attachments.items.map((item) => (
          <li key={item.id} className="cp-attachments__item" data-kind={item.kind === 'file' && previewOf(item.name) === 'video' && item.preview ? 'video' : item.kind}>
            {item.kind === 'image'
              ? <button type="button" className="cp-attachments__open" title={t.session.feed.imageTitle} onClick={() => setViewing({ src: item.preview, alt: item.name, caption: item.name, kind: 'image' })}><img src={item.preview} alt={item.name} /></button>
              : <FileTile name={item.name} preview={item.preview} onView={setViewing} />}
            <button type="button" className="cp-attachments__remove" aria-label={t.composer.attachments.removeLabel(item.name)} title={t.composer.attachments.remove} onClick={() => attachments.remove(item.id)}><CloseIcon /></button>
          </li>
        ))}
        {attachments.preparing && <li className="cp-attachments__item" data-preparing="true" aria-label={t.composer.attachments.preparing} />}
      </ul>
      {viewing && <Viewer viewed={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/** A file waiting to go: a video by its first frame, a PDF or a sound to open, anything else by its name. */
function FileTile({ name, preview, onView }: { name: string; preview?: string; onView: (viewed: Viewed) => void }) {
  const shown = previewOf(name);
  if (!preview || !shown || shown === 'image') return <span className="cp-attachments__file" title={name}><FileIcon /><span>{name}</span></span>;
  const kind = shown === 'pdf' ? 'pdf' : 'video';
  return (
    <button type="button" className="cp-attachments__open" title={name} onClick={() => onView({ src: preview, alt: name, caption: name, kind })}>
      {shown === 'video'
        ? (
          <>
            {/* "#t=0.1": a first frame to show, rather than a black one */}
            <video src={`${preview}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} />
            <span className="cp-video__play" aria-hidden="true"><PlayIcon /></span>
          </>
        )
        : <span className="cp-attachments__file">{shown === 'pdf' ? <FileTextIcon /> : <PlayIcon />}<span>{name}</span></span>}
    </button>
  );
}

/** A button that opens the file picker. */
export function AttachButton({ attachments, className }: { attachments: Attachments; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className ?? 'cp-icon-button'} aria-label={t.composer.attachments.attach} title={t.composer.attachments.attachTitle} onClick={() => input.current?.click()}>
        <PaperclipIcon />
      </button>
      <input
        ref={input} type="file" multiple hidden
        onChange={(event) => { attachments.add([...(event.target.files ?? [])]); event.target.value = ''; }}
      />
    </>
  );
}

/** Over the area files can be dropped on, while some are dragged over it. */
export function DropOverlay({ attachments }: { attachments: Attachments }) {
  if (!attachments.dragging) return null;
  return <div className="cp-drop" aria-hidden="true"><span>{t.composer.attachments.drop}</span></div>;
}
