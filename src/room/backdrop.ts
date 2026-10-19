// The parts of the room that do not move, in pixel art: the plank floor and its rugs, the panelled walls, the door,
// and what hangs on the back wall (the windows on the city and the clock), which follows the hour.
import { ROOM_PALETTE } from '../design/room-palette.ts';
import type { Festival } from '../../shared/festivals.ts';
import { ROOM, type Layout, type WallItem } from '../../shared/room-layout.ts';
import { paintFestivalFloor, paintFestivalWalls, paintTvPicture, type Room } from './festivals.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH, DOOR_SIZE, WALL_HEIGHT } from './geometry.ts';
import { css, mix, type Lighting } from './lighting.ts';
import { ART_SCALE, artCanvas, fillPolygon, shadedBall, toArt, tones } from './pixel-art.ts';
import { hash } from './sprites.ts';
import type { Point } from './geometry.ts';

const C = ROOM_PALETTE.room;
const ART = { width: CANVAS_WIDTH / ART_SCALE, height: CANVAS_HEIGHT / ART_SCALE };
const WALL = WALL_HEIGHT / ART_SCALE;
/** How far the walls reach out past the floor, in tiles: their top and their two cut ends show it. */
const WALL_DEPTH = 0.35;
const WAINSCOT = 12;
const FLOOR_THICKNESS = 4;
/** The stone slab under the floor, in art pixels: its height, then the step of its underside. */
const SLAB = 6;
const UNDERSIDE = 2;
/** The glass of the windows, in art pixels above the floor. */
export const WINDOW_GLASS = { low: 16, high: 38 };

type Context = CanvasRenderingContext2D;
const lift = (point: Point, z: number): Point => ({ x: point.x, y: point.y - z });
const shift = (point: Point, by: Point): Point => ({ x: point.x + by.x, y: point.y + by.y });
/** From a point of the room to the same point past the left wall, and past the back wall. */
const outLeft = (point: Point) => shift(point, { x: toArt({ x: -WALL_DEPTH, y: 0 }).x - toArt({ x: 0, y: 0 }).x, y: toArt({ x: -WALL_DEPTH, y: 0 }).y - toArt({ x: 0, y: 0 }).y });
const outBack = (point: Point) => shift(point, { x: toArt({ x: 0, y: -WALL_DEPTH }).x - toArt({ x: 0, y: 0 }).x, y: toArt({ x: 0, y: -WALL_DEPTH }).y - toArt({ x: 0, y: 0 }).y });
/** A point on the back wall (y = 0): `x` in tiles along it, `z` in art pixels above the floor. */
const onBackWall = (x: number, z: number) => lift(toArt({ x, y: 0 }), z);
/** A point on the left wall (x = 0). */
const onLeftWall = (y: number, z: number) => lift(toArt({ x: 0, y }), z);
const backQuad = (context: Context, fromX: number, toX: number, fromZ: number, toZ: number, colour: string) =>
  fillPolygon(context, [onBackWall(fromX, fromZ), onBackWall(toX, fromZ), onBackWall(toX, toZ), onBackWall(fromX, toZ)], colour);
const leftQuad = (context: Context, fromY: number, toY: number, fromZ: number, toZ: number, colour: string) =>
  fillPolygon(context, [onLeftWall(fromY, fromZ), onLeftWall(toY, fromZ), onLeftWall(toY, toZ), onLeftWall(fromY, toZ)], colour);
const floorQuad = (context: Context, x: number, y: number, width: number, depth: number, colour: string) =>
  fillPolygon(context, [toArt({ x, y }), toArt({ x: x + width, y }), toArt({ x: x + width, y: y + depth }), toArt({ x, y: y + depth })], colour);

/** A one-pixel line between two art points (the walls and planks only have slopes of 1/2, so it steps along x). */
function line(context: Context, from: Point, to: Point, colour: string) {
  context.fillStyle = colour;
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let step = 0; step <= steps; step++) {
    const t = steps ? step / steps : 0;
    context.fillRect(Math.round(from.x + (to.x - from.x) * t), Math.round(from.y + (to.y - from.y) * t), 1, 1);
  }
}

