import { useRef } from 'react';
import { t } from '../i18n/index.ts';
import type { Attachments } from './useAttachments.ts';
import { CloseIcon, FileIcon, PaperclipIcon } from './Icons.tsx';

/** The files waiting to go with the message, pictures as thumbnails and others by name, each with a button to take it off. */
export function AttachmentStrip({ attachments }: { attachments: Attachments }) {
  if (!attachments.items.length && !attachments.preparing) return null;
  return (
    <ul className="cp-attachments" aria-label={t.composer.attachments.label}>
      {attachments.items.map((item) => (
        <li key={item.id} className="cp-attachments__item" data-kind={item.kind}>
          {item.kind === 'image' ? <img src={item.preview} alt={item.name} /> : <span className="cp-attachments__file" title={item.name}><FileIcon /><span>{item.name}</span></span>}
          <button type="button" className="cp-attachments__remove" aria-label={t.composer.attachments.removeLabel(item.name)} title={t.composer.attachments.remove} onClick={() => attachments.remove(item.id)}><CloseIcon /></button>
        </li>
      ))}
      {attachments.preparing && <li className="cp-attachments__item" data-preparing="true" aria-label={t.composer.attachments.preparing} />}
    </ul>
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
