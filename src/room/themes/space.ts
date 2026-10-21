// The room dressed as a space shuttle (themes/kit.ts), at art resolution like backdrop.ts: metal panels with rivets and a
// light along the top of the walls, vents and console lights below, floor plates, an airlock for a door, black heat
// tiles and thrusters under the hull, portholes on the Earth, the stars and the Moon, a digital clock; and the page
// behind, deep space with a nebula, a ringed planet, the Earth below and a satellite going by.
import { SPACE_FURNITURE as F, SPACE_PALETTE as S } from '../../design/theme-space.ts';
import { ROOM, type Layout, type WallItem } from '../../../shared/room-layout.ts';
import { ART_SCALE } from '../pixel-art.ts';
import type { Point } from '../geometry.ts';
import { css, mix, rgb, type Lighting, type Rgb } from '../lighting.ts';
import { fillPolygon, shadedBall, toArt, tones } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import { WALL_EFFECT, type ThemeKit } from './kit.ts';
import { SPACE_FURNITURE, furnitureLights, furnitureEffects } from './space-furniture.ts';
import { WALL, glyphRows, line, onWall, onWallAt, roomPointOnWall, type Context, type Wall } from '../wall-art.ts';

const WAINSCOT = 12;

function dot(context: Context, point: Point, colour: string, alpha = 1) {
  context.globalAlpha = alpha;
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
  context.globalAlpha = 1;
}

/** The panels of both walls, over their plain colour: seams every two tiles, rivets, the light strip, the vents and the consoles' lights. */
export function paintPanels(context: Context) {
  for (const wall of ['back', 'left'] as const satisfies readonly Wall[]) {
    const length = wall === 'back' ? ROOM.width : ROOM.depth;
    const seam = wall === 'back' ? S.wallStripe : S.wallSideStripe;
    const lit = tones(wall === 'back' ? S.wall : S.wallSide).light;
    for (let along = 2; along < length; along += 2) {
      line(context, onWallAt(wall, along, WAINSCOT + 1), onWallAt(wall, along, WALL - 8), seam);
      line(context, onWallAt(wall, along + 1 / 8, WAINSCOT + 1), onWallAt(wall, along + 1 / 8, WALL - 8), lit);
    }
    line(context, onWallAt(wall, 0, 42), onWallAt(wall, length, 42), seam);
    line(context, onWallAt(wall, 0, 43), onWallAt(wall, length, 43), lit);
    for (let along = 0; along < length; along += 2) for (const z of [WAINSCOT + 3, 40, 45]) {
      dot(context, onWallAt(wall, along + 0.3, z), S.rivet);
      dot(context, onWallAt(wall, along + 1.7, z), S.rivet);
    }
    // the light strip along the top, with its glow
    line(context, onWallAt(wall, 0, WALL - 6), onWallAt(wall, length, WALL - 6), S.ledGlow);
    line(context, onWallAt(wall, 0, WALL - 5), onWallAt(wall, length, WALL - 5), S.led);
    line(context, onWallAt(wall, 0, WALL - 4), onWallAt(wall, length, WALL - 4), S.ledGlow);
    // vents in the lower band, and now and then a console's row of lights
    for (let along = 0.4, index = 0; along + 1 < length; along += 1.5, index++) {
      if (index % 3 === 1) {
        for (let light = 0; light < 4; light++) dot(context, onWallAt(wall, along + 0.1 + light * 0.2, 7), S.consoleLights[pick(`${wall}${index}${light}`, S.consoleLights.length)]);
        continue;
      }
      for (const z of [4, 6, 8]) line(context, onWallAt(wall, along, z), onWallAt(wall, along + 0.8, z), S.wainscotLine);
    }
  }
}