function paintFloor(context: Context, layout: Layout) {
  const front = toArt({ x: ROOM.width, y: ROOM.depth });
  const left = toArt({ x: 0, y: ROOM.depth });
  const right = toArt({ x: ROOM.width, y: 0 });
  fillPolygon(context, [left, front, lift(front, -FLOOR_THICKNESS), lift(left, -FLOOR_THICKNESS)], C.floorEdge);
  fillPolygon(context, [front, right, lift(right, -FLOOR_THICKNESS), lift(front, -FLOOR_THICKNESS)], C.floorEdgeDark);
  fillPolygon(context, [outLeft(left), left, lift(left, -FLOOR_THICKNESS), lift(outLeft(left), -FLOOR_THICKNESS)], C.floorEdge);
  fillPolygon(context, [right, outBack(right), lift(outBack(right), -FLOOR_THICKNESS), lift(right, -FLOOR_THICKNESS)], C.floorEdgeDark);
  paintSlab(context, lift(outLeft(left), -FLOOR_THICKNESS), lift(front, -FLOOR_THICKNESS), lift(outBack(right), -FLOOR_THICKNESS));
  // planks along x, two per tile, their joints staggered
  for (let y = 0; y < ROOM.depth * 2; y++) {
    const row = y / 2;
    let x = -((y * 7) % 3) * 0.5;
    while (x < ROOM.width) {
      const length = 1.5 + (hash(`${x},${y}`) % 3) * 0.5;
      const from = Math.max(0, x), to = Math.min(ROOM.width, x + length);
      floorQuad(context, from, row, to - from, 0.5, C.planks[hash(`${y}:${x}`) % C.planks.length]);
      line(context, toArt({ x: from, y: row }), toArt({ x: to, y: row }), C.plankLight);
      if (to < ROOM.width) line(context, toArt({ x: to, y: row }), toArt({ x: to, y: row + 0.5 }), C.plankSeam);
      x += length;
    }
  }
  for (const rug of layout.rugs) {
    const colours = tones(C.rugs[rug.colour]);
    floorQuad(context, rug.x, rug.y, rug.width, rug.depth, colours.dark);
    floorQuad(context, rug.x + 0.12, rug.y + 0.12, rug.width - 0.24, rug.depth - 0.24, colours.base);
    floorQuad(context, rug.x + 0.45, rug.y + 0.45, rug.width - 0.9, rug.depth - 0.9, colours.shade);
    floorQuad(context, rug.x + 0.55, rug.y + 0.55, rug.width - 1.1, rug.depth - 1.1, colours.base);
  }
}

