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
import { BRANCH_GLYPH, BRANCH_GLYPH_HEIGHT, BRANCH_GLYPH_WIDTH, STATUS_GLYPHS, WORKING_DOTS, WORKING_STEP_MS, type Glyph } from './status-glyphs.ts';
import { festivalGlows, paintFestivalEffects, windowsOf, type Room } from './festivals.ts';
import { WINDOW_GLASS, paintWallItems } from './backdrop.ts';
import { roomTheme, themeKit } from './themes/index.ts';
import type { ThemeEffect } from './themes/kit.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH, DOOR_SIZE, RENDER_SCALE, WALL_HEIGHT, depthOf, toScreen, type Point } from './geometry.ts';
import { css, rgb, type Lighting } from './lighting.ts';
import { ART_SCALE } from './pixel-art.ts';
import { furnitureDepth, type FurnitureSprites } from './pixel-furniture.ts';
import { PLAYER_ID, directionOf, type Character, type Scene, type Walker } from './scene.ts';
import { hash, type Gesture, type Pose, type SpriteSource } from './sprites.ts';
import { paintActivity } from './activity-icons.ts';
import { Visits, type Visitor } from './visitors.ts';
import { stackLabels } from './labels.ts';

/** How long a visitor at a birthday party wishes it, in ms. */
const WISH_MS = 4000;
/** Pixelify Sans only draws clean glyphs at some sizes; 11 room pixels is the smallest crisp one. */
export const TAG_FONT = '500 11px "Pixelify Sans", monospace';
const TAG_HEIGHT = 13;
/** Room pixels per pixel of the light map: light is soft, it does not need the room's resolution. */
const LIGHT_RESOLUTION = 4;

export type HoveredThing = 'door' | 'screen' | 'board' | 'metrics' | null;

