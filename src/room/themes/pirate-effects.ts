// What moves on the galleon every frame, in room pixels, after the light of the hour (themes/kit.ts): the lanterns'
// flames, the black flag rippling, the sea foaming along the hull and splashing at the bow, the route sailed on the
// lounge's map; then the furniture's (pirate-furniture.ts). And the lights of the walls' lanterns.
import { PIRATE_FURNITURE as F, PIRATE_PALETTE as P } from '../../design/theme-pirate.ts';
import type { Layout } from '../../../shared/room-layout.ts';
import type { Point } from '../geometry.ts';
import { css, mix, rgb, type Lighting } from '../lighting.ts';
import { ART_SCALE } from '../pixel-art.ts';
import { pick } from '../sky.ts';
import { roomPointOnWall, type Context } from '../wall-art.ts';
import { WALL_EFFECT, type ThemeEffect, type ThemeLight } from './kit.ts';
import { furnitureDepth } from '../pixel-furniture.ts';
import { FLAG, FLAG_COLOURS, FLAG_ROWS, LANTERNS, MAP, mapRoute } from './pirate-art.ts';
import { flicker, glowAround, litBy, paintPieceEffects, pirateFurnitureLights } from './pirate-furniture.ts';

/** An art pixel at a room point, on the art grid. */
function dot(context: Context, point: Point, colour: string, alpha = 1) {
  if (alpha <= 0.01) return;
  context.globalAlpha = Math.min(1, alpha);
  context.fillStyle = colour;
  context.fillRect(Math.round(point.x / ART_SCALE) * ART_SCALE, Math.round(point.y / ART_SCALE) * ART_SCALE, ART_SCALE, ART_SCALE);
}

/** The bottom edge of the hull, in art pixels: found when the slab is painted, the sea foams along it every frame. */
const hull: Point[] = [];
export function rememberHull(left: Point, front: Point, right: Point) {
  hull.length = 0;
  hull.push(left, front, right);
}

/** A lantern on the wall: its flame flickering, a warm glow around its glass, brighter at night. */
function flickerLantern(context: Context, { wall, along, z }: (typeof LANTERNS)[number], index: number, time: number, glow: number) {
  {
    const shine = flicker(index * 7, time);
    glowAround(context, roomPointOnWall(wall, along, z + 3), 8, F.halo, (0.1 + glow * 0.35) * shine);
    dot(context, roomPointOnWall(wall, along, z + 2), P.flameCore, 0.55 + shine * 0.45);
    dot(context, roomPointOnWall(wall, along, z + 3), P.flame, shine * 0.7);
  }
}

/**
 * The flag, nailed at its top, drawn again with each column hanging a little lower as a wave runs along it, the bottom
 * the most, and a shade on the slope of each fold. In the light of the hour, so it does not glow at night.
 */
function rippleFlag(context: Context, time: number, lighting: Lighting) {
  const half = Math.floor(FLAG.columns / 2);
  const colours = Object.fromEntries(Object.entries(FLAG_COLOURS).map(([letter, colour]) => [letter, litBy(colour, lighting, LANTERN_NEARBY)]));
  const shade = litBy(P.flagShade, lighting, LANTERN_NEARBY);
  for (let column = 0; column < FLAG.columns; column++) {
    const wave = Math.sin(time / 380 - column * 0.55);
    const slope = Math.cos(time / 380 - column * 0.55);
    const along = FLAG.along + (half - column) / 8;
    FLAG_ROWS.forEach((row, line) => {
      const letter = row[column];
      if (!colours[letter]) return;
      const sag = Math.round(((wave + 1) / 2) * 2 * (line / FLAG_ROWS.length));
      const colour = letter === 'f' && slope > 0.55 ? shade : colours[letter];
      dot(context, roomPointOnWall('left', along, FLAG.top - line - sag), colour);
    });
  }
}

/** The lantern by the door lights the flag a little at night. */
const LANTERN_NEARBY = 0.35;

