import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import type { ImageUpload } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { MAX_IMAGES, isPicture, prepareImage } from '../lib/images.ts';
import { useSessions } from '../state/sessions.ts';

export interface Attachment { id: number; name: string; preview: string; upload: ImageUpload }

let nextId = 0;
const hasFiles = (event: DragEvent) => [...event.dataTransfer.types].includes('Files');

/**
 * The pictures waiting to go with the next message: added by pasting into the field, dropping on `dropTarget`'s
 * element, or picking files. `preparing`: pictures still being shrunk (the message waits for them).
 */
export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const toast = useSessions((s) => s.toast);
  const count = useRef(0);
  count.current = items.length + preparing;

  const add = useCallback((files: readonly File[]) => {
    const pictures = files.filter(isPicture);
    if (pictures.length < files.length) toast('error', t.composer.attachments.onlyImages);
    const room = Math.max(0, MAX_IMAGES - count.current);
    if (pictures.length > room) toast('error', t.composer.attachments.tooMany(MAX_IMAGES));
    for (const file of pictures.slice(0, room)) {
      // numbered now, so the pictures stay in the order they were added whichever is ready first
      const id = ++nextId;
      setPreparing((value) => value + 1);
      prepareImage(file)
        .then((upload) => setItems((list) => [...list, { id, name: file.name || t.composer.attachments.screenshotName, preview: URL.createObjectURL(file), upload }].sort((a, b) => a.id - b.id)))
        .catch(() => toast('error', t.composer.attachments.unreadable(file.name)))
        .finally(() => setPreparing((value) => value - 1));
    }
  }, [toast]);

  const remove = useCallback((id: number) => setItems((list) => list.filter((item) => {
    if (item.id === id) URL.revokeObjectURL(item.preview);
    return item.id !== id;
  })), []);

  const clear = useCallback(() => setItems((list) => { for (const item of list) URL.revokeObjectURL(item.preview); return []; }), []);
  // the previews still shown when the field goes away
  const shown = useRef(items);
  shown.current = items;
  useEffect(() => () => { for (const item of shown.current) URL.revokeObjectURL(item.preview); }, []);

  /** Pasting a screenshot attaches it; pasting text stays ordinary. */
  const onPaste = useCallback((event: ClipboardEvent) => {
    const files = [...event.clipboardData.files].filter(isPicture);
    if (!files.length) return;
    event.preventDefault();
    add(files);
  }, [add]);

  // the element is entered and left again for each child crossed: the depth tells when the files really left it
  const dropTarget = {
    onDragEnter: (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); depth.current++; setDragging(true); },
    onDragOver: (event: DragEvent) => { if (hasFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } },
    onDragLeave: (event: DragEvent) => { if (!hasFiles(event)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      add([...event.dataTransfer.files]);
    },
  };

  return { items, uploads: items.map((item) => item.upload), preparing: preparing > 0, dragging, add, remove, clear, onPaste, dropTarget };
}

export type Attachments = ReturnType<typeof useAttachments>;
