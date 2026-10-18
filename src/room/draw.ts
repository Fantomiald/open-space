// Paints the room on the canvas: the pixel art backdrop and what hangs on the walls, the sun through the windows,
// the furniture and the people in depth order, then the light of the hour (a light map multiplied over everything,
// with the lamps, screens and the corridor shining through the dark), the status icons and the name tags.
// Everything is laid out in room coordinates; the canvas itself has RENDER_SCALE times more pixels.
import { ROOM_PALETTE as P } from '../design/room-palette.ts';
import { t } from '../i18n/index.ts';
import type { Agent, Status } from './cast.ts';
import { PET_HEIGHT, drawHearts, drawPet, isSpeaking, petWords } from './pet.ts';
import type { PetChoice } from '../../shared/pets.ts';
import type { Festival } from '../../shared/festivals.ts';
import { ROOM, isMetricsPiece, type FurniturePiece, type Layout } from '../../shared/room-layout.ts';
import { metricsBadgeAt } from './metrics.ts';
import { festivalGlows, paintFestivalEffects, type Room } from './festivals.ts';
import { WINDOW_GLASS, paintWallItems } from './backdrop.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH, DOOR_SIZE, RENDER_SCALE, WALL_HEIGHT, depthOf, toScreen, type Point } from './geometry.ts';
import { css, rgb, type Lighting } from './lighting.ts';
import { ART_SCALE } from './pixel-art.ts';
import { furnitureDepth, type FurnitureSprites } from './pixel-furniture.ts';
import { PLAYER_ID, directionOf, type Character, type Scene, type Walker } from './scene.ts';
import { hash, type Gesture, type Pose, type SpriteSource } from './sprites.ts';
import { paintActivity } from './activity-icons.ts';
import { Visits, type Visitor } from './visitors.ts';

/** How long a visitor at a birthday party wishes it, in ms. */
const WISH_MS = 4000;
/** Pixelify Sans only draws clean glyphs at some sizes; 11 room pixels is the smallest crisp one. */
export const TAG_FONT = '500 11px "Pixelify Sans", monospace';
const TAG_HEIGHT = 13;
/** A name tag away from the pointer and from the open session: there to read, without hiding the room. */
const FAINT_TAG_ALPHA = 0.45;
/** Room pixels per pixel of the light map: light is soft, it does not need the room's resolution. */
const LIGHT_RESOLUTION = 4;

export type HoveredThing = 'door' | 'screen' | 'board' | 'metrics' | null;

export interface FrameOptions {
  time: number;
  reducedMotion: boolean;
  /** the session open in the detail panel */
  selectedSessionId: string | null;
  /** the light of the hour shown (see lighting.ts), and that hour */
  lighting: Lighting;
  hour: number;
  /** the break room: everyone seated there dozes, eyes closed, Z's floating up */
  dozing: boolean;
  /** what the pointer is on, outlined as something to click: the door, the user's own screen, the whiteboard, the numbers */
  hoveredThing: HoveredThing;
  /** something new waits in the numbers file: a badge over the numbers object */
  metricsBadge: boolean;
  /** the person under the pointer (a person id, or PLAYER_ID): their name tag shows in full, the others are faint */
  hoveredId: string | null;
  /** the festival the room is dressed for and who it is for (see festivalDay), and which room it is */
  festival: Festival | null;
  guests: readonly string[];
  room: Room;
  /** the user's first name, on their name tag */
  playerName: string;
  /** the office pet the user chose */
  pet: PetChoice;
}

/** Something drawn in depth order: a piece of furniture, a person, the pet. */
interface Layer { depth: number; paint: (context: Context) => void }

let highlightCanvas: { canvas: HTMLCanvasElement; context: Context } | null = null;
/**
 * The white line around what a click opens on a piece, drawn after the light so the night does not dim it, but hidden
 * behind whoever and whatever stands in front of the piece: they are cut out of it, at their exact shape.
 */
