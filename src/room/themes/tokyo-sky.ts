// The page behind the Tokyo street (tokyo.ts), one canvas pixel a sky pixel like sky.ts: the night over the city in a
// haze of neon, pink and violet, the moon in it (a low sun at the end of the day); and, moving, the rain, sky
// lanterns going up and a blimp going by with its screen.
import { TOKYO_PALETTE as T } from '../../design/theme-tokyo.ts';
import { css, mix, rgb, type Lighting, type Rgb } from '../lighting.ts';
import { pick } from '../sky.ts';

type Context = CanvasRenderingContext2D;
const BAND = 4;
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

/** The sky's colour at a height (0 top, 1 bottom), from the evening's to the night's. */
function skyAt(share: number, night: number): Rgb {
  const top = mix(rgb(T.skyDuskTop), rgb(T.skyNightTop), night);
  const middle = mix(rgb(T.skyDuskMiddle), rgb(T.skyNightMiddle), night);
  const bottom = mix(rgb(T.skyDuskBottom), rgb(T.skyNightBottom), night);
  return share < 0.55 ? mix(top, middle, share / 0.55) : mix(middle, bottom, (share - 0.55) / 0.45);
}

function disc(context: Context, cx: number, cy: number, radius: number) {
  for (let dy = -radius; dy <= radius; dy++) {
    const half = Math.round(Math.sqrt(radius * radius - dy * dy));
    context.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

export function paintNeonSky(context: Context, width: number, height: number, lighting: Lighting) {
  const night = lighting.stars;
  // bands of colour, each blended into the next by a row of checkered pixels
  for (let y = 0; y < height; y += BAND) {
    context.fillStyle = css(skyAt(y / height, night));
    context.fillRect(0, y, width, BAND);
    context.fillStyle = css(skyAt((y + BAND) / height, night));
    for (let x = y % 2; x < width; x += 2) context.fillRect(x, y + BAND - 1, 1, 1);
  }
  // a few stars high up, where the city's light does not reach
  context.fillStyle = T.skyStar;
  for (let index = 0; index < (width * height) / 700; index++) {
    context.globalAlpha = night * (0.3 + pick(`tokyo-star${index}`, 60) / 100);
    context.fillRect(pick(`tokyo-sx${index}`, width), pick(`tokyo-sy${index}`, Math.round(height * 0.35)), 1, 1);
  }
  context.globalAlpha = 1;
  const radius = Math.max(6, Math.round(height * 0.045));
  if (night > 0.3) paintMoon(context, Math.round(width * 0.82), Math.round(height * 0.16), radius, Math.min(1, (night - 0.3) / 0.5));
  if (night < 0.7) paintSun(context, Math.round(width * 0.86), Math.round(height * 0.3), radius * 2, 1 - night / 0.7, height, night);
  paintHaze(context, width, height, night);
}

function paintMoon(context: Context, x: number, y: number, radius: number, strength: number) {
  context.fillStyle = T.moonHalo;
  for (const [grow, alpha] of [[radius * 1.4, 0.04], [radius * 0.7, 0.06], [2, 0.1]] as const) {
    context.globalAlpha = strength * alpha;
    disc(context, x, y, Math.round(radius + grow));
  }
  context.globalAlpha = strength;
  context.fillStyle = T.moon;
  disc(context, x, y, radius);
  // its seas, a little darker
  context.fillStyle = T.moonShade;
  context.globalAlpha = strength * 0.6;
  for (const [dx, dy, size] of [[-0.35, -0.2, 0.3], [0.25, 0.15, 0.22], [-0.05, 0.45, 0.16]] as const) disc(context, Math.round(x + dx * radius), Math.round(y + dy * radius), Math.round(size * radius));
  context.globalAlpha = 1;
}

/** The sun low over the city at the end of the day, cut by the haze in stripes. */
function paintSun(context: Context, x: number, y: number, radius: number, strength: number, height: number, night: number) {
  context.fillStyle = T.sun;
  context.globalAlpha = strength * 0.12;
  disc(context, x, y, Math.round(radius * 1.5));
  context.globalAlpha = strength;
  disc(context, x, y, radius);
  // the haze crosses its lower half in widening bands of the sky's own colour
  for (let row = 3, band = 1; row < radius; row += 3 + band, band++) for (let line = row; line < Math.min(radius, row + band); line++) {
    const half = Math.round(Math.sqrt(radius * radius - line * line));
    context.fillStyle = css(skyAt((y + line) / height, night));
    context.fillRect(x - half, y + line, half * 2 + 1, 1);
  }
  context.globalAlpha = 1;
}

/** Soft banks of neon haze over the city, dithered pixel by pixel so they stay pixel art; brighter at night. */
function paintHaze(context: Context, width: number, height: number, night: number) {
  const banks = [
    { x: 0.2, y: 0.82, rx: 0.45, ry: 0.12, colour: T.haze[0] },
    { x: 0.7, y: 0.74, rx: 0.4, ry: 0.1, colour: T.haze[1] },
    { x: 0.45, y: 0.95, rx: 0.6, ry: 0.12, colour: T.haze[0] },
    { x: 0.85, y: 0.9, rx: 0.3, ry: 0.08, colour: T.haze[2] },
    { x: 0.4, y: 0.55, rx: 0.35, ry: 0.06, colour: T.haze[1] },
  ];
  for (const bank of banks) {
    const cx = bank.x * width, cy = bank.y * height, rx = bank.rx * width, ry = bank.ry * height;
    context.fillStyle = bank.colour;
    for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(height, cy + ry); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(width, cx + rx); x++) {
      const distance = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (distance >= 1) continue;
      // ordered dithering: the haze thins out in regular patterns rather than in noise
      const density = (1 - distance) ** 1.2;
      if (BAYER[y % 4][x % 4] / 16 < density * 0.8) {
        context.globalAlpha = (0.1 + density * 0.2) * (0.5 + night * 0.5);
        context.fillRect(x, y, 1, 1);
      }
    }
  }
  context.globalAlpha = 1;
}

/** What moves over the city at `seconds`: rain, sky lanterns going up, a blimp and its screen. */
export function paintRain(context: Context, width: number, height: number, seconds: number, lighting: Lighting) {
  context.clearRect(0, 0, width, height);
  paintLanterns(context, width, height, seconds, lighting.stars);
  paintBlimp(context, width, height, seconds, lighting.stars);
  // the rain: fresh streaks every second, slanting a little with the wind
  const beat = Math.floor(seconds);
  context.fillStyle = T.rain;
  for (let index = 0; index < (width * height) / 260; index++) {
    const x = pick(`rain-x${beat}:${index}`, width), y = pick(`rain-y${beat}:${index}`, height);
    const length = 3 + pick(`rain-l${index}`, 3);
    context.globalAlpha = 0.18 + pick(`rain-a${index}`, 20) / 100;
    for (let step = 0; step < length; step++) context.fillRect(x - Math.floor(step / 3), y + step, 1, 1);
  }
  context.globalAlpha = 1;
}

function paintLanterns(context: Context, width: number, height: number, seconds: number, night: number) {
  const count = Math.max(5, Math.round(width / 45));
  for (let index = 0; index < count; index++) {
    const speed = 0.25 + pick(`lantern-v${index}`, 30) / 100;
    const span = height * 0.75;
    const rise = (pick(`lantern-y${index}`, Math.round(span)) + seconds * speed) % span;
    const y = Math.round(height - rise);
    const x = Math.round(pick(`lantern-x${index}`, width) + Math.sin(seconds * 0.3 + index) * 2);
    // they fade as they climb
    const alpha = Math.min(1, (1 - rise / span) * 1.6) * (0.6 + night * 0.4);
    context.globalAlpha = alpha * 0.3;
    context.fillStyle = T.skyLantern;
    context.fillRect(x - 1, y - 1, 4, 5);
    context.globalAlpha = alpha;
    context.fillRect(x, y, 2, 3);
    context.fillStyle = T.skyLanternCore;
    context.fillRect(x, y + 2, 2, 1);
  }
  context.globalAlpha = 1;
}

/** A blimp drifting across, its screen showing the neon colours one after the other, its lights blinking. */
function paintBlimp(context: Context, width: number, height: number, seconds: number, night: number) {
  const span = width + 80;
  const x = Math.round(width + 40 - ((seconds * 0.6) % span)), y = Math.round(height * 0.32);
  const rx = 16, ry = 5;
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2));
    context.fillStyle = dy < -1 ? T.blimpLight : T.blimp;
    context.fillRect(x - half, y + dy, half * 2 + 1, 1);
  }
  // the fins at its tail, the gondola under it
  context.fillStyle = T.blimp;
  context.fillRect(x + rx - 1, y - ry - 2, 3, 3);
  context.fillRect(x + rx - 1, y + ry - 1, 3, 3);
  context.fillRect(x - 3, y + ry, 6, 2);
  const colours = T.blimpScreen;
  context.fillStyle = colours[Math.floor(seconds / 3) % colours.length];
  context.globalAlpha = 0.65 + night * 0.35;
  context.fillRect(x - 8, y - 2, 15, 4);
  context.fillStyle = T.skyLanternCore;
  for (let column = 0; column < 15; column += 2) if ((column + Math.floor(seconds)) % 6 < 3) context.fillRect(x - 8 + column, y - 1, 1, 2);
  context.globalAlpha = 1;
  if (Math.floor(seconds) % 2 === 0) {
    context.fillStyle = T.neon.red.colour;
    context.fillRect(x - rx, y, 1, 1);
    context.fillRect(x + rx + 1, y - ry - 2, 1, 1);
  }
}
