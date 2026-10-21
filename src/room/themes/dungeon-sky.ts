// The page behind the dungeon, in sky pixels (sky.ts): a cavern warmed from far below by a dull red glow, stalactites
// from its vault, spires of rock rising from the dark, far rocks floating with crystals on them; and the embers that
// rise from the depths, on the layer that moves.
import { DUNGEON_PALETTE as D } from '../../design/theme-dungeon.ts';
import { css, mix, rgb } from '../lighting.ts';
import { pick } from '../sky.ts';
import { noise } from './dungeon-art.ts';

type Context = CanvasRenderingContext2D;

function dot(context: Context, x: number, y: number, colour: string) {
  context.fillStyle = colour;
  context.fillRect(x, y, 1, 1);
}

/** A rock floating in the cavern: a flat top lit along its edge, a body tapering down to a point, crystals on it. */
function floatingRock(context: Context, x: number, y: number, size: number, seed: number) {
  for (let across = -size; across <= size; across++) {
    const share = Math.abs(across) / size;
    const top = Math.round(y - (1 - share) * size * 0.25 - noise(`top${seed}`, across, 0, 3) * 2);
    const bottom = Math.round(y + (1 - share ** 1.4) * size * (0.9 + noise(`under${seed}`, across, 0, 3) * 0.7));
    for (let row = top; row <= bottom; row++) {
      const edge = row === top;
      const lower = (row - top) / Math.max(1, bottom - top);
      // lit from far below: the bottom of each rock warms up
      dot(context, x + across, row, edge ? D.rockEdge : lower > 0.75 ? css(mix(rgb(D.rocksFar), rgb(D.deepGlow), 0.18)) : D.rocksFar);
    }
  }
  for (let index = 0; index < 2; index++) {
    const across = -Math.round(size / 2) + pick(`crystal${seed}${index}`, size);
    const top = Math.round(y - (1 - Math.abs(across) / size) * size * 0.25) - 1;
    dot(context, x + across, top, D.crystal);
    dot(context, x + across, top - 1, D.crystal);
    dot(context, x + across + 1, top, css(mix(rgb(D.crystal), rgb(D.rocksFar), 0.5)));
  }
}

/** The cavern, the same at every hour: down here the only light comes from deep below. */
export function paintCavern(context: Context, width: number, height: number) {
  for (let y = 0; y < height; y += 3) {
    const share = y / height;
    context.fillStyle = css(mix(rgb(D.voidTop), rgb(D.voidBottom), share ** 2.2));
    context.fillRect(0, y, width, 3);
  }
  // the vault: stalactites of every length hanging from the top
  for (let x = 0; x < width; x++) {
    const length = Math.round(height * (0.03 + noise('vault', x, 0, 14) * 0.08) + Math.max(0, noise('spike', x, 0, 3) - 0.55) * height * 0.25);
    for (let y = 0; y < length; y++) dot(context, x, y, y === length - 1 ? D.rockEdge : D.rocksNear);
  }
  // far rocks drifting in the dark, high up or to the sides, where the room does not hide them
  const count = Math.max(5, Math.round(width / 45));
  for (let index = 0; index < count; index++) {
    const share = (index + 0.2 + pick(`rockx${index}`, 60) / 100) / count;
    const side = share < 0.22 || share > 0.78;
    const y = Math.round(height * (side ? 0.3 + pick(`rocky${index}`, 40) / 100 : 0.14 + pick(`rocky${index}`, 14) / 100));
    floatingRock(context, Math.round(share * width), y, 3 + pick(`rocksize${index}`, Math.max(2, Math.min(6, Math.round(width / 60)))), index);
  }
  // the spires rising from the dark at the bottom, their edges caught by a glow far below
  for (let x = 0; x < width; x++) {
    const spire = Math.round(height * (0.1 + noise('spires', x, 0, 18) * 0.14) + Math.max(0, noise('peak', x, 0, 4) - 0.6) * height * 0.3);
    for (let y = height - spire; y < height; y++) {
      const fade = (y - (height - spire)) / Math.max(1, spire);
      dot(context, x, y, y === height - spire ? D.rockEdge : css(mix(rgb(D.rocksNear), rgb(D.voidBottom), fade * 0.6)));
    }
  }
}

/** Embers rising from the depths, swaying and blinking out (one step a second: the sky's layer moves no faster). */
export function paintEmbers(context: Context, width: number, height: number, seconds: number) {
  context.clearRect(0, 0, width, height);
  const count = Math.round(width / 9);
  for (let index = 0; index < count; index++) {
    const speed = 1 + pick(`emberspeed${index}`, 3);
    const span = height * 0.9;
    const risen = (seconds * speed + pick(`ember${index}`, 1000)) % span;
    const x = Math.round(pick(`emberx${index}`, width) + Math.sin(seconds / 3 + index) * 2);
    const y = Math.round(height - risen);
    if (pick(`blink${index}${Math.floor(seconds)}`, 5) === 0) continue;
    context.globalAlpha = Math.max(0.15, 1 - risen / span);
    dot(context, x, y, D.embers[index % D.embers.length]);
  }
  context.globalAlpha = 1;
}
