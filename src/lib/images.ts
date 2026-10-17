// Pictures attached to a message (pasted, dropped or picked screenshots), made ready to send: shrunk to the size
// Claude works at (it scales larger ones down anyway, and a Retina screenshot would be needlessly heavy), in base64.
import type { ImageType, ImageUpload } from '../../shared/protocol.ts';

/** The longest side Claude looks at, in pixels. */
const LONGEST_SIDE = 1568;
/** Past this size, a shrunk picture goes as JPEG rather than PNG (the server takes 5 MB a picture). */
const PNG_LIMIT_BYTES = 2_500_000;
const ACCEPTED: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] satisfies ImageType[];
/** Pictures per message (as on the server, see MAX_IMAGES in server/messages.ts). */
export const MAX_IMAGES = 8;

export const isPicture = (file: Blob) => file.type.startsWith('image/');

const base64Of = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

const encode = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encoding failed'))), type, quality));

/** A picture as it is sent: as is when it is small and of a type Claude reads, otherwise redrawn smaller. */
export async function prepareImage(file: Blob): Promise<ImageUpload> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && ACCEPTED.includes(file.type) && file.size <= PNG_LIMIT_BYTES) {
    bitmap.close();
    return { mediaType: file.type as ImageType, data: await base64Of(file) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // PNG keeps the text of a screenshot sharp; a photo too big for it goes as JPEG
  const png = await encode(canvas, 'image/png');
  if (png.size <= PNG_LIMIT_BYTES) return { mediaType: 'image/png', data: await base64Of(png) };
  return { mediaType: 'image/jpeg', data: await base64Of(await encode(canvas, 'image/jpeg', 0.9)) };
}
