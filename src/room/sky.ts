// The sky behind the whole page, in pixel art: the sky of the room's windows at the same hour (bands from top to
// bottom), stars and the moon at night, painted once per quarter of an hour or size; and the clouds of the day, on a
// layer of their own that drifts a pixel at a time. One canvas pixel is SKY_PIXEL CSS pixels.
import { ROOM_PALETTE as P } from '../design/room-palette.ts';
import { css, mix, rgb, type Lighting, type Rgb } from './lighting.ts';
import { hash } from './sprites.ts';
import type { Festival } from '../../shared/festivals.ts';

/** CSS pixels per sky pixel: about the size of the room's own art pixels */
export const SKY_PIXEL = 3;
const BAND = 6;
const F = P.festive;

type Context = CanvasRenderingContext2D;

/** A stable number from 0 to n - 1 for a key; mixed further than hash(), whose low bits barely change from one index to the next. */
export function pick(key: string, n: number): number {
  let value = hash(key);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) % n;
}

export function paintSky(context: Context, width: number, height: number, lighting: Lighting) {
  const skyAt = (y: number): Rgb => mix(lighting.skyTop, lighting.skyBottom, Math.min(1, y / height));
  for (let y = 0; y < height; y += BAND) {
    context.fillStyle = css(skyAt(y + BAND / 2));
    context.fillRect(0, y, width, BAND);
  }
  const night = lighting.stars;
  if (night > 0.05) paintStars(context, width, height, night);
  if (night > 0.3) paintMoon(context, Math.round(width * 0.5), Math.round(height * 0.12), (night - 0.3) / 0.7, skyAt);
}

function paintStars(context: Context, width: number, height: number, night: number) {
  const count = Math.round((width * height) / 260);
  const deep = Math.round(height * 0.75);
  context.fillStyle = P.star;
  for (let index = 0; index < count; index++) {
    const x = pick(`star-x${index}`, width);
    const y = pick(`star-y${index}`, deep);
    // fewer and fainter toward the horizon, where the city's light washes them out
    context.globalAlpha = night * (1 - y / deep) * (0.35 + pick(`star-b${index}`, 65) / 100);
    context.fillRect(x, y, 1, 1);
    // one star in twenty-five is bright: a little cross
    if (index % 25 === 0) {
      context.globalAlpha *= 0.55;
      context.fillRect(x - 1, y, 1, 1);
      context.fillRect(x + 1, y, 1, 1);
      context.fillRect(x, y - 1, 1, 1);
      context.fillRect(x, y + 1, 1, 1);
    }
  }
  context.globalAlpha = 1;
}