/** The floor in metal plates, a tile each, lit along their back edges, with a grip of raised dots. */
export function paintPlates(context: Context) {
  for (let y = 0; y < ROOM.depth; y++) for (let x = 0; x < ROOM.width; x++) {
    const plate = S.planks[(x + y) % S.planks.length];
    fillPolygon(context, [toArt({ x, y }), toArt({ x: x + 1, y }), toArt({ x: x + 1, y: y + 1 }), toArt({ x, y: y + 1 })], plate);
    line(context, toArt({ x, y }), toArt({ x: x + 1, y }), S.plankLight);
    line(context, toArt({ x, y }), toArt({ x, y: y + 1 }), S.plankLight);
    line(context, toArt({ x: x + 1, y }), toArt({ x: x + 1, y: y + 1 }), S.plankSeam);
    line(context, toArt({ x, y: y + 1 }), toArt({ x: x + 1, y: y + 1 }), S.plankSeam);
    for (const [u, v] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) dot(context, toArt({ x: x + u, y: y + v }), tones(plate).light);
  }
}

/** Where the office has its rugs, darker plates edged with a line of light, a bracket at each corner. */
export function paintZones(context: Context, layout: Layout) {
  for (const rug of layout.rugs) {
    const { x, y, width, depth } = rug;
    const corners = [toArt({ x, y }), toArt({ x: x + width, y }), toArt({ x: x + width, y: y + depth }), toArt({ x, y: y + depth })];
    fillPolygon(context, corners, F.zone);
    for (let along = Math.ceil(x); along < x + width; along++) line(context, toArt({ x: along, y }), toArt({ x: along, y: y + depth }), F.zoneSeam);
    for (let across = Math.ceil(y); across < y + depth; across++) line(context, toArt({ x, y: across }), toArt({ x: x + width, y: across }), F.zoneSeam);
    const edge = F.zoneEdges[rug.colour];
    corners.forEach((corner, index) => {
      const next = corners[(index + 1) % 4];
      const steps = Math.round(Math.hypot(next.x - corner.x, next.y - corner.y));
      for (let step = 0; step <= steps; step++) {
        const share = step / steps;
        const bracket = share < 0.06 || share > 0.94;
        if (bracket || step % 4 < 2) dot(context, { x: corner.x + (next.x - corner.x) * share, y: corner.y + (next.y - corner.y) * share }, bracket ? F.glowPale : edge);
      }
    });
  }
}

/** Where the thrusters under the hull are, in art pixels: found when the slab is painted, their flames flicker every frame (runThrusters). */
const thrusters: Point[] = [];