/** The sea along the hull's foot: foam rolling along both sides, a splash thrown up at the bow now and then, glints. */
function foamAlongHull(context: Context, time: number, lighting: Lighting) {
  if (hull.length < 3) return;
  const foam = css(mix(rgb(P.foam), rgb(P.foamNight), lighting.stars));
  const sea = css(mix(rgb(P.seaDay), rgb(P.seaNight), lighting.stars));
  const [left, front, right] = hull;
  for (const [from, to] of [[left, front], [front, right]] as const) {
    const steps = Math.round(Math.abs(to.x - from.x));
    for (let step = 0; step <= steps; step++) {
      const share = step / steps;
      const x = (from.x + (to.x - from.x) * share) * ART_SCALE, y = (from.y + (to.y - from.y) * share) * ART_SCALE;
      const roll = Math.sin(time / 500 + step * 0.4) + Math.sin(time / 830 - step * 0.23);
      // the sea laps over the bottom of the hull, foam on its crest
      const crest = -1 - Math.round(roll * 0.8);
      for (let below = crest + 1; below <= 7; below++) dot(context, { x, y: y + below * ART_SCALE }, sea, below < 2 ? 0.75 : 0.95);
      dot(context, { x, y: y + crest * ART_SCALE }, foam, 0.6 + roll * 0.15);
      if (pick(`seaglint${step},${Math.floor(time / 400)}`, 23) === 0) dot(context, { x, y: y + 3 * ART_SCALE }, P.glint, 0.7 * (1 - lighting.stars * 0.5));
    }
  }
  // the bow cuts through the waves: drops thrown up and falling back
  const splash = (time / 1400) % 1;
  for (let drop = 0; drop < 6; drop++) {
    const spread = (drop - 2.5) * 1.3;
    const rise = Math.sin(splash * Math.PI) * (5 + (drop % 3) * 2);
    dot(context, { x: (front.x + spread * splash * 2) * ART_SCALE, y: (front.y - 1 - rise) * ART_SCALE }, foam, 0.8 * (1 - splash * 0.6));
  }
}

/** The lounge's map: dashes marching along the route, a little ship sailing on it, the cross pulsing at its end. */
function sailTheMap(context: Context, layout: Layout, time: number) {
  for (const item of layout.wallItems) {
    if (item.kind !== 'tv') continue;
    const width = item.width * 8, height = MAP.high - MAP.low;
    const route = mapRoute(width, height);
    const at = (point: Point) => roomPointOnWall('back', item.fromX + point.x / 8, MAP.low + point.y);
    const march = Math.floor(time / 250) % 3;
    route.forEach((point, index) => { if ((index + march) % 3 === 0 && index < route.length - 2) dot(context, at(point), P.ink, 0.75); });
    const share = (time / 16000) % 1;
    const ship = route[Math.min(route.length - 1, Math.floor(share * (route.length - 1)))];
    const centre = at(ship);
    for (const [across, up, colour] of [[-1, 0, P.hullFar], [0, 0, P.hullFar], [1, 0, P.hullFar], [0, 1, P.sail], [0, 2, P.sail], [1, 1, P.sail]] as const) {
      dot(context, { x: centre.x + across * ART_SCALE, y: centre.y - up * ART_SCALE }, colour);
    }
    const end = route[route.length - 1];
    const pulse = 0.55 + 0.45 * Math.sin(time / 300);
    for (const [across, up] of [[-1, -1], [1, 1], [0, 0], [-1, 1], [1, -1]] as const) dot(context, at({ x: end.x + across, y: end.y + up }), P.cross, pulse);
    glowAround(context, at(end), 4, P.cross, 0.2 * pulse);
  }
}

/** Each effect with the depth it sits at: the wall's behind everyone, the sea below the slab over everything, the furniture's with their piece. */
export function pirateEffects(layout: Layout, time: number, lighting: Lighting): ThemeEffect[] {
  const reset = (paint: (context: Context) => void) => (context: Context) => { paint(context); context.globalAlpha = 1; };
  return [
    ...LANTERNS.map((lantern, index) => ({ depth: WALL_EFFECT, paint: reset((context) => flickerLantern(context, lantern, index, time, lighting.glow)) })),
    { depth: WALL_EFFECT, paint: reset((context) => rippleFlag(context, time, lighting)) },
    { depth: WALL_EFFECT, paint: reset((context) => sailTheMap(context, layout, time)) },
    { depth: Infinity, paint: reset((context) => foamAlongHull(context, time, lighting)) },
    ...layout.furniture.map((piece) => ({ depth: furnitureDepth(piece), paint: reset((context) => paintPieceEffects(context, piece, time, lighting)) })),
  ];
}

/** The lanterns on the walls, the moon on the sea through the stern windows, the map's lamp, and the furniture's lights. */
export function pirateLights(layout: Layout, lighting: Lighting): ThemeLight[] {
  const lights: ThemeLight[] = LANTERNS.map(({ wall, along, z }) => ({
    x: wall === 'back' ? along : 0.4, y: wall === 'back' ? 0.4 : along, height: (z + 3) * ART_SCALE, radius: 110, colour: F.lightLantern, strength: 0.85,
  }));
  for (const item of layout.wallItems) {
    if (item.kind === 'window') lights.push({ x: item.fromX + item.width / 2, y: 0.4, height: 60, radius: 110, colour: P.moonPath, strength: 0.25 * lighting.stars });
    if (item.kind === 'tv') lights.push({ x: item.fromX + item.width / 2, y: 0.6, height: 60, radius: 120, colour: F.lightLantern, strength: 0.5 });
  }
  return [...lights, ...pirateFurnitureLights(layout)];
}