/** A filled pixel disc. */
function disc(context: Context, cx: number, cy: number, radius: number) {
  for (let dy = -radius; dy <= radius; dy++) {
    const half = Math.round(Math.sqrt(radius * radius - dy * dy));
    context.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

function paintMoon(context: Context, x: number, y: number, strength: number, skyAt: (y: number) => Rgb) {
  // a halo in two soft steps
  context.fillStyle = P.light.moon;
  context.globalAlpha = Math.min(1, strength) * 0.07;
  disc(context, x, y, 12);
  disc(context, x, y, 9);
  context.globalAlpha = Math.min(1, strength);
  context.fillStyle = P.light.moonDisk;
  disc(context, x, y, 6);
  // the crescent: the sky's own colour, under the halo, bites into the disc
  const halo = 1 - (1 - Math.min(1, strength) * 0.07) ** 2;
  context.fillStyle = css(mix(skyAt(y), rgb(P.light.moon), halo));
  disc(context, x + 3, y - 2, 5);
  context.globalAlpha = 1;
}

/** The clouds at `seconds` (any clock): each drifts right at its own pace, the big ones faster, and comes back from the left. */
export function paintClouds(context: Context, width: number, height: number, lighting: Lighting, seconds: number) {
  context.clearRect(0, 0, width, height);
  const day = 1 - lighting.stars;
  if (day < 0.05) return;
  // at dawn and dusk the clouds take the horizon's colour
  const light = css(mix(rgb(P.light.cloud), lighting.skyBottom, 0.3));
  const shade = css(mix(rgb(P.light.cloudShade), lighting.skyBottom, 0.35));
  const count = Math.max(4, Math.round(width / 55));
  const span = width + 80;
  context.globalAlpha = day * 0.92;
  for (let index = 0; index < count; index++) {
    const size = 5 + pick(`cloud-s${index}`, 7);
    const puffs = 3 + pick(`cloud-p${index}`, 3);
    const start = ((index + pick(`cloud-x${index}`, 100) / 100) / count) * span;
    const pace = 0.3 + size * 0.05;
    const x = Math.round((start + seconds * pace) % span) - 40;
    const y = Math.round(height * (0.14 + pick(`cloud-y${index}`, 56) / 100));
    const length = puffs * size + size;
    context.fillStyle = shade;
    context.fillRect(x - size, y, length, 2);
    context.fillStyle = light;
    for (let puff = 0; puff < puffs; puff++) {
      const radius = puff === 1 || puff === puffs - 2 ? size : Math.round(size * 0.7);
      disc(context, x + puff * size, y - radius + 2, radius);
    }
    context.fillRect(x - size, y - 1, length, 2);
  }
  context.globalAlpha = 1;
}

/** Whether a festival moves in the sky: it then needs more frames than the clouds alone. */
export const skyIsBusy = (festival: Festival | null) => festival === 'christmas' || festival === 'newYear' || festival === 'bastille';

/** The festival's sky over the clouds: snow falling over the whole page at Christmas, fireworks on the nights that have them. */
export function paintSkyFestival(context: Context, width: number, height: number, festival: Festival | null, lighting: Lighting, seconds: number) {
  if (festival === 'christmas') paintSnow(context, width, height, seconds);
  if ((festival === 'newYear' || festival === 'bastille') && lighting.stars > 0.3) paintFireworks(context, width, height, seconds, Math.min(1, lighting.stars));
}

function paintSnow(context: Context, width: number, height: number, seconds: number) {
  const count = Math.round((width * height) / 450);
  context.fillStyle = F.snow;
  for (let index = 0; index < count; index++) {
    const speed = 5 + pick(`snow-v${index}`, 9);
    const size = pick(`snow-s${index}`, 3) === 0 ? 2 : 1;
    const y = Math.round((pick(`snow-y${index}`, height) + seconds * speed) % (height + 4)) - 2;
    const x = Math.round(pick(`snow-x${index}`, width) + Math.sin(seconds * 0.7 + index) * 3);
    context.globalAlpha = size === 2 ? 0.95 : 0.7;
    context.fillRect(x, y, size, size);
  }
  context.globalAlpha = 1;
}

function paintFireworks(context: Context, width: number, height: number, seconds: number, night: number) {
  const bursts = Math.max(3, Math.round(width / 80));
  for (let index = 0; index < bursts; index++) {
    const period = 2.2 + (index % 4) * 0.35;
    const clock = seconds + index * 0.9;
    const round = Math.floor(clock / period);
    const t = (clock % period) / period;
    const key = `burst${index}:${round}`;
    const x = Math.round(width * (0.05 + pick(`${key}x`, 90) / 100));
    const y = Math.round(height * (0.1 + pick(`${key}y`, 40) / 100));
    const colour = F.bulbs[pick(`${key}c`, F.bulbs.length)];
    if (t < 0.3) {
      // the rocket climbing, with a short trail
      const climb = y + (height - y) * (1 - t / 0.3);
      context.globalAlpha = night;
      context.fillStyle = F.flame;
      context.fillRect(x, Math.round(climb), 1, 2);
      context.globalAlpha = night * 0.4;
      context.fillRect(x, Math.round(climb) + 3, 1, 2);
      continue;
    }
    // the burst: each ray a spark and the trail behind it, falling a little as it fades
    const spread = Math.sqrt((t - 0.3) / 0.7);
    const radius = 18 + pick(`${key}r`, 14);
    const fade = 1 - (t - 0.3) / 0.7;
    for (let ray = 0; ray < 20; ray++) {
      const angle = (ray / 20) * Math.PI * 2;
      context.fillStyle = ray % 3 ? colour : F.white;
      for (const [share, alpha, size] of [[1, 1, 2], [0.82, 0.55, 1], [0.66, 0.3, 1]] as const) {
        context.globalAlpha = night * fade * alpha;
        const reach = spread * radius * share;
        context.fillRect(Math.round(x + Math.cos(angle) * reach), Math.round(y + Math.sin(angle) * reach * 0.85 + spread * spread * 8), size, size);
      }
    }
  }
  context.globalAlpha = 1;
}
