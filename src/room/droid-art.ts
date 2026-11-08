// The automatons' droid in pixel art, one letter a pixel, like the pet: a dome on a barrel (an astromech), a square
// head on a barrel, or a ball rolling under a little dome. Its panels take the colour picked; its eye glows, its wheels
// turn (or its ball rolls) as it goes. Drawn once per frame kind and kept; a white line around it under the pointer.
import { DROID_COLORS, DROID_PARTS as D, PEOPLE_INK as INK } from '../design/people-palette.ts';
import { ROOM_PALETTE } from '../design/room-palette.ts';
import type { DroidChoice, DroidModel } from '../../shared/droids.ts';
import { ART_SCALE, artCanvas, outline, tones } from './pixel-art.ts';

/** Its rows, front on: W white plate, S its shade, C panel colour, c its shade, L lens, E eye, G glint, K wheel, k its spoke. */
const MODELS: Readonly<Record<DroidModel, { rows: readonly string[]; turning: readonly string[] }>> = {
  dome: {
    rows: [
      '....WWWW....',
      '..WWCCCCWW..',
      '.WCWLEGWCWS.',
      '.WWWWCCWWWS.',
      '.SSSSSSSSSS.',
      '.WCCWWWWCCS.',
      '.WCCWccWCCS.',
      '.WWWWCCWWWS.',
      '.WCWWWWWWCS.',
      'SSWSSSSSSWSS',
      'SW.WWWWWW.WS',
      'KKk......kKK',
    ],
    turning: ['kKK......KKk'],
  },
  square: {
    rows: [
      '.....SS.....',
      '..SSSSSSSS..',
      '..WCCCCCCS..',
      '..WLEGWCCS..',
      '..WCCCCCCS..',
      '..SSSSSSSS..',
      '....SSSS....',
      '.WWWWWWWWWS.',
      '.WCCWWWCCWS.',
      '.WCcWWWCcWS.',
      '.WWWWWWWWWS.',
      'SW.WWWWWW.WS',
      'KKk......kKK',
    ],
    turning: ['kKK......KKk'],
  },
  sphere: {
    rows: [
      '....SWWS....',
      '...WLEGWS...',
      '...SSSSSS...',
      '..WWWWWWWS..',
      '.WWCCWWWWWS.',
      'WWCWWCWWCCWS',
      'WWCWWCWWWWWS',
      'WWWCCWWWCCWS',
      '.WWWWWWCWWS.',
      '..WWWWWWSS..',
      '....SSSS....',
    ],
    // the ball rolls: its panels move round
    turning: [
      '....SWWS....',
      '...WLEGWS...',
      '...SSSSSS...',
      '..WWWWWWWS..',
      '.WWWWCCWWWS.',
      'WCCWWWWCWWWS',
      'WWWCWWWCWWWS',
      'WCCWWCCWWWWS',
      '.WWCWWWWWWS.',
      '..WWWWWWSS..',
      '....SSSS....',
    ],
  },
};

const WIDTH = 12;
/** The canvas: a pixel of margin all round for the outline (and the white line under the pointer). */
const CANVAS = { width: WIDTH + 4, height: 18 };

/** Its panels' colour: the one picked, or its model's own. */
export const droidColour = (droid: Exclude<DroidChoice, { kind: 'none' }>) =>
  droid.color ?? (droid.kind === 'sphere' ? DROID_COLORS[1] : DROID_COLORS[0]);

/** Its rows for a frame: front on, or its back (no eye), its wheels or its ball at one turn or the next. */
export function droidRows(model: DroidModel, back: boolean, turned: boolean): string[] {
  const { rows, turning } = MODELS[model];
  const frame = turned ? (turning.length === 1 ? [...rows.slice(0, -1), turning[0]] : [...turning]) : [...rows];
  return back ? frame.map((row) => row.replace(/[LEG]/g, 'C')) : frame;
}

/** How tall it stands, in room pixels. */
export const droidHeight = (model: DroidModel) => MODELS[model].rows.length * ART_SCALE;

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(droid: Exclude<DroidChoice, { kind: 'none' }>, back: boolean, turned: boolean, left: boolean, outlined: boolean): HTMLCanvasElement {
  const colour = droidColour(droid);
  const key = `${droid.kind}|${colour}|${back}|${turned}|${left}|${outlined}`;
  let canvas = sprites.get(key);
  if (canvas) return canvas;
  const drawing = artCanvas(CANVAS.width, CANVAS.height);
  canvas = drawing.canvas;
  const panel = tones(colour);
  const paints: Readonly<Record<string, string>> = { W: D.white, S: D.shade, C: colour, c: panel.dark, L: D.lens, E: D.eye, G: D.glint, K: D.wheel, k: D.dark };
  const rows = droidRows(droid.kind, back, turned);
  const top = CANVAS.height - 2 - rows.length;
  for (const [line, row] of rows.entries()) [...row].forEach((letter, column) => {
    const paint = paints[letter];
    if (!paint) return;
    drawing.context.fillStyle = paint;
    drawing.context.fillRect(left ? CANVAS.width - 3 - column : 2 + column, top + line, 1, 1);
  });
  outline(canvas, INK.outline);
  // under the pointer, a white line around its dark outline, the droid itself untouched (ring() would clear it: it is
  // for a piece already drawn underneath)
  if (outlined) outline(canvas, ROOM_PALETTE.furniture.highlight);
  sprites.set(key, canvas);
  return canvas;
}

/** Its canvas at art resolution, front on (the settings' preview): its wheels at one turn or the next. */
export const droidPreview = (droid: Exclude<DroidChoice, { kind: 'none' }>, turned: boolean) => sprite(droid, false, turned, false, false);

/**
 * Draws the droid, its wheels at (x, y) in room pixels. `moving`: its wheels turn; `back`: it rolls away from the
 * viewer; `left`: towards the left of the screen; `outlined`: under the pointer, a white line around it.
 */
export function drawDroid(context: CanvasRenderingContext2D, droid: Exclude<DroidChoice, { kind: 'none' }>, x: number, y: number,
  { moving, back, left, time, outlined }: { moving: boolean; back: boolean; left: boolean; time: number; outlined: boolean }) {
  const turned = moving && Math.floor(time / 140) % 2 === 1;
  const canvas = sprite(droid, back, turned, left, outlined);
  const previous = context.imageSmoothingEnabled;
  context.imageSmoothingEnabled = false;
  context.drawImage(canvas, Math.round(x - (CANVAS.width / 2) * ART_SCALE), Math.round(y - (CANVAS.height - 2) * ART_SCALE), canvas.width * ART_SCALE, canvas.height * ART_SCALE);
  context.imageSmoothingEnabled = previous;
}
