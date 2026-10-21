// The page behind the beach bar, one canvas pixel a sky pixel like sky.ts: a bright beach sky by day, pink and gold at
// sunset, starry at night, the sea along the bottom with the path of the sun or the moon on it; and, moving, soft
// clouds and gulls going by.
import { BEACH_PALETTE as B } from '../../design/theme-beach.ts';
import { css, mix, rgb, type Lighting, type Rgb } from '../lighting.ts';
import { paintClouds, pick } from '../sky.ts';

type Context = CanvasRenderingContext2D;
const BAND = 4;
/** Where the horizon is, from the top of the page. */
const HORIZON = 0.8;

function disc(context: Context, cx: number, cy: number, radius: number) {
  for (let dy = -radius; dy <= radius; dy++) {
    const half = Math.round(Math.sqrt(radius * radius - dy * dy));
    context.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

/** How low the sun is (0 by day and at night, 1 when it touches the sea). */
const sunset = (lighting: Lighting) => (lighting.stars < 0.6 && lighting.beam < 0.5 ? Math.min(1, (0.5 - lighting.beam) * 4) * (1 - lighting.stars) : 0);

/** The sky's colour at a height (0 top, 1 at the horizon): the hour's two colours, a band of pink between them at sunset. */
function skyAt(share: number, lighting: Lighting): Rgb {
  const low = sunset(lighting);
  const middle = mix(mix(lighting.skyTop, lighting.skyBottom, 0.6), rgb(B.duskMiddle), low * 0.7);
  const bottom = mix(lighting.skyBottom, rgb(B.duskBottom), low * 0.6);
  return share < 0.6 ? mix(lighting.skyTop, middle, share / 0.6) : mix(middle, bottom, (share - 0.6) / 0.4);
}

/** The sea's colour at a depth (0 at the horizon, 1 at the bottom of the page). */
function seaAt(share: number, lighting: Lighting): Rgb {
  const day = mix(rgb(B.oceanFar), rgb(B.oceanNear), share);
  const dusk = mix(day, rgb(B.oceanDusk), sunset(lighting) * 0.7);
  return mix(dusk, rgb(B.oceanNight), lighting.stars);
}

export function paintBeachSky(context: Context, width: number, height: number, lighting: Lighting) {
  const horizon = Math.round(height * HORIZON);
  // bands of colour, each blended into the next by a row of checkered pixels
  for (let y = 0; y < horizon; y += BAND) {
    context.fillStyle = css(skyAt(y / horizon, lighting));
    context.fillRect(0, y, width, BAND);
    context.fillStyle = css(skyAt((y + BAND) / horizon, lighting));
    for (let x = y % 2; x < width; x += 2) context.fillRect(x, y + BAND - 1, 1, 1);
  }
  const night = lighting.stars;
  if (night > 0.05) {
    context.fillStyle = B.star;
    for (let index = 0; index < (width * horizon) / 240; index++) {
      const y = pick(`beach-sy${index}`, Math.round(horizon * 0.85));
      context.globalAlpha = night * (1 - y / horizon) * (0.4 + pick(`beach-star${index}`, 60) / 100);
      context.fillRect(pick(`beach-sx${index}`, width), y, 1, 1);
    }
    context.globalAlpha = 1;
  }
  const low = sunset(lighting);
  const sunX = Math.round(width * 0.86);
  const radius = Math.max(5, Math.round(height * 0.03));
  if (night > 0.3) paintMoon(context, Math.round(width * 0.2), Math.round(height * 0.14), radius, Math.min(1, (night - 0.3) / 0.5));
  else if (low > 0.2) paintLowSun(context, sunX, horizon, radius * 2.2, low);
  else if (lighting.beam > 0.2) paintSun(context, sunX, Math.round(height * 0.14), radius, Math.min(1, lighting.beam * 1.5));
  paintSea(context, width, height, horizon, lighting, night > 0.3 ? Math.round(width * 0.2) : sunX);
}

function paintSun(context: Context, x: number, y: number, radius: number, strength: number) {
  context.fillStyle = B.sunHalo;
  for (const [grow, alpha] of [[radius * 2, 0.04], [radius, 0.08], [2, 0.16]] as const) {
    context.globalAlpha = strength * alpha;
    disc(context, x, y, Math.round(radius + grow));
  }
  context.globalAlpha = strength;
  context.fillStyle = B.sun;
  disc(context, x, y, radius);
  context.globalAlpha = 1;
}

/** The sun at sunset, big and orange, sinking into the sea (the sea painted after hides its lower half). */
function paintLowSun(context: Context, x: number, horizon: number, radius: number, strength: number) {
  const y = horizon + Math.round(radius * 0.3);
  context.fillStyle = B.sunLow;
  for (const [grow, alpha] of [[radius * 1.6, 0.06], [radius * 0.8, 0.1], [2, 0.2]] as const) {
    context.globalAlpha = strength * alpha;
    disc(context, x, y, Math.round(radius + grow));
  }
  context.globalAlpha = strength;
  disc(context, x, y, Math.round(radius));
  context.fillStyle = B.sunLowCore;
  disc(context, x - 1, y - 1, Math.round(radius * 0.7));
  context.globalAlpha = 1;
}

function paintMoon(context: Context, x: number, y: number, radius: number, strength: number) {
  context.fillStyle = B.moonHalo;
  for (const [grow, alpha] of [[radius * 1.5, 0.05], [radius * 0.7, 0.07], [2, 0.12]] as const) {
    context.globalAlpha = strength * alpha;
    disc(context, x, y, Math.round(radius + grow));
  }
  context.globalAlpha = strength;
  context.fillStyle = B.moon;
  disc(context, x, y, radius);
  context.globalAlpha = 1;
}

/** The sea under the horizon: a line of haze, lines of swell, and the path of light toward the sun or the moon. */
function paintSea(context: Context, width: number, height: number, horizon: number, lighting: Lighting, pathX: number) {
  const depth = height - horizon;
  for (let y = horizon; y < height; y++) {
    const share = (y - horizon) / Math.max(1, depth);
    context.fillStyle = css(seaAt(share, lighting));
    context.fillRect(0, y, width, 1);
  }
  context.fillStyle = css(mix(skyAt(1, lighting), rgb(B.horizon), 0.4 * (1 - lighting.stars)));
  context.fillRect(0, horizon, width, 1);
  const low = sunset(lighting);
  const glitter = lighting.stars > 0.3 ? B.glitterMoon : low > 0.2 ? B.glitterDusk : B.glitter;
  for (let y = horizon + 2; y < height; y += 2) {
    const share = (y - horizon) / Math.max(1, depth);
    // swell: short light dashes, longer toward the viewer
    for (let index = 0; index < width / 18; index++) {
      const x = pick(`swell${y},${index}`, width);
      context.globalAlpha = 0.25 + share * 0.25;
      context.fillStyle = B.seaLine;
      context.fillRect(x, y, 2 + Math.round(share * 4), 1);
    }
    const spread = 2 + share * width * 0.08;
    for (let index = 0; index < 5; index++) {
      const x = pathX + (pick(`path${y},${index}`, 200) / 100 - 1) * spread;
      context.globalAlpha = 0.85;
      context.fillStyle = glitter;
      context.fillRect(Math.round(x), y, 1 + pick(`len${y},${index}`, 3), 1);
    }
  }
  context.globalAlpha = 1;
}

/** A gull, one letter a pixel: its wings flat, then up. */
const GULLS = [['t.....t', '.ww.ww.', '...w...'], ['t.....t', '.w...w.', '..w.w..', '...w...']];

/** What moves: the clouds of the day (sky.ts), and gulls gliding by, flapping now and then. */
export function paintGulls(context: Context, width: number, height: number, seconds: number, lighting: Lighting) {
  paintClouds(context, width, height, lighting, seconds);
  const day = 1 - lighting.stars;
  if (day < 0.1) return;
  context.globalAlpha = day;
  for (let index = 0; index < 4; index++) {
    const pace = 3 + pick(`gull-pace${index}`, 4);
    const span = width + 60;
    const x = Math.round((pick(`gull-x${index}`, span) + seconds * pace) % span) - 30;
    const y = Math.round(height * (0.12 + pick(`gull-y${index}`, 40) / 100) + Math.sin(seconds * 0.8 + index) * 2);
    const flapping = Math.floor(seconds * 2.5 + index * 0.7) % 4 === 0;
    for (const [line, row] of GULLS[flapping ? 1 : 0].entries()) [...row].forEach((letter, column) => {
      if (letter === '.') return;
      context.fillStyle = letter === 't' ? B.gullTip : B.gull;
      context.fillRect(x + column, y + line, 1, 1);
    });
  }
  context.globalAlpha = 1;
}
