// A theme dresses the room as another place (a space shuttle, a neon Tokyo street, a dungeon): its own walls, floor,
// door, windows, sky, furniture and lights, drawn in code like the office. Whatever a theme leaves out is drawn as in
// the office. Walls and floor are painted at art resolution (see backdrop.ts and wall-art.ts for the helpers).
import type { Layout, PieceKind, WallItem } from '../../../shared/room-layout.ts';
import { DEFAULT_ROOM_THEME, type RoomTheme } from '../../../shared/room-themes.ts';
import type { ROOM_PALETTE } from '../../design/room-palette.ts';
import type { Point } from '../geometry.ts';
import type { Lighting } from '../lighting.ts';
import type { Design } from '../pixel-furniture.ts';
import type { ParticleKind, VortexForm } from '../portal.ts';


type Context = CanvasRenderingContext2D;

/** The colours of the room's structure: the floor's edge, the slab, the walls' plain faces, their top and cut ends. */
type Office = Omit<typeof ROOM_PALETTE.room, 'city' | 'cityFar' | 'cityLit'>;
export type Structure = { [key in keyof Omit<Office, 'planks' | 'rugs'>]: string } & {
  planks: readonly string[];
  rugs: Readonly<Record<keyof Office['rugs'], string>>;
};

/**
 * Something that moves or glows, painted every frame after the light of the hour (so the night does not dim it), in
 * room pixels. It shows only where nothing nearer hides it: whoever and whatever is drawn in front of `depth` (see
 * furnitureDepth and depthOf) is cut out of it, at their exact shape. On a wall: WALL_EFFECT; on top of everything: Infinity.
 */
export interface ThemeEffect { depth: number; paint(context: Context): void }
export const WALL_EFFECT = -1;

/**
 * How the teleporter's light looks in a theme (its frame is the theme's `furniture.portal`): what turns in its ring and
 * in which tones (the deep, what moves, the bright heart), the light it lays on the floor and the column that takes
 * someone away (its edge, its core), what comes out of it and in which colours, and what glows and moves on its frame.
 */
export interface PortalStyle {
  vortex: VortexForm;
  tones: readonly [string, string, string];
  light: string;
  core: string;
  particles: ParticleKind;
  colours: readonly string[];
  /**
   * painted every frame over the frame (so it shines at night); `at`: a point of the ring's plane in room pixels,
   * `across` and `up` art pixels from its middle, `out` tiles before it
   */
  frame?(context: Context, at: (across: number, up: number, out?: number) => Point, time: number): void;
}

/** A light added to the room's light map: above floor point (x, y) in tiles, `height` in room pixels. */
export interface ThemeLight { x: number; y: number; height: number; radius: number; colour: string; strength: number }

export interface ThemeKit {
  structure: Structure;
  /** the faces of both walls, instead of the office's panelling (their top and cut ends stay, in `structure`'s colours) */
  paintWalls?(context: Context, layout: Layout): void;
  /** the floor's surface, instead of the planks; the rugs go over it unless `rugs` is false */
  paintFloor?(context: Context, layout: Layout): void;
  rugs?: boolean;
  /** over the slab under the floor: the two faces from `left` to `front` to `right`, `height` high, then the underside */
  paintSlab?(context: Context, left: Point, front: Point, right: Point, height: number, underside: number): void;
  /** the door on the left wall, from `from` to `to` along it (tiles), `height` art pixels high: the opening must stay */
  paintDoor?(context: Context, from: number, to: number, height: number): void;
  /** a window of the back wall, the `index`-th of `count` from the left */
  paintWindow?(context: Context, item: WallItem, lighting: Lighting, index: number, count: number): void;
  paintClock?(context: Context, item: WallItem, hour: number): void;
  paintTv?(context: Context, item: WallItem): void;
  /** the page behind the room, and what moves in it (`seconds` stays at 0 when the system asks for less motion) */
  paintSky?(context: Context, width: number, height: number, lighting: Lighting): void;
  paintSkyMotion?(context: Context, width: number, height: number, seconds: number, lighting: Lighting): void;
  /** how often what moves in the sky moves on, in ms (once a second by default) */
  skyFrameMs?: number;
  /** false: no shaft of light from the windows on the walls (round or blind windows) */
  wallBeam?: boolean;
  /** the teleporter's light, with the theme's `furniture.portal` */
  portal?: PortalStyle;
  /** the theme's version of a piece (the props and festival pieces stay the office's unless given) */
  furniture?: Partial<Record<PieceKind, Design>>;
  /** the light of the hour in this place (an underground dungeon stays dim at noon); the room and the page's sky follow it */
  lighting?(lighting: Lighting): Lighting;
  /** lights of the theme's own, added to the room's (lamps, screens, the door) */
  lights?(layout: Layout, lighting: Lighting): ThemeLight[];
  /** false: none of the office's lamps (floor lamp, desk lamp, coffee machine, water cooler, the city at night), only the screens and the door; `lights` brings the theme's */
  officeLamps?: boolean;
  /** what moves and glows (flames, neon flicker, sparks), each behind whatever stands in front of it */
  effects?(layout: Layout, time: number, lighting: Lighting, hour: number): ThemeEffect[];
  /** the colour of the light of the screens in use (desks, the TV), and of the doorway; false: the doorway gives none */
  screenLight?: string;
  doorLight?: string | false;
}

let current: RoomTheme = DEFAULT_ROOM_THEME;
export const roomTheme = () => current;
export function setRoomTheme(theme: RoomTheme) { current = theme; }
