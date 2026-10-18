import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import type { ImageUpload } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { MAX_IMAGES, isPicture, prepareImage } from '../lib/images.ts';
import { useSessions } from '../state/sessions.ts';

/** A picture (sent to Claude as such), or any other file (uploaded at once, Claude gets its path: see server/uploads.ts). */
export type Attachment =
  | { id: number; kind: 'image'; name: string; preview: string; upload: ImageUpload }
  | { id: number; kind: 'file'; name: string; size: number; uploadId: string };

/** Files per message, and the size of one (as on the server, see server/uploads.ts). */
const MAX_FILES = 10;
const MAX_FILE_BYTES = 200 * 1024 * 1024;

let nextId = 0;
/** Frees a picture's preview. */
const release = (item: Attachment) => { if (item.kind === 'image') URL.revokeObjectURL(item.preview); };
const hasFiles = (event: DragEvent) => [...event.dataTransfer.types].includes('Files');

/** Sends a file to the server (POST /upload, with the page's cookie); its upload id. */
async function uploadFile(file: File): Promise<string> {
  const response = await fetch(`/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, credentials: 'same-origin' });
  if (!response.ok) throw new Error(String(response.status));
  return ((await response.json()) as { id: string }).id;
}

/**
 * The files waiting to go with the next message: added by pasting into the field, dropping on `dropTarget`'s element,
 * or picking them. `preparing`: pictures still being shrunk or files still being uploaded (the message waits for them).
 */
export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const toast = useSessions((s) => s.toast);
  const counts = useRef({ images: 0, files: 0 });
  counts.current = { images: items.filter((item) => item.kind === 'image').length, files: items.filter((item) => item.kind === 'file').length };

  const add = useCallback((files: readonly File[]) => {
    const words = t.composer.attachments;
    // numbered now, so the files stay in the order they were added whichever is ready first
    const settle = (work: Promise<Attachment>, name: string) => {
      setPreparing((value) => value + 1);
      work
        .then((item) => setItems((list) => [...list, item].sort((a, b) => a.id - b.id)))
        .catch(() => toast('error', words.unreadable(name)))
        .finally(() => setPreparing((value) => value - 1));
    };
    const pictures = files.filter(isPicture);
    const others = files.filter((file) => !isPicture(file));
    const pictureRoom = Math.max(0, MAX_IMAGES - counts.current.images);
    if (pictures.length > pictureRoom) toast('error', words.tooMany(MAX_IMAGES));
    for (const file of pictures.slice(0, pictureRoom)) {
      const id = ++nextId;
      settle(prepareImage(file).then((upload) => ({ id, kind: 'image', name: file.name || words.screenshotName, preview: URL.createObjectURL(file), upload })), file.name);
    }
    const fileRoom = Math.max(0, MAX_FILES - counts.current.files);
    if (others.length > fileRoom) toast('error', words.tooManyFiles(MAX_FILES));
    for (const file of others.slice(0, fileRoom)) {
      if (file.size > MAX_FILE_BYTES) { toast('error', words.tooBig(file.name)); continue; }
      const id = ++nextId;
      settle(uploadFile(file).then((uploadId) => ({ id, kind: 'file', name: file.name, size: file.size, uploadId })), file.name);
    }
  }, [toast]);

  const remove = useCallback((id: number) => setItems((list) => list.filter((item) => {
    if (item.id === id) release(item);
    return item.id !== id;
  })), []);

  const clear = useCallback(() => setItems((list) => { for (const item of list) release(item); return []; }), []);
  // the previews still shown when the field goes away
  const shown = useRef(items);
  shown.current = items;
  useEffect(() => () => { for (const item of shown.current) release(item); }, []);

  /** Pasting a screenshot or a copied file attaches it; pasting text stays ordinary. */
  const onPaste = useCallback((event: ClipboardEvent) => {
    const files = [...event.clipboardData.files];
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

  return {
    items,
    uploads: items.flatMap((item) => (item.kind === 'image' ? [item.upload] : [])),
    files: items.flatMap((item) => (item.kind === 'file' ? [item.uploadId] : [])),
    preparing: preparing > 0, dragging, add, remove, clear, onPaste, dropTarget,
  };
}

export type Attachments = ReturnType<typeof useAttachments>;
