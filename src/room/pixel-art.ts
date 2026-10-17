// Tools for the room's pixel art: everything is drawn on small canvases at "art" resolution (one art pixel is
// ART_SCALE room pixels), with crisp fills and a dark outline, then scaled up without smoothing.
import { shade } from '../design/room-palette.ts';
import { toScreen, type Point } from './geometry.ts';

export const ART_SCALE = 2;

export interface Tones { base: string; light: string; shade: string; dark: string }
const toneCache = new Map<string, Tones>();
/** A colour and its lit, shaded and dark versions. */
export function tones(base: string): Tones {
  let value = toneCache.get(base);
  if (!value) {
    value = { base, light: shade(base, 1.22), shade: shade(base, 0.8), dark: shade(base, 0.62) };
    toneCache.set(base, value);
  }
  return value;
}

export function artCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingEnabled = false;
  return { canvas, context };
}

/** Fills a convex polygon pixel column by pixel column, so its edges stay crisp (no antialiasing). */
export function fillPolygon(context: CanvasRenderingContext2D, points: readonly Point[], colour: string) {
  const xs = points.map((point) => point.x);
  context.fillStyle = colour;
  for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
    const middle = x + 0.5;
    let top = Infinity, bottom = -Infinity;
    points.forEach((a, index) => {
      const b = points[(index + 1) % points.length];
      if ((middle < Math.min(a.x, b.x)) || (middle > Math.max(a.x, b.x)) || a.x === b.x) return;
      const y = a.y + (b.y - a.y) * (middle - a.x) / (b.x - a.x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    });
    if (bottom > top) context.fillRect(x, Math.round(top), 1, Math.round(bottom) - Math.round(top));
  }
}

/** A one-pixel outline around everything opaque on the canvas. */
export function outline(canvas: HTMLCanvasElement, colour: string): HTMLCanvasElement {
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] > 40;
  context.fillStyle = colour;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) context.fillRect(x, y, 1, 1);
  }
  return canvas;
}

/** A shaded ball of pixels, lit from the top left; `paint` fills one pixel. */
export function shadedBall(paint: (x: number, y: number, colour: string) => void, cx: number, cy: number, rx: number, ry: number, colours: Tones) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (nx * nx + ny * ny > 1) continue;
    const toward = nx * 0.6 + ny * 0.5;
    paint(x, y, toward > 0.42 ? colours.shade : toward < -0.62 ? colours.light : colours.base);
  }
}

/** A floor point in art pixels. */
export const toArt = (tile: Point): Point => { const point = toScreen(tile); return { x: point.x / ART_SCALE, y: point.y / ART_SCALE }; };
