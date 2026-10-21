// The page behind the treehouse, in sky pixels (sky.ts): a sky warmed by a golden haze by day, the Sun and its beams
// slanting through, far trunks in the haze, the treetops below in layers from far to near, leaves hanging into the top
// corners; at night the stars and the Moon. On the layer that moves: leaves falling, motes in the sun, fireflies at night.
import { FOREST_PALETTE as F } from '../../design/theme-forest.ts';
import { css, mix, rgb, type Lighting, type Rgb } from '../lighting.ts';
import { pick } from '../sky.ts';
import { noise } from './forest-art.ts';

type Context = CanvasRenderingContext2D;

function dot(context: Context, x: number, y: number, colour: string) {
  context.fillStyle = colour;
  context.fillRect(x, y, 1, 1);
}

const dayOf = (lighting: Lighting) => 1 - lighting.stars;
/** A colour of the forest at the hour: its day colour blended into its night one. */
const atHour = (day: string, night: string, lighting: Lighting): Rgb => mix(rgb(night), rgb(day), dayOf(lighting));

/** The sky's colour at a height, the hour's sky tinted toward the forest's. */
function skyAt(y: number, height: number, lighting: Lighting): Rgb {
  const share = Math.min(1, y / height);
  const forest = mix(atHour(F.skyDayTop, F.skyNightTop, lighting), atHour(F.skyDayBottom, F.skyNightBottom, lighting), share);
  return mix(mix(lighting.skyTop, lighting.skyBottom, share), forest, 0.4);
}

/** Where the Sun and the Moon are. */
const SUN = { x: 0.8, y: 0.16 };
const MOON = { x: 0.2, y: 0.13 };

/** The beams of the Sun fanning down through the haze, dithered, faint. */
function paintBeams(context: Context, width: number, height: number, day: number) {
  const sun = { x: SUN.x * width, y: SUN.y * height };
  context.fillStyle = F.sunRay;
  for (let y = 0; y < height * 0.8; y++) for (let x = 0; x < width; x++) {
    const angle = Math.atan2(y - sun.y, x - sun.x);
    const beam = Math.sin(angle * 23 + 1.3) * 0.5 + Math.sin(angle * 9) * 0.5;
    if (beam < 0.55) continue;
    const distance = Math.hypot(x - sun.x, y - sun.y) / height;
    const strength = (beam - 0.55) * 2.2 * Math.max(0, 1 - distance * 1.1) * day;
    if (pick(`beam${x},${y}`, 100) / 100 < strength * 0.5) {
      context.globalAlpha = 0.18;
      context.fillRect(x, y, 1, 1);
    }
  }
  context.globalAlpha = 1;
}