function paintHighlight(context: Context, furniture: FurnitureSprites, piece: FurniturePiece, layers: readonly Layer[]) {
  highlightCanvas ??= roomCanvas();
  const { canvas, context: mask } = highlightCanvas;
  mask.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  furniture.drawHighlight(mask, piece);
  mask.globalCompositeOperation = 'destination-out';
  const depth = furnitureDepth(piece);
  for (const layer of layers) if (layer.depth > depth) layer.paint(mask);
  mask.globalCompositeOperation = 'source-over';
  context.drawImage(canvas, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

/** A white outline around the door's frame, drawn after the light so the night does not dim it. */
function paintDoorOutline(context: Context, layout: Layout) {
  const from = layout.door.y - 0.15, to = layout.door.y + DOOR_SIZE.width + 0.15, top = DOOR_SIZE.height + 4;
  const corner = (along: number, height: number) => { const base = toScreen({ x: 0, y: along }); return { x: base.x, y: base.y - height }; };
  paintOutline(context, [corner(from, 0), corner(to, 0), corner(to, top), corner(from, top)]);
}

function paintOutline(context: Context, outline: readonly Point[]) {
  context.beginPath();
  outline.forEach((point, index) => { if (index) context.lineTo(point.x, point.y); else context.moveTo(point.x, point.y); });
  context.closePath();
  context.lineWidth = 2;
  context.strokeStyle = P.doorHover;
  context.stroke();
}

type Context = CanvasRenderingContext2D;

function polygon(context: Context, points: readonly Point[], fill: string | CanvasGradient) {
  context.beginPath();
  points.forEach((point, index) => { if (index) context.lineTo(point.x, point.y); else context.moveTo(point.x, point.y); });
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

function rect(context: Context, x: number, y: number, width: number, height: number, colour: string) {
  context.fillStyle = colour;
  context.fillRect(Math.round(x), Math.round(y), width, height);
}

const raise = (point: Point, height: number): Point => ({ x: point.x, y: point.y - height });

/* The sun (or the moon) through the windows */

/** A window's glass along the back wall, in tiles, and its height above the floor in room pixels. */
interface Glass { fromX: number; toX: number; low: number; high: number }
const glassesOf = (layout: Layout): Glass[] => layout.wallItems.filter((item) => item.kind === 'window')
  .map((item) => ({ fromX: item.fromX, toX: item.fromX + item.width, low: WINDOW_GLASS.low * ART_SCALE, high: WINDOW_GLASS.high * ART_SCALE }));

/** Where the light of a window lands on the floor: its glass thrown into the room, longer when the sun is low. */
function lightPatch(glass: Glass, lighting: Lighting): Point[] {
  const onFloor = (x: number, height: number): Point => {
    const heightInTiles = height / 16;
    return toScreen({ x: x + lighting.slant * heightInTiles, y: Math.min(ROOM.depth, heightInTiles * lighting.reach) });
  };
  return [onFloor(glass.fromX, glass.low), onFloor(glass.toX, glass.low), onFloor(glass.toX, glass.high), onFloor(glass.fromX, glass.high)];
}

/** The convex hull of some points (monotone chain), to draw the shaft of light between a window and its patch. */
function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0) out.pop();
      out.push(point);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function clipTo(context: Context, outline: readonly Point[]) {
  context.beginPath();
  outline.forEach((point, index) => { if (index) context.lineTo(point.x, point.y); else context.moveTo(point.x, point.y); });
  context.closePath();
  context.clip();
}
const FLOOR_OUTLINE = [toScreen({ x: 0, y: 0 }), toScreen({ x: ROOM.width, y: 0 }), toScreen({ x: ROOM.width, y: ROOM.depth }), toScreen({ x: 0, y: ROOM.depth })];
const ROOM_OUTLINE = [
  raise(toScreen({ x: 0, y: ROOM.depth }), WALL_HEIGHT), raise(toScreen({ x: 0, y: 0 }), WALL_HEIGHT), raise(toScreen({ x: ROOM.width, y: 0 }), WALL_HEIGHT),
  toScreen({ x: ROOM.width, y: 0 }), toScreen({ x: ROOM.width, y: ROOM.depth }), toScreen({ x: 0, y: ROOM.depth }),
];

function paintSunlight(context: Context, lighting: Lighting, glasses: readonly Glass[]) {
  if (lighting.beam < 0.02) return;
  context.save();
  clipTo(context, FLOOR_OUTLINE);
  context.globalCompositeOperation = 'screen';
  for (const glass of glasses) polygon(context, lightPatch(glass, lighting), css(lighting.beamColor, 0.5 * lighting.beam));
  context.restore();
  context.save();
  clipTo(context, ROOM_OUTLINE);
  context.globalCompositeOperation = 'screen';
  for (const glass of glasses) {
    const patch = lightPatch(glass, lighting);
    const corners = [raise(toScreen({ x: glass.fromX, y: 0 }), glass.high), raise(toScreen({ x: glass.toX, y: 0 }), glass.high), raise(toScreen({ x: glass.toX, y: 0 }), glass.low), raise(toScreen({ x: glass.fromX, y: 0 }), glass.low)];
    const shaft = context.createLinearGradient(corners[0].x, corners[0].y, patch[3].x, patch[3].y);
    shaft.addColorStop(0, css(lighting.beamColor, 0.3 * lighting.beam));
    shaft.addColorStop(1, css(lighting.beamColor, 0));
    polygon(context, hull([...corners, ...patch]), shaft);
  }
  context.restore();
}

/* The light of the evening and the night: a light map, multiplied over the room */

interface Light { at: Point; radius: number; colour: string; strength: number }

/** The chair behind a desk (whoever works at it), or -1. */
const seatAt = (layout: Layout, piece: FurniturePiece) => layout.seats.findIndex((seat) => seat.y === piece.y - 1 && seat.x === piece.x);

function lightsOf(layout: Layout, occupied: ReadonlySet<number>, bossAtDesk: boolean, lighting: Lighting, options: FrameOptions): Light[] {
  const glasses = glassesOf(layout);
  const lights: Light[] = [];
  const above = (x: number, y: number, height: number) => raise(toScreen({ x, y }), height);
  for (const piece of layout.furniture) {
    const { x, y } = piece;
    if (piece.kind === 'floorLamp') lights.push({ at: above(x + 0.5, y + 0.5, 52), radius: 140, colour: P.light.lamp, strength: 1 });
    if (piece.kind === 'bossDesk') {
      lights.push({ at: above(x + 2.8, y + 0.2, 34), radius: 90, colour: P.light.boss, strength: 0.9 });
      if (bossAtDesk) lights.push({ at: above(x + 1.5, y + 0.2, 30), radius: 90, colour: P.light.screen, strength: 1 });
    }
    if (piece.kind === 'counter') lights.push({ at: above(x + 0.6, y + 0.5, 30), radius: 80, colour: P.light.coffee, strength: 0.8 });
    if (piece.kind === 'pumpkin') lights.push({ at: above(x + 0.5, y + 0.5, 12), radius: 60, colour: P.halloween.glow, strength: 0.9 });
    if (piece.kind === 'metricsTv') lights.push({ at: above(x + 0.4, y + piece.depth / 2, 68), radius: 80, colour: P.light.screen, strength: 0.7 });
    if (piece.kind === 'ticker') lights.push({ at: above(x + 0.4, y + piece.depth / 2, 78), radius: 70, colour: P.light.screenIdle, strength: 0.5 });
    if (piece.kind === 'cooler') lights.push({ at: above(x + 0.5, y + 0.8, 30), radius: 50, colour: P.light.screenIdle, strength: 0.6 });
    if (piece.kind === 'desk') {
      // the screen of whoever sits at a desk is on and lights their face, at work or not (their hands and their status
      // already tell which)
      if (occupied.has(seatAt(layout, piece))) lights.push({ at: above(x + 0.6, y + 0.2, 30), radius: 90, colour: P.light.screen, strength: 1 });
    }
  }
  lights.push({ at: above(0.3, layout.door.y + 0.65, 26), radius: 120, colour: P.light.corridor, strength: 1 });
  for (const item of layout.wallItems) if (item.kind === 'tv') lights.push({ at: above(item.fromX + item.width / 2, 0.6, 34), radius: 130, colour: P.light.screen, strength: 0.8 });
  for (const glass of glasses) lights.push({ at: above((glass.fromX + glass.toX) / 2, 0.4, 50), radius: 120, colour: P.light.city, strength: 0.5 * lighting.stars });
  if (options.festival) lights.push(...festivalGlows(options.festival, options.room, layout));
  return lights;
}

const hexAlpha = (hex: string, alpha: number) => {
  const [red, green, blue] = rgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
};

let lightCache: { key: string; canvas: HTMLCanvasElement } | null = null;
/** The light map for the hour and the screens in use: the hour's tint, plus every light added on top. */
function lightMap(lighting: Lighting, lights: readonly Light[]): HTMLCanvasElement {
  const key = `${lighting.tint.join()}|${lighting.glow.toFixed(2)}|${lights.map((light) => `${light.colour}${light.strength.toFixed(2)}${Math.round(light.at.x)}`).join()}`;
  if (lightCache?.key === key) return lightCache.canvas;
  const canvas = lightCache?.canvas ?? document.createElement('canvas');
  canvas.width = CANVAS_WIDTH / LIGHT_RESOLUTION;
  canvas.height = CANVAS_HEIGHT / LIGHT_RESOLUTION;
  const context = canvas.getContext('2d')!;
  context.fillStyle = css(lighting.tint);
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'lighter';
  for (const light of lights) {
    const strength = light.strength * lighting.glow;
    if (strength < 0.02) continue;
    const x = light.at.x / LIGHT_RESOLUTION, y = light.at.y / LIGHT_RESOLUTION, radius = light.radius / LIGHT_RESOLUTION;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, hexAlpha(light.colour, strength));
    gradient.addColorStop(0.45, hexAlpha(light.colour, strength * 0.45));
    gradient.addColorStop(1, hexAlpha(light.colour, 0));
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  context.globalCompositeOperation = 'source-over';
  lightCache = { key, canvas };
  return canvas;
}

function paintLight(context: Context, lighting: Lighting, lights: readonly Light[]) {
  context.save();
  context.imageSmoothingEnabled = true;
  context.globalCompositeOperation = 'multiply';
  context.drawImage(lightMap(lighting, lights), 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  // and a little bloom around each light, over what it lights
  context.globalCompositeOperation = 'screen';
  for (const light of lights) {
    const strength = light.strength * lighting.glow;
    if (strength < 0.05) continue;
    const radius = light.radius * 0.32;
    const gradient = context.createRadialGradient(light.at.x, light.at.y, 0, light.at.x, light.at.y, radius);
    gradient.addColorStop(0, hexAlpha(light.colour, 0.45 * strength));
    gradient.addColorStop(1, hexAlpha(light.colour, 0));
    context.fillStyle = gradient;
    context.fillRect(light.at.x - radius, light.at.y - radius, radius * 2, radius * 2);
  }
  context.restore();
}

/** Steam curling up from the coffee machine and the mugs of the counter: a few pale pixels that rise and fade. */
function paintSteam(context: Context, time: number, pieces: readonly FurniturePiece[]) {
  for (const piece of pieces) {
    if (piece.kind !== 'counter') continue;
    for (const [x, y, z] of [[0.55, 0.5, 20], [1.27, 0.57, 15], [1.52, 0.57, 15]]) {
      const base = raise(toScreen({ x: piece.x + x, y: piece.y + y }), z * ART_SCALE);
      for (let puff = 0; puff < 3; puff++) {
        const age = ((time / 3200 + puff / 3 + x) % 1);
        context.globalAlpha = 0.75 * (1 - age);
        rect(context, base.x + Math.round(Math.sin((age + puff) * 5) * 2), base.y - age * 14, 2, 2, P.furniture.steam);
      }
    }
  }
  context.globalAlpha = 1;
}

/* People */

function poseOf(walker: Walker, seated: boolean, smiling: boolean, gesture: Gesture, options: FrameOptions): Pose {
  const moving = walker.path.length > 0;
  const beat = gesture === 'typing' ? 170 : gesture === 'raising' ? 380 : 120;
  return {
    direction: directionOf(walker.heading),
    posture: seated ? 'sit' : moving ? 'walk' : 'stand',
    step: (moving || gesture !== 'none') && !options.reducedMotion && Math.floor((options.time + walker.blinkOffset) / beat) % 2 === 1 ? 1 : 0,
    blinking: !options.reducedMotion && (options.time + walker.blinkOffset) % 3800 < 140,
    smiling,
    gesture,
  };
}

/** Seated, someone types while their session works and raises an arm when it waits for a permission or an answer. */
function characterPose(character: Character, options: FrameOptions): Pose {
  const { status } = character.person;
  const seated = character.phase === 'seated';
  const gesture: Gesture = !seated || options.dozing ? 'none' : status === 'working' ? 'typing' : status === 'permission' || status === 'question' ? 'raising' : 'none';
  const pose = poseOf(character, seated, status === 'finished', gesture, options);
  // dozing on a sofa of the break room: eyes closed
  return seated && options.dozing ? { ...pose, blinking: true, smiling: false } : pose;
}

/** A visitor of the crew: walking, standing at what they came for, or sitting on the sofa (raised by its cushions). */
function visitorPose(visitor: Visitor, options: FrameOptions): { pose: Pose; lift: number } {
  const sitting = Visits.sitting(visitor);
  return { pose: poseOf(visitor, sitting, false, 'none', options), lift: sitting ? visitor.spot.lift ?? 0 : 0 };
}

/** `lift`: drawn this many room pixels above the floor (someone sitting on the sofa). */
function paintPerson(context: Context, sprites: SpriteSource, id: string, walker: Walker, pose: Pose, selected: boolean, lift = 0) {
  const feet = raise(toScreen(walker.position), lift);
  if (pose.posture !== 'sit') {
    context.fillStyle = P.shadow;
    context.beginPath();
    context.ellipse(feet.x, feet.y, 11, 4, 0, 0, Math.PI * 2);
    context.fill();
  }
  if (selected) {
    context.strokeStyle = P.selection;
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(feet.x, feet.y, 13, 5.5, 0, 0, Math.PI * 2);
    context.stroke();
  }
  sprites.draw(context, id, pose, feet.x, feet.y);
}

/** A name tag centred above a head, its bottom at `bottom`. Returns the top and the right end of the tag. */
function paintTag(context: Context, text: string, x: number, bottom: number, colour: string, framed: boolean, background: string = P.tag): { top: number; right: number } {
  const width = Math.ceil(context.measureText(text).width) + 8;
  const left = Math.round(x - width / 2);
  const top = Math.round(bottom - TAG_HEIGHT);
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(left, top, width, TAG_HEIGHT, 3);
  context.fill();
  if (framed) { context.strokeStyle = P.selection; context.lineWidth = 1; context.stroke(); }
  context.fillStyle = colour;
  context.fillText(text, Math.round(x), top + 10);
  return { top, right: left + width };
}

/** The sub-agents at work for a session: their faces in a little tag next to its name (three at most, then "+n"). */
function paintAgents(context: Context, sprites: SpriteSource, sessionId: string, agents: readonly Agent[], left: number, top: number, time: number, reducedMotion: boolean) {
  if (!agents.length) return;
  const shown = agents.slice(0, 3);
  const extra = agents.length - shown.length;
  const width = 4 + shown.length * 9 + 3 + (extra ? 14 : 0);
  context.fillStyle = P.tag;
  context.beginPath();
  context.roundRect(left, top, width, TAG_HEIGHT, 3);
  context.fill();
  // each agent bobs at its own pace: they are at work
  shown.forEach((agent, index) => {
    const bob = reducedMotion ? 0 : Math.floor((time + hash(agent.id) % 400) / 260) % 2;
    sprites.drawHead(context, `${sessionId}/${agent.id}`, left + 2 + index * 9, top + 0.5 - bob, 12);
  });
  if (extra) {
    context.fillStyle = P.tagText;
    context.fillText(`+${extra}`, left + width - 8, top + 10);
  }
}

/** What the pet says ("Miaou !", "Ouaf ouaf !"…) above it, in a small white bubble. */
/** A white speech bubble over the room, its tail's tip at (x, y): the pet, and the crew wishing a happy birthday. */
function paintSpeech(context: Context, text: string, x: number, y: number) {
  const width = Math.ceil(context.measureText(text).width) + 10;
  const left = Math.round(x - width / 2), top = Math.round(y - TAG_HEIGHT - 6);
  context.fillStyle = P.pet.bubble;
  context.beginPath();
  context.roundRect(left, top, width, TAG_HEIGHT + 1, 5);
  context.fill();
  context.beginPath();
  context.moveTo(x - 3, top + TAG_HEIGHT); context.lineTo(x + 3, top + TAG_HEIGHT); context.lineTo(x, top + TAG_HEIGHT + 5);
  context.fill();
  context.fillStyle = P.pet.bubbleInk;
  context.fillText(text, Math.round(x), top + 10);
}

type Glyph = readonly (readonly [number, number])[];
const EXCLAMATION: Glyph = [[0, 0], [0, 1], [0, 2], [0, 4]];

/** A rounded bubble centred on (x, y), its tail down, a white glyph in it (dots from its middle); `scale`: drawn bigger. */
function paintIconBubble(context: Context, x: number, y: number, colour: string, glyph: Glyph, scale = 1, ink: string = P.white) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.translate(-x, -y);
  context.fillStyle = P.outline;
  context.beginPath(); context.roundRect(x - 7, y - 7, 14, 13, 3); context.fill();
  context.fillStyle = colour;
  context.beginPath(); context.roundRect(x - 6, y - 6, 12, 11, 2); context.fill();
  rect(context, x - 1, y + 6, 3, 2, P.outline);
  rect(context, x, y + 5, 1, 2, colour);
  for (const [dx, dy] of glyph) rect(context, x + dx, y - 3 + dy, 1, 1, ink);
  context.restore();
}

/** The icon above a seated person: ! permission, ? question, ... working, a tick when a finished turn waits to be seen, x error. */
function paintStatus(context: Context, status: Exclude<Status, null>, x: number, y: number, time: number, reducedMotion: boolean) {
  const asking = status === 'permission' || status === 'question';
  const pulse = asking && !reducedMotion ? Math.round(Math.sin(time / 220)) : 0;
  const lifted = reducedMotion ? -1 : Math.floor(time / 300) % 3;
  const glyph: Glyph = status === 'permission' ? EXCLAMATION
    : status === 'question' ? [[-1, 0], [0, 0], [1, 0], [1, 1], [0, 2], [0, 4]]
    : status === 'finished' ? [[-3, 2], [-2, 3], [-1, 2], [0, 1], [1, 0]]
    : status === 'error' ? [[-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2], [-1, 3], [1, 3], [-2, 4], [2, 4]]
    : [0, 1, 2].map((dot) => [-3 + dot * 3, 2 - (dot === lifted ? 1 : 0)] as const);
  // what waits for the user is drawn half as big again, so it shows from across the room
  paintIconBubble(context, x, y + pulse, P.status[status], glyph, asking ? 1.5 : 1);
}

/** The badge over the numbers object while something new waits in its file: a dark "!" in a yellow bubble, half as big again, bobbing, its tail on `at`. */
function paintMetricsBadge(context: Context, at: Point, time: number) {
  const bob = Math.round(Math.sin(time / 260));
  paintIconBubble(context, at.x, at.y - 12 + bob, P.metricsBadge, EXCLAMATION, 1.5, P.outline);
}

const wallCache = new Map<Layout, { key: number; canvas: HTMLCanvasElement }>();
/** What hangs on a room's walls (windows, clock, TV), painted again every quarter of an hour. */
function wallItems(layout: Layout, lighting: Lighting, hour: number, festival: Festival | null, guests: readonly string[]): HTMLCanvasElement {
  const key = Math.round(hour * 4);
  let cached = wallCache.get(layout);
  if (cached?.key !== key) { cached = { key, canvas: paintWallItems(layout, lighting, hour, festival, guests) }; wallCache.set(layout, cached); }
  return cached.canvas;
}

/** Z's floating up from someone dozing in the break room, one after the other. */
function paintZzz(context: Context, x: number, y: number, time: number, seed: number) {
  for (let index = 0; index < 3; index++) {
    const age = ((time + seed) / 2400 + index / 3) % 1;
    context.globalAlpha = Math.min(1, (1 - age) * 1.6);
    context.font = `700 ${8 + index * 2}px "Pixelify Sans", monospace`;
    context.fillStyle = P.tagText;
    context.fillText('z', Math.round(x + 8 + age * 10 + index * 3), Math.round(y - age * 22));
  }
  context.globalAlpha = 1;
  context.font = TAG_FONT;
}

/** A canvas with RENDER_SCALE times more pixels, drawn in room coordinates. */
export function roomCanvas(): { canvas: HTMLCanvasElement; context: Context } {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH * RENDER_SCALE;
  canvas.height = CANVAS_HEIGHT * RENDER_SCALE;
  const context = canvas.getContext('2d')!;
  context.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
  context.imageSmoothingEnabled = false;
  return { canvas, context };
}

export function paintFrame(context: Context, backdrop: HTMLCanvasElement, scene: Scene, sprites: SpriteSource, furniture: FurnitureSprites, options: FrameOptions) {
  const { lighting } = options;
  context.fillStyle = P.backdrop;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.drawImage(backdrop, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const { layout } = scene.floor;
  context.drawImage(wallItems(layout, lighting, options.hour, options.festival, options.guests), 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  paintSunlight(context, lighting, glassesOf(layout));

  const characters = [...scene.characters.values()];
  const seated = characters.filter((character) => character.phase === 'seated');
  const occupied = new Set(seated.map((character) => character.seat));
  const isSelected = (character: Character) => character.person.sessionId === options.selectedSessionId;
  const layers: Layer[] = [];
  const bossAtDesk = scene.playerSpot?.atDesk === true;
  for (const piece of layout.furniture) layers.push({ depth: furnitureDepth(piece), paint: (on) => furniture.draw(on, piece) });
  for (const character of characters) {
    const pose = characterPose(character, options);
    const lift = character.phase === 'seated' ? scene.floor.seatLift(character.seat) : 0;
    layers.push({ depth: depthOf(character.position), paint: (on) => paintPerson(on, sprites, character.person.id, character, pose, isSelected(character), lift) });
  }
  // the keys of a desk's laptop that show, right of its lid, where the visible hand of whoever types there rests
  for (const piece of layout.furniture) {
    if (piece.kind !== 'desk') continue;
    const typist = seated.find((character) => character.seat === seatAt(layout, piece));
    if (!typist) continue;
    const pose = characterPose(typist, options);
    if (pose.gesture !== 'typing' || pose.direction !== 'down-left') continue;
    const feet = raise(toScreen(typist.position), scene.floor.seatLift(typist.seat));
    const hand = raise(toScreen({ x: piece.x + 0.96, y: piece.y + 0.22 }), 12 * ART_SCALE);
    layers.push({ depth: furnitureDepth(piece) + 0.01, paint: (on) => sprites.drawTypingHand(on, typist.person.id, feet, hand, pose.step) });
  }
  // those still outside, behind the first of two, are not in the room yet
  const visitors = [...(scene.visits?.visitors.values() ?? [])].filter((visitor) => visitor.outside <= 0);
  for (const visitor of visitors) {
    const { pose, lift } = visitorPose(visitor, options);
    layers.push({ depth: depthOf(visitor.position), paint: (on) => paintPerson(on, sprites, visitor.id, visitor, pose, false, lift) });
  }
  const playerPose = poseOf(scene.player, scene.playerSpot !== null, false, 'none', options);
  const pet = scene.pet;
  const choice = options.pet.kind === 'none' ? null : options.pet;
  if (pet && choice) layers.push({ depth: depthOf(pet.position), paint: (on) => drawPet(on, pet, choice, toScreen(pet.position).x, toScreen(pet.position).y, options.reducedMotion ? 0 : options.time) });
  const playerLift = scene.playerSpot?.lift ?? 0;
  layers.push({ depth: depthOf(scene.player.position), paint: (on) => paintPerson(on, sprites, PLAYER_ID, scene.player, playerPose, false, playerLift) });
  for (const layer of layers.sort((a, b) => a.depth - b.depth)) layer.paint(context);

  paintLight(context, lighting, lightsOf(layout, occupied, bossAtDesk, lighting, options));
  const time = options.reducedMotion ? 0 : options.time;
  paintSteam(context, time, layout.furniture);
  // what the festival makes move stays bright in the dark: twinkling bulbs, candles, snow, fireworks, water
  if (options.festival) {
    const headOf = (walker: Walker, lift: number, height: number) => { const feet = raise(toScreen(walker.position), lift); return { x: feet.x, y: feet.y - height + 14 }; };
    const heads = [headOf(scene.player, playerLift, sprites.height(playerPose)), ...characters.map((character) => headOf(character, character.phase === 'seated' ? scene.floor.seatLift(character.seat) : 0, sprites.height(characterPose(character, options))))];
    paintFestivalEffects(context, { festival: options.festival, room: options.room, layout, time, lighting, heads });
  }
  if (options.hoveredThing === 'door') paintDoorOutline(context, layout);
  // a white line around the user's laptop itself (a click there opens a terminal), around the whiteboard (its notes), or
  // around the numbers object
  const hovered = options.hoveredThing;
  const clickable = hovered === 'metrics' ? layout.furniture.find(isMetricsPiece)
    : hovered === 'screen' || hovered === 'board' ? layout.furniture.find((piece) => piece.kind === (hovered === 'screen' ? 'bossDesk' : 'whiteboard')) : undefined;
  if (clickable) paintHighlight(context, furniture, clickable, layers);
  const metrics = options.metricsBadge ? layout.furniture.find(isMetricsPiece) : undefined;
  if (metrics) paintMetricsBadge(context, metricsBadgeAt(metrics), time);

  // name tags and icons go on top of everything, so the furniture never hides them
  context.font = TAG_FONT;
  context.textAlign = 'center';
  for (const character of characters) {
    const lift = character.phase === 'seated' ? scene.floor.seatLift(character.seat) : 0;
    const feet = raise(toScreen(character.position), lift);
    const head = feet.y - sprites.height(characterPose(character, options), character.person.id);
    if (options.dozing && character.phase === 'seated') paintZzz(context, feet.x, head - 4, options.reducedMotion ? 0 : options.time, character.blinkOffset);
    context.globalAlpha = isSelected(character) || options.hoveredId === character.person.id ? 1 : FAINT_TAG_ALPHA;
    const tag = paintTag(context, character.person.name, feet.x, head - 2, P.tagText, isSelected(character));
    // the session's tag right above its name, then what it waits for above both (the status at full strength: it calls the user)
    const labelTop = character.person.tag ? paintTag(context, character.person.tag, feet.x, tag.top - 2, P.sessionTagText, false, P.sessionTag).top : tag.top;
    context.globalAlpha = 1;
    // the sub-agents at full strength, like the status: they show work going on
    if (character.phase === 'seated') paintAgents(context, sprites, character.person.sessionId, character.person.agents, tag.right + 2, tag.top, options.time, options.reducedMotion);
    if (character.phase === 'seated' && character.person.status) paintStatus(context, character.person.status, feet.x, labelTop - 16, options.time, options.reducedMotion);
  }
  if (pet && choice) {
    const paws = toScreen(pet.position);
    drawHearts(context, pet, paws.x, paws.y);
    if (isSpeaking(pet)) paintSpeech(context, petWords(pet, choice.kind), paws.x, paws.y - PET_HEIGHT);
  }
  // what a visitor does, in a bubble once they are there, and their name only under the pointer: they are not sessions
  for (const visitor of visitors) {
    const hovered = visitor.id === options.hoveredId;
    if (visitor.phase !== 'staying' && !hovered) continue;
    const { pose, lift } = visitorPose(visitor, options);
    const feet = raise(toScreen(visitor.position), lift);
    const head = feet.y - sprites.height(pose, visitor.id);
    const above = hovered ? paintTag(context, visitor.name, feet.x, head - 2, P.tagText, false).top : head;
    const bob = options.reducedMotion ? 0 : Math.round(Math.sin((options.time + visitor.blinkOffset) / 500));
    // at a birthday party, they first wish it out loud (the second of two after the first), then show what they do
    const celebrated = options.festival === 'birthday' ? options.guests.filter((name) => name !== visitor.name) : [];
    const wishing = visitor.spot.activity === 'party' && celebrated.length > 0 && Math.floor(visitor.stayed / WISH_MS) === visitor.order;
    if (visitor.phase === 'staying' && wishing) paintSpeech(context, t.room.birthdayWish(celebrated), feet.x, above + 4);
    else if (visitor.phase === 'staying') paintActivity(context, visitor.spot.activity, feet.x, above - 1 + bob);
  }
  const playerFeet = toScreen(scene.player.position);
  context.globalAlpha = options.hoveredId === PLAYER_ID ? 1 : FAINT_TAG_ALPHA;
  paintTag(context, options.playerName, playerFeet.x, playerFeet.y - playerLift - sprites.height(playerPose, PLAYER_ID) - 2, P.playerTagText, false);
  context.globalAlpha = 1;
}