export interface FrameOptions {
  time: number;
  reducedMotion: boolean;
  /** the session open in the detail panel */
  /** the sessions open in the right column: their people are framed */
  openSessionIds: readonly string[];
  /** the light of the hour shown (see lighting.ts), and that hour */
  lighting: Lighting;
  hour: number;
  /** the break room: everyone seated there dozes, eyes closed, Z's floating up */
  dozing: boolean;
  /** what the pointer is on, outlined as something to click: the door, the user's own screen, the whiteboard, the numbers */
  hoveredThing: HoveredThing;
  /** something new waits in the numbers file: a badge over the numbers object */
  metricsBadge: boolean;
  /** the sessions of the projects the header's filter leaves out: their people are ghosts, grey and without a tag */
  ghostIds: ReadonlySet<string>;
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

let effectsCanvas: { canvas: HTMLCanvasElement; context: Context } | null = null;
/**
 * The theme's effects, after the light: painted in depth order with the room, each erased where whoever or whatever
 * stands in front of it is drawn (the room itself is already on the canvas, it is only used to cut the effects out).
 */
function paintThemeEffects(context: Context, effects: readonly ThemeEffect[], layers: readonly Layer[]) {
  if (!effects.length) return;
  effectsCanvas ??= roomCanvas();
  const { canvas, context: on } = effectsCanvas;
  on.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const nearest = Math.min(...effects.map((effect) => effect.depth));
  const steps = [...effects.map((effect) => ({ ...effect, cut: false })), ...layers.filter((layer) => layer.depth > nearest).map((layer) => ({ ...layer, cut: true }))];
  // an effect at the depth of a piece comes after it, so the piece itself never cuts it
  for (const step of steps.sort((a, b) => a.depth - b.depth || Number(b.cut) - Number(a.cut))) {
    on.globalCompositeOperation = step.cut ? 'destination-out' : 'source-over';
    step.paint(on);
  }
  on.globalCompositeOperation = 'source-over';
  context.drawImage(canvas, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

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
const glassesOf = (layout: Layout): Glass[] => windowsOf(layout)
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
  if (themeKit()?.wallBeam === false) return;
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
  const lamps = themeKit()?.officeLamps !== false;
  const screen = themeKit()?.screenLight ?? P.light.screen;
  for (const piece of layout.furniture) {
    const { x, y } = piece;
    if (piece.kind === 'floorLamp' && lamps) lights.push({ at: above(x + 0.5, y + 0.5, 52), radius: 140, colour: P.light.lamp, strength: 1 });
    if (piece.kind === 'bossDesk') {
      if (lamps) lights.push({ at: above(x + 2.8, y + 0.2, 34), radius: 90, colour: P.light.boss, strength: 0.9 });
      if (bossAtDesk) lights.push({ at: above(x + 1.5, y + 0.2, 30), radius: 90, colour: screen, strength: 1 });
    }
    if (piece.kind === 'counter' && lamps) lights.push({ at: above(x + 0.6, y + 0.5, 30), radius: 80, colour: P.light.coffee, strength: 0.8 });
    if (piece.kind === 'pumpkin') lights.push({ at: above(x + 0.5, y + 0.5, 12), radius: 60, colour: P.halloween.glow, strength: 0.9 });
    if (piece.kind === 'metricsTv') lights.push({ at: above(x + 0.4, y + piece.depth / 2, 68), radius: 80, colour: P.light.screen, strength: 0.7 });
    if (piece.kind === 'ticker') lights.push({ at: above(x + 0.4, y + piece.depth / 2, 78), radius: 70, colour: P.light.screenIdle, strength: 0.5 });
    if (piece.kind === 'cooler' && lamps) lights.push({ at: above(x + 0.5, y + 0.8, 30), radius: 50, colour: P.light.screenIdle, strength: 0.6 });
    if (piece.kind === 'desk') {
      // the screen of whoever sits at a desk is on and lights their face, at work or not (their hands and their status
      // already tell which)
      if (occupied.has(seatAt(layout, piece))) lights.push({ at: above(x + 0.6, y + 0.2, 30), radius: 90, colour: screen, strength: 1 });
    }
  }
  const door = themeKit()?.doorLight ?? P.light.corridor;
  if (door) lights.push({ at: above(0.3, layout.door.y + 0.65, 26), radius: 120, colour: door, strength: 1 });
  for (const item of layout.wallItems) if (item.kind === 'tv') lights.push({ at: above(item.fromX + item.width / 2, 0.6, 34), radius: 130, colour: screen, strength: 0.8 });
  if (lamps) for (const glass of glasses) lights.push({ at: above((glass.fromX + glass.toX) / 2, 0.4, 50), radius: 120, colour: P.light.city, strength: 0.5 * lighting.stars });
  if (options.festival) lights.push(...festivalGlows(options.festival, options.room, layout));
  for (const light of themeKit()?.lights?.(layout, lighting) ?? []) lights.push({ at: above(light.x, light.y, light.height), radius: light.radius, colour: light.colour, strength: light.strength });
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

let litCanvas: HTMLCanvasElement | null = null;

/** The light map cut to what is painted: around the room the canvas stays clear, for the page's backdrop to show. */
function litRoom(context: Context, map: HTMLCanvasElement): HTMLCanvasElement {
  litCanvas ??= document.createElement('canvas');
  const { width, height } = context.canvas;
  if (litCanvas.width !== width || litCanvas.height !== height) { litCanvas.width = width; litCanvas.height = height; }
  const lit = litCanvas.getContext('2d')!;
  lit.globalCompositeOperation = 'copy';
  lit.imageSmoothingEnabled = true;
  lit.drawImage(map, 0, 0, width, height);
  lit.globalCompositeOperation = 'destination-in';
  lit.drawImage(context.canvas, 0, 0);
  return litCanvas;
}

function paintLight(context: Context, lighting: Lighting, lights: readonly Light[]) {
  context.save();
  context.globalCompositeOperation = 'multiply';
  context.drawImage(litRoom(context, lightMap(lighting, lights)), 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.imageSmoothingEnabled = true;
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

/**
 * A name tag: one pill of dark glass, like the page's badges, the same height for everyone. In it, from the left: the
 * session's status as a round icon, the name, the word the user put on the session, the faces of its sub-agents.
 */
interface NameTag {
  name: string;
  colour: string;
  status: Exclude<Status, null> | null;
  tag: string | null;
  /** on a branch of its own: a little branch after the name */
  branch?: boolean;
  /** whose sub-agents they are, for their faces */
  sessionId: string;
  agents: readonly Agent[];
  /** the session open in the detail panel */
  framed: boolean;
}

const TAG_PADDING = 6;
const TAG_GAP = 3;
const ICON_SIZE = 9;
const HEAD_SIZE = 10;
/** the faces overlap a little */
const HEAD_STEP = 7;
const SHOWN_AGENTS = 3;
/** A name tag away from the pointer and from the open session, and not calling the user: there to read, without hiding the room. */
const FAINT_TAG_ALPHA = 0.7;
/** the people of the projects left out by the header's filter: still at their desk, but dark grey and a little see-through, so they draw no eye */
const GHOST_FILTER = 'grayscale(1) brightness(0.4)';
const GHOST_ALPHA = 0.7;
/** room pixels between the top of a head and its name tag */
const TAG_LIFT = 5;
/** the room a hairline takes between two parts of a tag, with the gaps on both sides */
const SEPARATED = TAG_GAP * 2 + 1;


const asks = (status: Status) => status === 'permission' || status === 'question';
const textWidthOf = (context: Context, text: string) => Math.ceil(context.measureText(text).width);
const extraAgents = (tag: NameTag) => Math.max(0, tag.agents.length - SHOWN_AGENTS);

function tagWidth(context: Context, tag: NameTag): number {
  let width = (tag.status ? 2 + ICON_SIZE + TAG_GAP : TAG_PADDING) + textWidthOf(context, tag.name) + TAG_PADDING;
  if (tag.branch) width += TAG_GAP + BRANCH_GLYPH_WIDTH;
  if (tag.tag) width += SEPARATED + textWidthOf(context, tag.tag);
  if (tag.agents.length) {
    const shown = Math.min(tag.agents.length, SHOWN_AGENTS);
    width += SEPARATED + HEAD_SIZE + (shown - 1) * HEAD_STEP;
    if (extraAgents(tag)) width += TAG_GAP + textWidthOf(context, `+${extraAgents(tag)}`);
  }
  return width;
}

/** The hairline between two parts of a tag, after `x`; returns where the next part starts. */
function separator(context: Context, x: number, top: number): number {
  context.fillStyle = P.tagEdge;
  context.fillRect(x + TAG_GAP, top + 3, 0.5, TAG_HEIGHT - 6);
  return x + SEPARATED;
}

function paintTagIcon(context: Context, status: Exclude<Status, null>, left: number, top: number, time: number, reducedMotion: boolean) {
  context.fillStyle = P.status[status];
  context.beginPath();
  context.arc(left + ICON_SIZE / 2, top + ICON_SIZE / 2, ICON_SIZE / 2, 0, Math.PI * 2);
  context.fill();
  const glyphLeft = left + 2, glyphTop = top + 2;
  if (status === 'working') {
    const lifted = reducedMotion ? -1 : Math.floor(time / WORKING_STEP_MS) % 3;
    WORKING_DOTS.forEach((dx, dot) => { rect(context, glyphLeft + dx, glyphTop + 2 - (dot === lifted ? 1 : 0), 1, 1, P.statusInk); });
    return;
  }
  for (const [dx, dy] of STATUS_GLYPHS[status]) rect(context, glyphLeft + dx, glyphTop + dy, 1, 1, P.statusInk);
}

/** The sub-agents' faces, round, each bobbing at its own pace: they are at work. Three at most, then "+n". */
function paintTagAgents(context: Context, sprites: SpriteSource, tag: NameTag, left: number, top: number, time: number, reducedMotion: boolean) {
  const shown = tag.agents.slice(0, SHOWN_AGENTS);
  shown.forEach((agent, index) => {
    const bob = reducedMotion ? 0 : Math.floor((time + hash(agent.id) % 400) / 260) % 2;
    const x = left + index * HEAD_STEP + HEAD_SIZE / 2, y = top + TAG_HEIGHT / 2 - bob;
    context.save();
    context.beginPath();
    context.arc(x, y, HEAD_SIZE / 2, 0, Math.PI * 2);
    context.fillStyle = P.statusInk;
    context.fill();
    context.clip();
    // the face sits low in the head's square: raised so the eyes are near the middle of the circle
    sprites.drawHead(context, `${tag.sessionId}/${agent.id}`, x - 6, y - 8, 12);
    context.restore();
    context.strokeStyle = P.statusInk;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y, HEAD_SIZE / 2, 0, Math.PI * 2);
    context.stroke();
  });
  if (!extraAgents(tag)) return;
  context.fillStyle = P.quietTagText;
  context.fillText(`+${extraAgents(tag)}`, left + HEAD_SIZE + (shown.length - 1) * HEAD_STEP + TAG_GAP, top + 10);
}

/** A name tag, its top left corner at (left, top); one that waits for the user bobs a little. */
function paintNameTag(context: Context, sprites: SpriteSource, tag: NameTag, left: number, top: number, time: number, reducedMotion: boolean) {
  const width = tagWidth(context, tag);
  const asking = asks(tag.status);
  if (asking && !reducedMotion) top -= Math.floor(time / 600) % 2;
  context.save();
  context.textAlign = 'left';
  if (asking) {
    context.strokeStyle = P.askingTagHalo;
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(left - 1.5, top - 1.5, width + 3, TAG_HEIGHT + 3, TAG_HEIGHT / 2 + 1.5);
    context.stroke();
  }
  context.fillStyle = asking ? P.askingTag : P.tag;
  context.beginPath();
  context.roundRect(left, top, width, TAG_HEIGHT, TAG_HEIGHT / 2);
  context.fill();
  context.strokeStyle = tag.framed ? P.selection : asking ? P.askingTagEdge : tag.status === 'error' ? P.errorTagEdge : P.tagEdge;
  context.lineWidth = tag.framed ? 1 : asking ? 0.75 : 0.5;
  context.stroke();

  let x = left + TAG_PADDING;
  if (tag.status) {
    paintTagIcon(context, tag.status, left + 2, top + 2, time, reducedMotion);
    x = left + 2 + ICON_SIZE + TAG_GAP;
  }
  context.fillStyle = tag.colour;
  context.fillText(tag.name, x, top + 10);
  x += textWidthOf(context, tag.name);
  if (tag.branch) {
    x += TAG_GAP;
    const glyphTop = top + Math.floor((TAG_HEIGHT - BRANCH_GLYPH_HEIGHT) / 2);
    for (const [dx, dy] of BRANCH_GLYPH) rect(context, x + dx, glyphTop + dy, 1, 1, P.branch);
    x += BRANCH_GLYPH_WIDTH;
  }
  if (tag.tag) {
    x = separator(context, x, top);
    context.fillStyle = P.sessionTag;
    context.fillText(tag.tag, x, top + 10);
    x += textWidthOf(context, tag.tag);
  }
  if (tag.agents.length) paintTagAgents(context, sprites, tag, separator(context, x, top), top, time, reducedMotion);
  context.restore();
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

/** The badge over the numbers object while something new waits in its file: a dark "!" in a yellow bubble, half as big again, bobbing, its tail on `at`. */
function paintMetricsBadge(context: Context, at: Point, time: number) {
  const bob = Math.round(Math.sin(time / 260));
  paintIconBubble(context, at.x, at.y - 12 + bob, P.metricsBadge, EXCLAMATION, 1.5, P.outline);
}

const wallCache = new Map<Layout, { key: string; canvas: HTMLCanvasElement }>();
/** What hangs on a room's walls (windows, clock, TV), painted again every quarter of an hour. */
function wallItems(layout: Layout, lighting: Lighting, hour: number, festival: Festival | null, guests: readonly string[]): HTMLCanvasElement {
  const key = `${roomTheme()}@${Math.round(hour * 4)}`;
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
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.drawImage(backdrop, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const { layout } = scene.floor;
  context.drawImage(wallItems(layout, lighting, options.hour, options.festival, options.guests), 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  paintSunlight(context, lighting, glassesOf(layout));

  const characters = [...scene.characters.values()];
  const seated = characters.filter((character) => character.phase === 'seated');
  const occupied = new Set(seated.map((character) => character.seat));
  const isSelected = (character: Character) => options.openSessionIds.includes(character.person.sessionId);
  const isGhost = (character: Character) => options.ghostIds.has(character.person.sessionId);
  const ghostly = (character: Character, paint: (on: Context) => void) => (on: Context) => {
    if (!isGhost(character)) return paint(on);
    on.filter = GHOST_FILTER;
    on.globalAlpha = GHOST_ALPHA;
    paint(on);
    on.filter = 'none';
    on.globalAlpha = 1;
  };
  const layers: Layer[] = [];
  const bossAtDesk = scene.playerSpot?.atDesk === true;
  for (const piece of layout.furniture) layers.push({ depth: furnitureDepth(piece), paint: (on) => furniture.draw(on, piece) });
  for (const character of characters) {
    const pose = characterPose(character, options);
    const lift = character.phase === 'seated' ? scene.floor.seatLift(character.seat) : 0;
    layers.push({ depth: depthOf(character.position), paint: ghostly(character, (on) => paintPerson(on, sprites, character.person.id, character, pose, isSelected(character), lift)) });
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
    layers.push({ depth: furnitureDepth(piece) + 0.01, paint: ghostly(typist, (on) => sprites.drawTypingHand(on, typist.person.id, feet, hand, pose.step)) });
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
  const kit = themeKit();
  if (kit?.effects) paintThemeEffects(context, kit.effects(layout, time, lighting, options.hour), layers);
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

  // name tags and icons go on top of everything, so the furniture never hides them; a tag that would cover another moves up
  context.font = TAG_FONT;
  context.textAlign = 'center';
  const tags: { tag: NameTag; x: number; bottom: number; faint: boolean }[] = [];
  for (const character of characters) {
    // a ghost says nothing: no tag, no state, no Z's, until the pointer is on it
    if (isGhost(character) && options.hoveredId !== character.person.id) continue;
    const lift = character.phase === 'seated' ? scene.floor.seatLift(character.seat) : 0;
    const feet = raise(toScreen(character.position), lift);
    const head = feet.y - sprites.height(characterPose(character, options), character.person.id);
    if (options.dozing && character.phase === 'seated') paintZzz(context, feet.x, head - 4, options.reducedMotion ? 0 : options.time, character.blinkOffset);
    // the status and the sub-agents only once at the desk: walking in or out, it is just someone passing by
    const status = character.phase === 'seated' ? character.person.status : null;
    const noticed = status !== null || isSelected(character) || options.hoveredId === character.person.id;
    // what waits for the user stays at full strength, like the open session and the one under the pointer
    const calling = status !== null && status !== 'working';
    tags.push({
      x: feet.x, bottom: head - TAG_LIFT, faint: !calling && !isSelected(character) && options.hoveredId !== character.person.id,
      tag: {
        name: character.person.name, colour: noticed ? P.tagText : P.quietTagText, status, tag: character.person.tag, branch: character.person.branch,
        sessionId: character.person.sessionId, agents: character.phase === 'seated' ? character.person.agents : [], framed: isSelected(character),
      },
    });
  }
  const playerFeet = toScreen(scene.player.position);
  tags.push({
    x: playerFeet.x, bottom: playerFeet.y - playerLift - sprites.height(playerPose, PLAYER_ID) - TAG_LIFT, faint: options.hoveredId !== PLAYER_ID,
    tag: { name: options.playerName, colour: P.playerTagText, status: null, tag: null, sessionId: PLAYER_ID, agents: [], framed: false },
  });
  const boxes = tags.map(({ tag, x, bottom }) => { const width = tagWidth(context, tag); return { left: Math.round(x - width / 2), top: Math.round(bottom - TAG_HEIGHT), width, height: TAG_HEIGHT }; });
  stackLabels(boxes).forEach((top, index) => {
    context.globalAlpha = tags[index].faint ? FAINT_TAG_ALPHA : 1;
    paintNameTag(context, sprites, tags[index].tag, boxes[index].left, top, options.time, options.reducedMotion);
  });
  context.globalAlpha = 1;
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
    let above = head;
    if (hovered) {
      const tag: NameTag = { name: visitor.name, colour: P.tagText, status: null, tag: null, sessionId: visitor.id, agents: [], framed: false };
      const width = tagWidth(context, tag);
      above = Math.round(head - TAG_LIFT - TAG_HEIGHT);
      paintNameTag(context, sprites, tag, Math.round(feet.x - width / 2), above, options.time, options.reducedMotion);
    }
    const bob = options.reducedMotion ? 0 : Math.round(Math.sin((options.time + visitor.blinkOffset) / 500));
    // at a birthday party, they first wish it out loud (the second of two after the first), then show what they do
    const celebrated = options.festival === 'birthday' ? options.guests.filter((name) => name !== visitor.name) : [];
    const wishing = visitor.spot.activity === 'party' && celebrated.length > 0 && Math.floor(visitor.stayed / WISH_MS) === visitor.order;
    if (visitor.phase === 'staying' && wishing) paintSpeech(context, t.room.birthdayWish(celebrated), feet.x, above + 4);
    else if (visitor.phase === 'staying') paintActivity(context, visitor.spot.activity, feet.x, above - 1 + bob);
  }
}