function disc(context: Context, cx: number, cy: number, radius: number) {
  for (let dy = -radius; dy <= radius; dy++) {
    const half = Math.round(Math.sqrt(radius * radius - dy * dy));
    context.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

function paintSun(context: Context, width: number, height: number, lighting: Lighting) {
  const day = dayOf(lighting);
  const x = Math.round(SUN.x * width), y = Math.round(SUN.y * height);
  // low in the evening, the Sun takes the colour of the horizon
  context.fillStyle = css(mix(rgb(F.sunGlow), lighting.skyBottom, lighting.stars * 1.5));
  for (const [radius, alpha] of [[22, 0.08], [15, 0.1], [10, 0.16]] as const) {
    context.globalAlpha = alpha * day;
    disc(context, x, y, radius);
  }
  context.globalAlpha = day;
  context.fillStyle = css(mix(rgb(F.sun), lighting.skyBottom, lighting.stars * 1.2));
  disc(context, x, y, 6);
  context.globalAlpha = 1;
}

function paintNight(context: Context, width: number, height: number, lighting: Lighting) {
  const night = lighting.stars;
  const count = Math.round((width * height) / 220);
  context.fillStyle = F.star;
  for (let index = 0; index < count; index++) {
    const x = pick(`fstar-x${index}`, width), y = pick(`fstar-y${index}`, Math.round(height * 0.6));
    context.globalAlpha = night * (0.3 + pick(`fstar-b${index}`, 70) / 100) * (1 - y / (height * 0.6));
    context.fillRect(x, y, 1, 1);
    if (index % 28 === 0) {
      context.globalAlpha *= 0.5;
      context.fillRect(x - 1, y, 3, 1);
      context.fillRect(x, y - 1, 1, 3);
    }
  }
  if (night < 0.3) { context.globalAlpha = 1; return; }
  const x = Math.round(MOON.x * width), y = Math.round(MOON.y * height);
  context.fillStyle = F.moon;
  for (const [radius, alpha] of [[16, 0.05], [11, 0.07]] as const) {
    context.globalAlpha = alpha * night;
    disc(context, x, y, radius);
  }
  context.globalAlpha = night;
  disc(context, x, y, 7);
  context.fillStyle = F.moonShade;
  for (const [cx, cy, radius] of [[x - 2, y + 1, 1], [x + 2, y - 3, 1], [x + 3, y + 2, 1]] as const) disc(context, cx, cy, radius);
  context.globalAlpha = 1;
}

/** Far trunks rising from the treetops into the haze, a branch or two, a crown lost at the top. */
function paintFarTrunks(context: Context, width: number, height: number, lighting: Lighting) {
  for (const share of [0.05, 0.95]) {
    const middle = Math.round(share * width);
    for (let y = 0; y < height * 0.75; y++) {
      const haze = mix(atHour(F.canopyTrunk, F.canopyTrunkNight, lighting), skyAt(y, height, lighting), 0.08 + (y / height) * 0.3);
      const half = 6 + Math.round(y / height * 5);
      const sway = Math.round(Math.sin(y / 40 + share * 10) * 3);
      for (let x = -half; x < half; x++) {
        const ridge = (x + half + Math.round(noise('bark', x, y, 4) * 3)) % 4 === 0;
        context.fillStyle = css(ridge ? mix(haze, [0, 0, 0], 0.12) : x < -half / 2 ? mix(haze, [255, 255, 255], 0.08) : haze);
        context.fillRect(middle + x + sway, y, 1, 1);
      }
    }
    // two branches going up and out
    for (const [side, from] of [[-1, 0.3], [1, 0.45]] as const) {
      const start = Math.round(height * (from + share * 0.1));
      context.fillStyle = css(mix(atHour(F.canopyTrunk, F.canopyTrunkNight, lighting), skyAt(start, height, lighting), 0.25));
      for (let step = 0; step < height * 0.12; step++) context.fillRect(middle + side * (3 + step), start - Math.round(step * 0.7), 2, 2);
    }
  }
}

/** The leaves overhead, hanging into the top corners of the page, strands of ivy hanging from them. */
function paintOverhang(context: Context, width: number, height: number, lighting: Lighting) {
  const leaves = atHour(F.canopy[3], F.canopyNight[3], lighting);
  const lit = atHour(F.canopy[2], F.canopyNight[2], lighting);
  const reach = Math.round(width * 0.17);
  for (const side of [0, 1]) for (let across = 0; across < reach; across++) {
    const x = side ? width - 1 - across : across;
    const share = 1 - across / reach;
    const depth = Math.round(height * (0.015 + share ** 2 * 0.1) + noise(`overhang${side}`, across, 0, 5) * height * 0.035);
    for (let y = 0; y < depth; y++) {
      const speckle = pick(`oh${x},${y}`, 7);
      context.fillStyle = css(y > depth - 2 && speckle < 3 ? lit : speckle === 0 ? lit : leaves);
      context.fillRect(x, y, 1, 1);
    }
    if (pick(`vine${side}${across}`, 14) === 0) {
      const length = Math.round(height * (0.04 + pick(`vinelength${side}${across}`, 10) / 100));
      for (let down = 0; down < length; down++) {
        context.fillStyle = css(down % 3 === 0 ? lit : leaves);
        context.fillRect(x + (down % 3 === 0 ? 1 : 0), depth + down, 1, 1);
      }
    }
  }
}

/** The treetops below, in layers from the far ones (lost in the haze) to the near ones: round crowns lit along their top. */
function paintTreetops(context: Context, width: number, height: number, lighting: Lighting) {
  const day = dayOf(lighting);
  for (let layer = 0; layer < 4; layer++) {
    const base = height * (0.66 + layer * 0.085);
    const radius = Math.round(height * (0.05 + layer * 0.022));
    const colour = mix(atHour(F.canopy[layer], F.canopyNight[layer], lighting), skyAt(base, height, lighting), (3 - layer) * 0.16);
    const shade = mix(colour, [0, 0, 0], 0.18);
    const rim = mix(colour, atHour(F.canopyLit, F.canopyLitNight, lighting), 0.55);
    // the crowns: circles side by side, a little apart, at their own heights
    const crowns: { x: number; y: number; r: number }[] = [];
    for (let x = -radius, index = 0; x < width + radius; x += Math.round(radius * 1.25), index++) {
      const r = Math.round(radius * (0.75 + pick(`crown${layer},${index}`, 50) / 100));
      crowns.push({ x: x + pick(`crownx${layer},${index}`, radius) - radius / 2, y: base - pick(`crowny${layer},${index}`, Math.max(1, radius)) + radius * 0.4, r });
    }
    for (let x = 0; x < width; x++) {
      let top = height, owner = crowns[0];
      for (const crown of crowns) {
        const dx = x - crown.x;
        if (Math.abs(dx) > crown.r) continue;
        const y = crown.y - Math.sqrt(crown.r * crown.r - dx * dx);
        if (y < top) { top = y; owner = crown; }
      }
      for (let y = Math.max(0, Math.round(top)); y < height; y++) {
        const fromTop = y - top;
        // lit on the Sun's side of each crown, shaded on the other, leafy speckles all over
        const side = (x - owner.x) / owner.r;
        const speckle = pick(`leaf${layer},${x},${y}`, 9);
        let paint = side > 0.35 && fromTop > 2 && y < owner.y + owner.r * 0.6 ? shade : colour;
        if (fromTop < 2 + (side > 0 ? 1 : 0) && day > 0.2) paint = rim;
        if (speckle === 0) paint = mix(paint, rim, 0.6);
        if (speckle === 1) paint = shade;
        context.fillStyle = css(paint);
        context.fillRect(x, y, 1, 1);
      }
    }
  }
}

/** The page behind the treehouse at the hour. */
export function paintForestSky(context: Context, width: number, height: number, lighting: Lighting) {
  for (let y = 0; y < height; y += 3) {
    context.fillStyle = css(skyAt(y + 1, height, lighting));
    context.fillRect(0, y, width, 3);
  }
  const day = dayOf(lighting);
  if (day > 0.05) {
    paintBeams(context, width, height, day);
    paintSun(context, width, height, lighting);
  }
  if (lighting.stars > 0.05) paintNight(context, width, height, lighting);
  paintFarTrunks(context, width, height, lighting);
  paintTreetops(context, width, height, lighting);
  paintOverhang(context, width, height, lighting);
}

/** What moves: leaves tumbling down, motes of dust in the sun by day, fireflies blinking over the treetops at night. */
export function paintForestSkyMotion(context: Context, width: number, height: number, seconds: number, lighting: Lighting) {
  context.clearRect(0, 0, width, height);
  const day = dayOf(lighting);
  const leaves = Math.round(width / 28);
  for (let index = 0; index < leaves; index++) {
    const speed = 4 + pick(`fallspeed${index}`, 5);
    const y = Math.round((pick(`fally${index}`, height) + seconds * speed) % (height + 10)) - 5;
    const x = Math.round((pick(`fallx${index}`, width) + seconds * 2 + Math.sin(seconds * 0.9 + index) * 7) % (width + 10)) - 5;
    const colour = css(mix(rgb(F.canopyNight[0]), rgb(F.autumn[index % F.autumn.length]), 0.25 + day * 0.75));
    const flat = Math.sin(seconds * 2.2 + index * 1.7) > 0;
    context.fillStyle = colour;
    context.globalAlpha = 0.95;
    context.fillRect(x, y, flat ? 2 : 1, flat ? 1 : 2);
  }
  if (day > 0.2) {
    context.fillStyle = F.sunGlow;
    for (let index = 0; index < Math.round(width / 20); index++) {
      const x = Math.round(pick(`motex${index}`, width) + Math.sin(seconds * 0.3 + index) * 10);
      const y = Math.round(pick(`motey${index}`, Math.round(height * 0.7)) + Math.cos(seconds * 0.25 + index * 2) * 6);
      context.globalAlpha = day * 0.5 * (0.5 + 0.5 * Math.sin(seconds * 1.1 + index));
      context.fillRect(x, y, 1, 1);
    }
  }
  if (lighting.stars > 0.2) {
    for (let index = 0; index < Math.round(width / 12); index++) {
      const x = Math.round(pick(`flyx${index}`, width) + Math.sin(seconds * 0.35 + index) * 14);
      const y = Math.round(height * 0.45 + pick(`flyy${index}`, Math.round(height * 0.5)) + Math.cos(seconds * 0.27 + index * 2) * 8);
      const blink = Math.max(0, Math.sin(seconds * 1.4 + index * 2.3));
      context.globalAlpha = lighting.stars * blink;
      dot(context, x, y, F.firefly);
      context.globalAlpha = lighting.stars * blink * 0.3;
      context.fillStyle = F.fireflyGlow;
      context.fillRect(x - 1, y, 3, 1);
      context.fillRect(x, y - 1, 1, 3);
    }
  }
  context.globalAlpha = 1;
}
