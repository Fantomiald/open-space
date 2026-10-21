// The page behind the galleon, in sky pixels (sky.ts): the sky of the hour over the open sea, a far island with its
// palms on the horizon, a rock on the other side, the moon and its path on the water at night; and what moves, on the
// layer of its own: clouds, gulls, glints on the waves, a far ship sailing by.
import { PIRATE_PALETTE as P } from '../../design/theme-pirate.ts';
import { ROOM_PALETTE } from '../../design/room-palette.ts';
import { css, mix, rgb, type Lighting, type Rgb } from '../lighting.ts';
import { pick } from '../sky.ts';

type Context = CanvasRenderingContext2D;
/** Where the sea meets the sky, as a share of the page's height. */
const HORIZON = 0.45;

function dot(context: Context, x: number, y: number, colour: string) {
  context.fillStyle = colour;
  context.fillRect(x, y, 1, 1);
}

/** The colour of the sea at a depth below the horizon (0 there, 1 at the bottom of the page). */
function seaAt(depth: number, lighting: Lighting): Rgb {
  const day = mix(mix(rgb(P.seaLight), rgb(P.seaDay), Math.min(1, depth * 3)), rgb(P.seaDeep), depth);
  const water = mix(day, rgb(P.seaNight), lighting.stars);
  // near the horizon the sea mirrors the sky
  return mix(water, lighting.skyBottom, Math.max(0, 0.45 - depth) * 0.9);
}

/** An island on the horizon: a sandy foot, a green hump, palms leaning out of it, all paler with the distance. */
function island(context: Context, x: number, horizon: number, size: number, lighting: Lighting, palms: number) {
  const haze = (colour: string) => css(mix(mix(rgb(colour), lighting.skyBottom, 0.3), rgb(P.islandNight), lighting.stars * 0.9));
  for (let across = -size; across <= size; across++) {
    const share = Math.abs(across) / size;
    const height = Math.round((1 - share ** 1.6) * size * 0.32 + Math.sin(across * 0.7) * 0.6);
    for (let up = 0; up <= height; up++) dot(context, x + across, horizon - up, up === 0 && share < 0.95 ? haze(P.sand) : haze(P.island));
  }
  for (let palm = 0; palm < palms; palm++) {
    const foot = x + Math.round((palm - (palms - 1) / 2) * size * 0.35);
    const base = horizon - Math.round(size * 0.28);
    const lean = palm % 2 ? 1 : -1;
    const height = Math.round(size * 0.4) + palm * 2;
    for (let up = 0; up < height; up++) dot(context, foot + Math.round((lean * up * up) / (height * 3)), base - up, haze(P.palmTrunk));
    const top = { x: foot + Math.round(lean * height / 3), y: base - height };
    for (const [dx, dy] of [[-3, 1], [-2, 0], [-1, 0], [0, -1], [1, 0], [2, 0], [3, 1], [-4, 2], [4, 2], [0, 0], [-1, -1], [1, -1]] as const) dot(context, top.x + dx, top.y + dy, haze(P.palm));
  }
}

/** A rock standing out of the sea, dark against it. */
function rock(context: Context, x: number, horizon: number, size: number, lighting: Lighting) {
  const colour = css(mix(mix(rgb(P.islandFar), lighting.skyBottom, 0.35), rgb(P.islandNight), lighting.stars * 0.9));
  for (let across = -size; across <= size; across++) {
    const height = Math.round((1 - Math.abs(across) / size) * size * 0.8 + (across < 0 ? 1 : 0));
    for (let up = 0; up <= height; up++) dot(context, x + across, horizon - up, colour);
  }
}

