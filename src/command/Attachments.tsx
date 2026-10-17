import { useRef } from 'react';
import type { Attachments } from './useAttachments.ts';
import { CloseIcon, PaperclipIcon } from './Icons.tsx';

/** The pictures waiting to go with the message, as thumbnails each with a button to take it off. */
export function AttachmentStrip({ attachments }: { attachments: Attachments }) {
  if (!attachments.items.length && !attachments.preparing) return null;
  return (
    <ul className="cp-attachments" aria-label="Images jointes">
      {attachments.items.map((item) => (
        <li key={item.id} className="cp-attachments__item">
          <img src={item.preview} alt={item.name} />
          <button type="button" className="cp-attachments__remove" aria-label={`Retirer ${item.name}`} title="Retirer" onClick={() => attachments.remove(item.id)}><CloseIcon /></button>
        </li>
      ))}
      {attachments.preparing && <li className="cp-attachments__item" data-preparing="true" aria-label="Image en préparation" />}
    </ul>
  );
}

/** A button that opens the file picker for pictures. */
export function AttachButton({ attachments, className }: { attachments: Attachments; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className ?? 'cp-icon-button'} aria-label="Joindre des images" title="Joindre des images (ou colle une capture, ou dépose-la ici)" onClick={() => input.current?.click()}>
        <PaperclipIcon />
      </button>
      <input
        ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
        onChange={(event) => { attachments.add([...(event.target.files ?? [])]); event.target.value = ''; }}
      />
    </>
  );
}

/** Over the area files can be dropped on, while some are dragged over it. */
export function DropOverlay({ attachments }: { attachments: Attachments }) {
  if (!attachments.dragging) return null;
  return <div className="cp-drop" aria-hidden="true"><span>Dépose tes images pour les joindre</span></div>;
}
