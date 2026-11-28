// Pictures attached to a message (pasted, dropped or picked screenshots), made ready to send: shrunk to the size
// Claude works at (it scales larger ones down anyway, and a Retina screenshot would be needlessly heavy), in base64.
import type { ImageType, ImageUpload } from '../../shared/protocol.ts';
import { MAX_ICON_IMAGE } from '../../shared/project-icons.ts';

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

/** The sides a project's picture chosen from a file is tried at: twice the panel's mark for sharp screens, then smaller while too heavy. */
const ICON_SIDES = [64, 48, 32] as const;

/** Whether any pixel of the canvas lets what is under it show through (a logo's background, the margins of a picture not square). */
function seeThrough(context: CanvasRenderingContext2D, side: number): boolean {
  const { data } = context.getImageData(0, 0, side, side);
  for (let alpha = 3; alpha < data.length; alpha += 4) if (data[alpha] < 255) return true;
  return false;
}

/**
 * A picture chosen as a project's icon (shared/project-icons.ts), ready to store: fitted whole in a square, as PNG, else
 * WebP, else JPEG for a picture with nothing see-through (JPEG would turn that black), smaller while it stays over
 * MAX_ICON_IMAGE; null when the file is no picture the browser reads, or stays too heavy.
 */
export async function projectPicture(file: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  try {
    for (const side of ICON_SIDES) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const context = canvas.getContext('2d')!;
      const width = bitmap.width * scale, height = bitmap.height * scale;
      context.drawImage(bitmap, (side - width) / 2, (side - height) / 2, width, height);
      const types = seeThrough(context, side) ? (['image/png', 'image/webp'] as const) : (['image/png', 'image/webp', 'image/jpeg'] as const);
      for (const type of types) {
        const blob = await encode(canvas, type, type === 'image/png' ? undefined : 0.85).catch(() => null);
        // a browser that cannot write WebP gives a PNG instead
        if (blob && blob.type === type && blob.size <= MAX_ICON_IMAGE) return blob;
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}