/** Under the hull's white faces (from `left` to `front` to `right`, their top edge), the black heat tiles and three thrusters on each face. */
export function paintHeatShield(context: Context, left: Point, front: Point, right: Point, height: number) {
  thrusters.length = 0;
  const lift = (point: Point, z: number): Point => ({ x: point.x, y: point.y - z });
  const toward = (from: Point, to: Point, share: number): Point => ({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
  const half = height / 2 + 1;
  fillPolygon(context, [lift(left, -half), lift(front, -half), lift(front, -height), lift(left, -height)], S.heatTile);
  fillPolygon(context, [lift(front, -half), lift(right, -half), lift(right, -height), lift(front, -height)], tones(S.heatTile).shade);
  for (let share = 0.04; share < 1; share += 0.04) {
    line(context, lift(toward(left, front, share), -half), lift(toward(left, front, share), -height), S.slabUnder);
    line(context, lift(toward(front, right, share), -half), lift(toward(front, right, share), -height), S.slabUnder);
  }
  for (const [from, to] of [[left, front], [front, right]] as const) for (const share of [0.25, 0.5, 0.75]) {
    // on the hull's lower edge: the nozzle hangs from it
    const at = lift(toward(from, to, share), -height);
    const x = Math.round(at.x), y = Math.round(at.y) - 1;
    thrusters.push({ x, y });
    context.fillStyle = S.thruster;
    context.fillRect(x - 3, y - 1, 7, 1);
    context.fillRect(x - 2, y, 5, 1);
    context.fillRect(x - 1, y + 1, 3, 1);
  }
}

/** The airlock in the left wall: a frame in hazard stripes around the opening, and its cold light. */
export function paintAirlock(context: Context, from: number, to: number, height: number) {
  for (let column = Math.floor((from - 0.2) * 8); column <= Math.ceil((to + 0.2) * 8); column++) for (let z = 0; z <= height + 2; z++) {
    dot(context, onWallAt('left', column / 8, z), Math.floor((column + z) / 2) % 2 ? S.doorFrame : S.hazard);
  }
  const quad = (fromAlong: number, toAlong: number, low: number, high: number, colour: string) =>
    fillPolygon(context, [onWallAt('left', fromAlong, low), onWallAt('left', toAlong, low), onWallAt('left', toAlong, high), onWallAt('left', fromAlong, high)], colour);
  quad(from, to, 0, height, S.doorway);
  quad(from + 0.1, to - 0.1, 0, 4, tones(S.doorLight).dark);
  line(context, onWallAt('left', from + 0.1, height - 1), onWallAt('left', to - 0.1, height - 1), S.doorLight);
}

/* The portholes */

export type View = 'earth' | 'stars' | 'moon';
const PORTHOLE = { z: 27, glass: 8, rim: 9, frame: 10.4 };

/** What a porthole shows at a pixel of its window (gx across the whole window, gz up from the portholes' middle). */
function outside(view: View, gx: number, gz: number, width: number, lighting: Lighting, seed: number): string {
  const sky = mix(rgb(S.spaceTop), rgb(S.spaceBottom), (PORTHOLE.glass - gz) / (PORTHOLE.glass * 2));
  if (view === 'earth') {
    const radius = 38;
    const distance = Math.hypot(gx - width * 0.45, gz + 40);
    if (distance <= radius) return css(earthAt(gx, gz, lighting, 5));
    if (distance <= radius + 1.6) return css(mix(sky, rgb(S.atmosphere), (1 - lighting.stars * 0.6) * (1 - (distance - radius) / 1.6)));
  }
  if (view === 'moon') {
    const center = { x: width * 0.66, z: 2 };
    const distance = Math.hypot(gx - center.x, gz - center.z);
    if (distance <= 4.5) {
      const crater = pick(`crater${Math.round(gx / 2)},${Math.round(gz / 2)}`, 5) === 0;
      return crater ? S.crater : gx - center.x + gz - center.z > 3 ? tones(S.moon).shade : S.moon;
    }
  }
  if (pick(`star${seed},${gx},${gz}`, 19) === 0) return css(mix(sky, rgb(S.starTints[pick(`tint${gx}`, S.starTints.length)]), 0.5 + pick(`b${gx},${gz}`, 50) / 100));
  return css(sky);
}

/** Smooth noise from 0 to 1: random values on a grid of `size` pixels, blended between them. */
function noise(key: string, x: number, y: number, size: number): number {
  const gx = Math.floor(x / size), gy = Math.floor(y / size), fx = x / size - gx, fy = y / size - gy;
  const at = (i: number, j: number) => pick(`${key}${gx + i},${gy + j}`, 1000) / 1000;
  const ease = (t: number) => t * t * (3 - 2 * t);
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * ease(fx), bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * ease(fx);
  return top + (bottom - top) * ease(fy);
}

/** A pixel of the Earth (`size`: how big its continents are): seas, land and clouds by day, dark with the cities lit by night. */
function earthAt(gx: number, gz: number, lighting: Lighting, size = 6): Rgb {
  const relief = noise('land', gx, gz, size * 2) * 0.65 + noise('coast', gx, gz, size / 2) * 0.35;
  const land = relief > 0.56;
  const cloud = noise('cloud', gx * 0.7, gz * 1.6, size) > 0.68;
  const day = cloud ? rgb(S.cloud) : rgb(land ? (relief > 0.68 ? S.landHigh : S.land) : relief < 0.36 ? S.oceanDeep : S.ocean);
  const night = land && pick(`city${gx},${gz}`, 5) === 0 ? rgb(S.cityLights) : rgb(land ? S.landNight : S.oceanNight);
  return mix(day, night, Math.min(1, lighting.stars * 1.15));
}

/** A window of the back wall as a row of round portholes, their metal frame lit from the top left and bolted. */
export function paintPortholes(context: Context, item: WallItem, lighting: Lighting, view: View) {
  const count = Math.max(1, Math.round(item.width / 2.3));
  const spacing = item.width / count;
  const widthPixels = item.width * 8;
  for (let index = 0; index < count; index++) {
    const center = item.fromX + spacing * (index + 0.5);
    const reach = Math.ceil(PORTHOLE.frame);
    for (let up = -reach; up <= reach; up++) for (let across = -reach; across <= reach; across++) {
      const distance = Math.hypot(across, up);
      if (distance > PORTHOLE.frame) continue;
      const at = onWallAt('back', center + across / 8, PORTHOLE.z + up);
      if (distance > PORTHOLE.rim) {
        const toward = (-across * 0.6 + up * 0.6) / distance;
        dot(context, at, toward > 0.45 ? tones(S.windowFrame).light : toward < -0.45 ? tones(S.windowFrame).shade : S.windowFrame);
      } else if (distance > PORTHOLE.glass) dot(context, at, S.windowSill);
      else dot(context, at, outside(view, (center - item.fromX) * 8 + across, up, widthPixels, lighting, item.fromX));
    }
    for (let bolt = 0; bolt < 8; bolt++) {
      const angle = (bolt / 8) * Math.PI * 2 + Math.PI / 8;
      dot(context, onWallAt('back', center + (Math.cos(angle) * 9.7) / 8, PORTHOLE.z + Math.sin(angle) * 9.7), tones(S.windowFrame).dark);
    }
    for (let step = 0; step < 4; step++) dot(context, onWallAt('back', center + (-5 + step) / 8, PORTHOLE.z + 2 + step), S.glassShine, 0.35);
  }
}

/** The clock as a screen on the back wall, the hour in cyan digits. */
export function paintDigitalClock(context: Context, item: WallItem, hour: number) {
  const center = item.fromX + item.width / 2;
  const quad = (from: number, to: number, low: number, high: number, colour: string) =>
    fillPolygon(context, [onWallAt('back', from, low), onWallAt('back', to, low), onWallAt('back', to, high), onWallAt('back', from, high)], colour);
  quad(center - 1.4, center + 1.4, 24, 35, S.tvFrame);
  quad(center - 1.28, center + 1.28, 25, 34, S.clock);
  const hours = Math.floor(hour) % 24, minutes = Math.floor((hour % 1) * 60);
  const two = (value: number) => String(value).padStart(2, '0');
  const left = glyphRows(two(hours)), right = glyphRows(two(minutes)), colon = ['.', '#', '.', '#', '.'];
  const rows = left.map((row, index) => `${row}.${colon[index]}.${right[index]}`);
  onWall(context, rows, { '#': S.clockHands }, 'back', center - rows[0].length / 16, 27);
}

/** The lounge's screen as the bridge's: a navigation display, a planet in its orbits, a ship on its course, gauges. */
export function paintBridgeScreen(context: Context, item: WallItem) {
  const from = item.fromX, to = item.fromX + item.width;
  const quad = (fromAlong: number, toAlong: number, low: number, high: number, colour: string) =>
    fillPolygon(context, [onWallAt('back', fromAlong, low), onWallAt('back', toAlong, low), onWallAt('back', toAlong, high), onWallAt('back', fromAlong, high)], colour);
  quad(from - 0.15, to + 0.15, 14, 40, F.hullShade);
  quad(from - 0.1, to + 0.1, 15, 39, F.hull);
  quad(from + 0.05, to - 0.05, 17, 37, F.screen);
  for (let z = 19; z < 37; z += 4) line(context, onWallAt('back', from + 0.1, z), onWallAt('back', to - 0.1, z), F.screenGrid);
  for (let along = from + 0.5; along < to - 0.1; along += 0.5) line(context, onWallAt('back', along, 18), onWallAt('back', along, 36), F.screenGrid);
  // the planet and its orbits on the left, the ship's course across them
  const planet = from + 1.3;
  for (let up = -4; up <= 4; up++) for (let across = -4; across <= 4; across++) {
    if (across * across + up * up <= 17) dot(context, onWallAt('back', planet + across / 8, 27 + up), across + up > 2 ? tones(F.screenPlanet).shade : F.screenPlanet);
  }
  for (const radius of [7, 10]) for (let step = 0; step < 48; step++) {
    const angle = (step / 48) * Math.PI * 2;
    if (step % 2) dot(context, onWallAt('back', planet + (Math.cos(angle) * radius) / 8, 27 + Math.sin(angle) * radius * 0.45), F.screenTrace);
  }
  for (let step = 0; step < 18; step++) if (step % 3 < 2) dot(context, onWallAt('back', planet + (10 + step * 1.2) / 8, 31 - step * 0.35), F.screenAlert);
  onWall(context, ['.#.', '###', '#.#'], { '#': F.glowPale }, 'back', planet + 31 / 8, 23);
  // gauges on the right, and the screen's title
  for (let bar = 0; bar < 5; bar++) {
    const along = to - 1.3 + bar * 0.2;
    const height = 4 + pick(`gauge${bar}`, 9);
    for (let z = 19; z < 19 + height; z++) dot(context, onWallAt('back', along, z), bar === 3 ? F.screenAlert : F.screenTrace);
    dot(context, onWallAt('back', along + 1 / 8, 19), F.screenTrace);
  }
  onWall(context, glyphRows('NAV'), { '#': F.glowPale }, 'back', to - 1.35, 31);
  dot(context, onWallAt('back', to - 0.3, 35), S.beacon);
}

/** The light running along the top of the walls, a bright spot going round now and then. */
function runLights(context: Context, time: number) {
  const lap = ROOM.depth + ROOM.width + 6;
  const head = ((time / 90) % lap) - 3;
  for (let tail = 0; tail < 12; tail++) {
    const at = head - tail / 4;
    // along the left wall from the front, then along the back wall from the corner
    const point = at < ROOM.depth ? roomPointOnWall('left', ROOM.depth - at, WALL - 5) : roomPointOnWall('back', at - ROOM.depth, WALL - 5);
    if (at < 0 || at > ROOM.depth + ROOM.width) continue;
    context.globalAlpha = 1 - tail / 12;
    context.fillStyle = F.glowPale;
    context.fillRect(Math.round(point.x / ART_SCALE) * ART_SCALE, Math.round(point.y / ART_SCALE) * ART_SCALE, ART_SCALE, ART_SCALE);
  }
  context.globalAlpha = 1;
}

/** The thrusters' flames under the hull, flickering, bright in the dark. */
function runThrusters(context: Context, time: number) {
  for (const [index, { x, y }] of thrusters.entries()) {
    const length = 3 + pick(`thrust${index},${Math.floor(time / 110)}`, 3);
    // a flame that narrows and fades as it leaves the nozzle
    for (let step = 0; step < length; step++) {
      context.globalAlpha = 0.9 - (step / length) * 0.7;
      context.fillStyle = step < 2 ? S.flameCore : S.flame;
      const half = step < length - 2 ? 1 : 0;
      context.fillRect((x - half) * ART_SCALE, (y + 2 + step) * ART_SCALE, (half * 2 + 1) * ART_SCALE, ART_SCALE);
    }
  }
  context.globalAlpha = 1;
}

/** A sweep across the bridge screen, leaving a fading trail, and its alert light blinking. */
function sweepScreen(context: Context, layout: Layout, time: number) {
  for (const item of layout.wallItems) {
    if (item.kind !== 'tv') continue;
    const from = item.fromX + 0.1, width = item.width - 0.2;
    const share = (time / 4000) % 1;
    for (let trail = 0; trail < 6; trail++) {
      const along = from + Math.max(0, share * width - trail / 8);
      context.globalAlpha = (0.55 - trail * 0.09);
      context.fillStyle = F.screenTrace;
      for (let z = 18; z < 37; z++) {
        const point = roomPointOnWall('back', along, z);
        context.fillRect(Math.round(point.x / ART_SCALE) * ART_SCALE, Math.round(point.y / ART_SCALE) * ART_SCALE, ART_SCALE, ART_SCALE);
      }
    }
    if (Math.floor(time / 600) % 2) {
      const point = roomPointOnWall('back', item.fromX + item.width - 0.3, 35);
      context.globalAlpha = 1;
      context.fillStyle = S.beacon;
      context.fillRect(Math.round(point.x / ART_SCALE) * ART_SCALE, Math.round(point.y / ART_SCALE) * ART_SCALE, ART_SCALE, ART_SCALE);
    }
  }
  context.globalAlpha = 1;
}

/* The page behind the room */

/** Deep space at the room's hour: the stars always out, a nebula, a ringed planet, and the Earth's edge along the bottom, lit by day. */
export function paintDeepSpace(context: Context, width: number, height: number, lighting: Lighting) {
  for (let y = 0; y < height; y += 6) {
    context.fillStyle = css(mix(rgb(S.deepTop), rgb(S.deepBottom), Math.min(1, y / height)));
    context.fillRect(0, y, width, 6);
  }
  paintNebula(context, width, height);
  const count = Math.round((width * height) / 120);
  for (let index = 0; index < count; index++) {
    const x = pick(`space-x${index}`, width), y = pick(`space-y${index}`, height);
    context.fillStyle = S.starTints[pick(`space-t${index}`, S.starTints.length)];
    context.globalAlpha = 0.3 + pick(`space-b${index}`, 70) / 100;
    context.fillRect(x, y, 1, 1);
    if (index % 30 === 0) {
      context.globalAlpha *= 0.5;
      context.fillRect(x - 1, y, 3, 1);
      context.fillRect(x, y - 1, 1, 3);
    }
  }
  context.globalAlpha = 1;
  paintRingedPlanet(context, Math.round(width * 0.84), Math.round(height * 0.18), Math.max(8, Math.round(height * 0.04)));
  paintEarthEdge(context, width, height, lighting);
}

/** Soft clouds of colour, dithered pixel by pixel so they stay pixel art. */
function paintNebula(context: Context, width: number, height: number) {
  const clouds = [
    { x: 0.22, y: 0.3, rx: 0.3, ry: 0.22, colour: S.nebula[0] },
    { x: 0.62, y: 0.52, rx: 0.34, ry: 0.18, colour: S.nebula[1] },
    { x: 0.4, y: 0.12, rx: 0.2, ry: 0.1, colour: S.nebula[2] },
  ];
  for (const cloud of clouds) {
    const cx = cloud.x * width, cy = cloud.y * height, rx = cloud.rx * width, ry = cloud.ry * height;
    context.fillStyle = cloud.colour;
    for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(height, cy + ry); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(width, cx + rx); x++) {
      const distance = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (distance >= 1) continue;
      const density = (1 - distance) ** 1.5;
      if (pick(`neb${x},${y}`, 100) / 100 < density * 0.7) {
        context.globalAlpha = 0.1 + density * 0.2;
        context.fillRect(x, y, 1, 1);
      }
    }
  }
  context.globalAlpha = 1;
}

function paintRingedPlanet(context: Context, x: number, y: number, radius: number) {
  const ring = (front: boolean) => {
    context.fillStyle = S.ring;
    for (let step = 0; step < 360; step++) {
      const angle = (step / 360) * Math.PI * 2;
      const dy = Math.sin(angle) * radius * 0.45;
      if (dy > 0 !== front) continue;
      context.fillRect(Math.round(x + Math.cos(angle) * radius * 2), Math.round(y + dy - Math.cos(angle) * radius * 0.3), 1, 1);
    }
  };
  ring(false);
  const colours = { ...tones(S.planet), shade: S.planetShade };
  shadedBall((px, py, colour) => { context.fillStyle = colour; context.fillRect(px, py, 1, 1); }, x, y, radius, radius, colours);
  ring(true);
}

/** The curve of the Earth along the bottom of the page, under its blue edge of air. */
function paintEarthEdge(context: Context, width: number, height: number, lighting: Lighting) {
  const radius = width * 1.1;
  const cx = width * 0.35, cy = height + radius - height * 0.12;
  for (let y = Math.floor(height * 0.8); y < height; y++) for (let x = 0; x < width; x++) {
    const distance = Math.hypot(x - cx, y - cy);
    if (distance > radius + 3) continue;
    if (distance > radius) {
      context.globalAlpha = (1 - lighting.stars * 0.6) * (1 - (distance - radius) / 3) * 0.8;
      context.fillStyle = S.atmosphere;
    } else context.fillStyle = css(earthAt(x, y, lighting, 14));
    context.fillRect(x, y, 1, 1);
    context.globalAlpha = 1;
  }
}

/** What moves out there, at `seconds`: a satellite going by, its beacon blinking. */
export function paintSpaceDrift(context: Context, width: number, height: number, seconds: number) {
  context.clearRect(0, 0, width, height);
  const x = Math.round(((seconds * 1.5) % (width + 40)) - 20), y = Math.round(height * 0.36 - x * 0.04);
  context.fillStyle = S.satellitePanel;
  context.fillRect(x - 5, y, 4, 2);
  context.fillRect(x + 3, y, 4, 2);
  context.fillStyle = S.satellite;
  context.fillRect(x - 1, y, 1, 1);
  context.fillRect(x + 2, y, 1, 1);
  context.fillRect(x, y - 1, 2, 4);
  if (Math.floor(seconds) % 2 === 0) {
    context.fillStyle = S.beacon;
    context.fillRect(x, y - 2, 1, 1);
  }
}

/** The first window looks down on the Earth, the last one on the Moon, those between on the stars. */
const viewOf = (index: number, count: number): View => (index === 0 ? 'earth' : index === count - 1 ? 'moon' : 'stars');

export const SPACE: ThemeKit = {
  structure: S,
  paintWalls: paintPanels,
  paintFloor(context, layout) { paintPlates(context); paintZones(context, layout); },
  rugs: false,
  paintSlab: paintHeatShield,
  paintDoor: paintAirlock,
  paintWindow: (context, item, lighting, index, count) => paintPortholes(context, item, lighting, viewOf(index, count)),
  paintClock: paintDigitalClock,
  paintTv: paintBridgeScreen,
  paintSky: paintDeepSpace,
  paintSkyMotion: paintSpaceDrift,
  // the portholes are round: a straight shaft from their wall would veil them
  wallBeam: false,
  furniture: SPACE_FURNITURE,
  lights: (layout) => furnitureLights(layout),
  effects: (layout, time, lighting) => [
    { depth: WALL_EFFECT, paint: (context) => { runLights(context, time); sweepScreen(context, layout, time); } },
    { depth: Infinity, paint: (context) => runThrusters(context, time) },
    ...furnitureEffects(layout, time, lighting.glow),
  ],
  screenLight: S.screenLight,
  doorLight: S.doorLight,
};