/** The room stands on a slab of stone floating in the sky: two faces under the floor's edge, then a narrower step below. */
function paintSlab(context: Context, left: Point, front: Point, right: Point) {
  const toward = (from: Point, to: Point, share: number): Point => ({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
  const faces = (l: Point, f: Point, r: Point, height: number, light: string, dark: string) => {
    fillPolygon(context, [l, f, lift(f, -height), lift(l, -height)], light);
    fillPolygon(context, [f, r, lift(r, -height), lift(f, -height)], dark);
  };
  faces(left, front, right, SLAB, C.slab, C.slabDark);
  line(context, left, front, C.slabLight);
  line(context, front, right, C.slabLight);
  line(context, lift(left, -SLAB / 2), lift(front, -SLAB / 2), C.slabSeam);
  line(context, lift(front, -SLAB / 2), lift(right, -SLAB / 2), C.slabSeam);
  const under = (point: Point) => lift(toward(point, front, 0.06), -SLAB);
  faces(under(left), lift(front, -SLAB), under(right), UNDERSIDE, C.slabUnder, C.slabUnder);
}

function paintWalls(context: Context) {
  // the back wall (y = 0) faces the light, the left wall is a little darker
  backQuad(context, 0, ROOM.width, 0, WALL, C.wall);
  leftQuad(context, 0, ROOM.depth, 0, WALL, C.wallSide);
  for (let x = 0.25; x < ROOM.width; x += 0.5) line(context, onBackWall(x, WAINSCOT + 1), onBackWall(x, WALL), C.wallStripe);
  for (let y = 0.25; y < ROOM.depth; y += 0.5) line(context, onLeftWall(y, WAINSCOT + 1), onLeftWall(y, WALL), C.wallSideStripe);
  backQuad(context, 0, ROOM.width, 0, WAINSCOT, C.wainscot);
  leftQuad(context, 0, ROOM.depth, 0, WAINSCOT, C.wainscotSide);
  for (let x = 1; x < ROOM.width; x++) line(context, onBackWall(x, 2), onBackWall(x, WAINSCOT - 1), C.wainscotLine);
  for (let y = 1; y < ROOM.depth; y++) line(context, onLeftWall(y, 2), onLeftWall(y, WAINSCOT - 1), C.wainscotLine);
  backQuad(context, 0, ROOM.width, WAINSCOT, WAINSCOT + 1, C.rail);
  leftQuad(context, 0, ROOM.depth, WAINSCOT, WAINSCOT + 1, C.rail);
  backQuad(context, 0, ROOM.width, 0, 2, C.baseboard);
  leftQuad(context, 0, ROOM.depth, 0, 2, C.baseboard);
  // the walls are solid: their top shows their thickness, and so does each cut end, at the front of the room
  const top = (point: Point) => lift(point, WALL);
  const far = toArt({ x: 0, y: 0 }), right = toArt({ x: ROOM.width, y: 0 }), left = toArt({ x: 0, y: ROOM.depth });
  fillPolygon(context, [left, outLeft(left), top(outLeft(left)), top(left)], C.wallEnd);
  fillPolygon(context, [right, outBack(right), top(outBack(right)), top(right)], C.wallEnd);
  fillPolygon(context, [top(far), top(right), top(outBack(right)), top(outBack(far))], C.wallTop);
  fillPolygon(context, [top(left), top(far), top(outLeft(far)), top(outLeft(left))], C.wallTopSide);
  fillPolygon(context, [top(far), top(outBack(far)), top(outBack(outLeft(far))), top(outLeft(far))], C.wallTop);
  line(context, top(outLeft(left)), top(left), C.wallTopEdge);
  line(context, top(right), top(outBack(right)), C.wallTopEdge);
  line(context, far, top(far), C.wallStripe);
}

function paintDoor(context: Context, layout: Layout) {
  const DOOR = { from: layout.door.y, to: layout.door.y + DOOR_SIZE.width, height: DOOR_SIZE.height / ART_SCALE };
  leftQuad(context, DOOR.from - 0.15, DOOR.to + 0.15, 0, DOOR.height + 2, C.doorFrame);
  leftQuad(context, DOOR.from, DOOR.to, 0, DOOR.height, C.doorway);
  // the corridor's light on the doorway's floor; no door leaf, so the outline drawn on hover (draw.ts) fits the opening
  leftQuad(context, DOOR.from + 0.1, DOOR.to - 0.1, 0, 4, tones(C.doorLight).dark);
}

/** The floor, the rugs, the walls (dressed for the festival, if any) and the door, painted once at art resolution. */
export function paintBackdrop(layout: Layout, festival: Festival | null, room: Room, guests: readonly string[] = []): HTMLCanvasElement {
  const { canvas, context } = artCanvas(ART.width, ART.height);
  paintWalls(context);
  if (festival) paintFestivalWalls(context, festival, room, guests);
  paintFloor(context, layout);
  if (festival) paintFestivalFloor(context, festival);
  paintDoor(context, layout);
  return canvas;
}

/* What hangs on the back wall, painted again when the hour changes */

function paintWindow(context: Context, item: WallItem, lighting: Lighting) {
  const from = item.fromX, to = item.fromX + item.width;
  const { low, high } = WINDOW_GLASS;
  const bands = 6;
  for (let band = 0; band < bands; band++) {
    const z0 = high - (high - low) * band / bands, z1 = high - (high - low) * (band + 1) / bands;
    backQuad(context, from, to, z1, z0, css(mix(lighting.skyTop, lighting.skyBottom, band / (bands - 1))));
  }
  if (lighting.stars > 0.05) {
    context.globalAlpha = lighting.stars;
    for (let star = 0; star < 10; star++) {
      const point = onBackWall(from + ((hash(`star${item.fromX}${star}`) % 100) / 100) * item.width, high - 2 - (hash(`z${star}`) % 7));
      context.fillStyle = ROOM_PALETTE.star;
      context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
    }
    context.globalAlpha = 1;
  }
  // the city: two rows of buildings, their windows lit at night
  for (const [layer, colour] of [[0, C.cityFar], [1, C.city]] as const) {
    let x = from;
    let index = 0;
    while (x < to) {
      const seed = hash(`${item.fromX}:${layer}:${index++}`);
      const width = Math.min(to - x, 0.35 + (seed % 5) * 0.12);
      const height = (layer ? 3 : 7) + (seed % (layer ? 9 : 10));
      backQuad(context, x, x + width, low, low + height, colour);
      if (lighting.stars > 0.2) {
        for (let wx = x + 0.08; wx < x + width - 0.06; wx += 0.17) for (let wz = low + 2; wz < low + height - 1; wz += 3) {
          if (hash(`${wx.toFixed(2)}${wz}${layer}`) % 100 < 26) {
            const point = onBackWall(wx, wz);
            context.fillStyle = C.cityLit;
            context.fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
          }
        }
      }
      x += width;
    }
  }
  // the frame: around the glass, a bar down the middle, and the sill
  const bar = (fromBar: number, toBar: number, z0: number, z1: number) => backQuad(context, fromBar, toBar, z0, z1, C.windowFrame);
  bar(from - 0.12, to + 0.12, high, high + 2);
  bar(from - 0.12, to + 0.12, low - 2, low);
  bar(from - 0.12, from, low, high);
  bar(to, to + 0.12, low, high);
  bar((from + to) / 2 - 0.06, (from + to) / 2 + 0.06, low, high);
  backQuad(context, from - 0.2, to + 0.2, low - 3, low - 2, C.windowSill);
}

/** A flat screen on the back wall of the break room, showing a calm blue picture, or the festival's. */
function paintTv(context: Context, item: WallItem, festival: Festival | null, guests: readonly string[]) {
  const from = item.fromX, to = item.fromX + item.width;
  backQuad(context, from, to, 16, 38, C.tvFrame);
  backQuad(context, from + 0.12, to - 0.12, 18, 36, C.tvScreen);
  if (festival) paintTvPicture(context, festival, from, to, guests);
  else backQuad(context, from + 0.4, to - 1.6, 30, 33, tones(C.tvScreen).light);
  backQuad(context, (from + to) / 2 - 0.3, (from + to) / 2 + 0.3, 14, 16, C.tvFrame);
}

function paintClock(context: Context, item: WallItem, hour: number) {
  const center = onBackWall(item.fromX + item.width / 2, 32);
  shadedBall((x, y, colour) => { context.fillStyle = colour; context.fillRect(x, y, 1, 1); }, center.x, center.y, 3.6, 3.8, tones(C.clock));
  const hand = (turns: number, length: number) => line(context, center, { x: center.x + Math.sin(turns * Math.PI * 2) * length, y: center.y - Math.cos(turns * Math.PI * 2) * length }, C.clockHands);
  hand((hour % 12) / 12, 2);
  hand(hour % 1, 3);
}

/** The windows (with the sky and the city of the hour), the clock and the TV. */
export function paintWallItems(layout: Layout, lighting: Lighting, hour: number, festival: Festival | null, guests: readonly string[] = []): HTMLCanvasElement {
  const { canvas, context } = artCanvas(ART.width, ART.height);
  for (const item of layout.wallItems) {
    if (item.kind === 'tv') paintTv(context, item, festival, guests);
    if (item.kind === 'window') paintWindow(context, item, lighting);
    if (item.kind === 'clock') paintClock(context, item, hour);
  }
  return canvas;
}