/** A filled pixel disc. */
function disc(context: Context, cx: number, cy: number, radius: number) {
  for (let dy = -radius; dy <= radius; dy++) {
    const half = Math.round(Math.sqrt(radius * radius - dy * dy));
    context.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

/** The page: the sky of the hour down to the horizon, stars and the moon at night, the islands, the sea and its waves. */
export function paintSeaAndSky(context: Context, width: number, height: number, lighting: Lighting) {
  const horizon = Math.round(height * HORIZON);
  for (let y = 0; y < horizon; y += 3) {
    context.fillStyle = css(mix(lighting.skyTop, lighting.skyBottom, Math.min(1, (y / horizon) ** 1.3)));
    context.fillRect(0, y, width, 3);
  }
  for (let y = horizon; y < height; y++) {
    context.fillStyle = css(seaAt((y - horizon) / (height - horizon), lighting));
    context.fillRect(0, y, width, 1);
  }
  const night = lighting.stars;
  if (night > 0.05) {
    const count = Math.round((width * horizon) / 200);
    for (let index = 0; index < count; index++) {
      const x = pick(`pirate-star${index}`, width), y = pick(`pirate-stary${index}`, horizon - 6);
      context.globalAlpha = night * (1 - y / horizon) * (0.4 + pick(`pirate-starb${index}`, 60) / 100);
      dot(context, x, y, ROOM_PALETTE.star);
    }
    context.globalAlpha = 1;
  }
  const moon = { x: Math.round(width * 0.74), y: Math.round(height * 0.13) };
  if (night > 0.3) {
    const strength = Math.min(1, (night - 0.3) / 0.5);
    context.fillStyle = P.moonPath;
    context.globalAlpha = strength * 0.08;
    disc(context, moon.x, moon.y, 13);
    disc(context, moon.x, moon.y, 9);
    context.globalAlpha = strength;
    disc(context, moon.x, moon.y, 6);
    context.fillStyle = css(mix(lighting.skyTop, rgb(P.moonPath), 0.12));
    disc(context, moon.x + 3, moon.y - 2, 5);
    context.globalAlpha = 1;
  }
  island(context, Math.round(width * 0.07), horizon, Math.max(10, Math.round(width / 22)), lighting, 3);
  island(context, Math.round(width * 0.9), horizon, Math.max(5, Math.round(width / 60)), lighting, 1);
  rock(context, Math.round(width * 0.97), horizon, Math.max(4, Math.round(width / 70)), lighting);
  // the waves: short lit dashes and their troughs, longer and further apart towards the bottom (nearer)
  for (let y = horizon + 2; y < height; y += 2) {
    const depth = (y - horizon) / (height - horizon);
    const length = 2 + Math.round(depth * 7);
    const water = seaAt(depth, lighting);
    const crest = css(mix(water, rgb(night > 0.5 ? P.seaNightLight : P.seaLight), 0.45 + depth * 0.2));
    const trough = css(mix(water, rgb(P.seaNight), 0.25));
    for (let x = -pick(`row${y}`, length * 3); x < width; x += length * 3 + pick(`gap${y},${x}`, length * 2 + 4)) {
      context.fillStyle = crest;
      context.fillRect(x, y, length, 1);
      context.fillStyle = trough;
      context.fillRect(x + 1, y + 1, length, 1);
    }
  }
  // the moon's path on the water
  if (night > 0.3) {
    context.globalAlpha = Math.min(1, (night - 0.3) / 0.5) * 0.8;
    for (let y = horizon + 1; y < height; y++) {
      const depth = (y - horizon) / (height - horizon);
      const spread = 3 + depth * 24;
      // a few dashes on each line of water, longer nearer, scattered over the path
      for (let dash = 0; dash < 2 + depth * 3; dash++) {
        const length = 1 + pick(`moonlen${y},${dash}`, 2 + Math.round(depth * 5));
        const x = Math.round(moon.x - spread + (pick(`moondash${y},${dash}`, 1000) / 1000) * spread * 2);
        context.fillStyle = P.moonPath;
        context.fillRect(x, y, length, 1);
      }
    }
    context.globalAlpha = 1;
  }
}

/** A gull, three frames of its wings (one letter a pixel): up, level, down. */
const GULL = [['#.....#', '.#...#.', '..#.#..', '...#...'], ['.......', '##...##', '..###..', '...#...'], ['.......', '...#...', '.##.##.', '#.....#']];

/** The clouds above the horizon, a few gulls by day, glints on the waves, a far ship crossing the horizon. */
export function paintSeaMotion(context: Context, width: number, height: number, seconds: number, lighting: Lighting) {
  context.clearRect(0, 0, width, height);
  const horizon = Math.round(height * HORIZON);
  const day = 1 - lighting.stars;
  // clouds, white by day, dim and blue at night
  const light = css(mix(mix(rgb(ROOM_PALETTE.light.cloud), lighting.skyBottom, 0.3), rgb(P.seaNightLight), lighting.stars));
  const shade = css(mix(mix(rgb(ROOM_PALETTE.light.cloudShade), lighting.skyBottom, 0.35), rgb(P.seaNight), lighting.stars));
  const count = Math.max(3, Math.round(width / 70));
  const span = width + 80;
  context.globalAlpha = 0.35 + day * 0.55;
  for (let index = 0; index < count; index++) {
    const size = 4 + pick(`pcloud-s${index}`, 6);
    const puffs = 3 + pick(`pcloud-p${index}`, 3);
    const start = ((index + pick(`pcloud-x${index}`, 100) / 100) / count) * span;
    const x = Math.round((start + seconds * (0.25 + size * 0.04)) % span) - 40;
    const y = Math.round(horizon * (0.12 + pick(`pcloud-y${index}`, 60) / 100));
    const length = puffs * size + size;
    context.fillStyle = shade;
    context.fillRect(x - size, y, length, 2);
    context.fillStyle = light;
    for (let puff = 0; puff < puffs; puff++) disc(context, x + puff * size, y - (puff % 2 ? size : Math.round(size * 0.7)) + 2, puff % 2 ? size : Math.round(size * 0.7));
    context.fillRect(x - size, y - 1, length, 2);
  }
  context.globalAlpha = 1;
  // a far ship sailing along the horizon
  const ship = Math.round(((seconds * 0.6) % (width + 30)) - 15);
  const hullColour = css(mix(mix(rgb(P.hullFar), lighting.skyBottom, 0.3), rgb(P.islandNight), lighting.stars));
  const sailColour = css(mix(mix(rgb(P.sail), lighting.skyBottom, 0.25), rgb(P.seaNightLight), lighting.stars));
  context.fillStyle = hullColour;
  context.fillRect(ship - 4, horizon - 1, 9, 1);
  context.fillRect(ship - 3, horizon, 7, 1);
  context.fillStyle = sailColour;
  for (const [x, top] of [[-2, 4], [1, 6], [3, 3]] as const) context.fillRect(ship + x, horizon - 1 - top, 2, top - 1);
  dot(context, ship + 1, horizon - 8, P.flag);
  // glints on the waves, here and there, a new set every beat
  const beat = Math.floor(seconds * 2);
  const glints = Math.round(width / 12);
  for (let index = 0; index < glints; index++) {
    const x = pick(`seaglint-x${index},${beat}`, width), y = horizon + 2 + pick(`seaglint-y${index},${beat}`, height - horizon - 2);
    context.globalAlpha = 0.4 + day * 0.5;
    dot(context, x, y, lighting.stars > 0.5 ? P.moonPath : P.glint);
    if (index % 3 === 0) { dot(context, x - 1, y, P.glint); dot(context, x + 1, y, P.glint); }
  }
  context.globalAlpha = 1;
  if (day < 0.3) return;
  // gulls gliding and flapping, each on its own path
  context.globalAlpha = Math.min(1, day * 1.2);
  for (let index = 0; index < 4; index++) {
    const speed = 2 + pick(`gull-v${index}`, 3);
    const x = Math.round((pick(`gull-x${index}`, width) + seconds * speed) % (width + 20)) - 10;
    const y = Math.round(horizon * (0.25 + pick(`gull-y${index}`, 45) / 100) + Math.sin(seconds / 2 + index) * 3);
    const frame = GULL[Math.floor(seconds * 4 + index) % 4 === 3 ? 1 : Math.floor(seconds * 4 + index) % 3];
    for (const [line, row] of frame.entries()) [...row].forEach((letter, column) => {
      if (letter === '#') dot(context, x + column, y + line, column === 0 || column === row.length - 1 ? P.gullWing : P.gull);
    });
  }
  context.globalAlpha = 1;
}
