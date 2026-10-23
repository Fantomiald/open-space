import { nativeImage } from 'electron';
import { ROOM_PALETTE } from '../src/design/room-palette.ts';

const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];

/** Small opaque pixels stay readable on Windows taskbar overlays (16 × 16). */
export function attentionBadge(count: number) {
  const size = 16;
  const data = Buffer.alloc(size * size * 4);
  const colour = (hex: string) => [5, 3, 1].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const background = colour(ROOM_PALETTE.furniture.ledRed);
  const foreground = colour(ROOM_PALETTE.furniture.paper);
  const paint = (x: number, y: number, rgb: number[]) => {
    const offset = (y * size + x) * 4;
    data[offset] = rgb[0]!; data[offset + 1] = rgb[1]!; data[offset + 2] = rgb[2]!; data[offset + 3] = 255;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if ((x - 7.5) ** 2 + (y - 7.5) ** 2 <= 64) paint(x, y, background);
  const text = String(Math.min(99, Math.max(1, Math.floor(count))));
  const left = text.length === 1 ? 6 : 4;
  for (let digit = 0; digit < text.length; digit++) {
    const pixels = DIGITS[Number(text[digit])]!;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (pixels[y * 3 + x] === '1') paint(left + digit * 4 + x, y + 5, foreground);
  }
  return nativeImage.createFromBitmap(data, { width: size, height: size });
}
