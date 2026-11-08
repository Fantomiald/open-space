// Every theme of the room (see kit.ts), and the one the room is dressed in.
import type { Lighting } from '../lighting.ts';
import type { RoomTheme } from '../../../shared/room-themes.ts';
import { roomTheme, type ThemeKit } from './kit.ts';
import { BEACH } from './beach.ts';
import { CELLAR } from './cellar.ts';
import { DUNGEON } from './dungeon.ts';
import { FOREST } from './forest.ts';
import { PIRATE } from './pirate.ts';
import { SPACE } from './space.ts';
import { TOKYO } from './tokyo.ts';

/** The office is the room as it is: no kit, everything drawn as usual. */
const KITS: Readonly<Record<RoomTheme, ThemeKit | null>> = { office: null, space: SPACE, tokyo: TOKYO, dungeon: DUNGEON, beach: BEACH, pirate: PIRATE, forest: FOREST, cellar: CELLAR };

/** A room that keeps its own dress whatever the theme (the automatons' server room, themes/servers.ts), while it is shown. */
let dressed: ThemeKit | null = null;
/** Told to the page (the sky behind the room repaints) when a room puts on or takes off its own dress. */
export const DRESS_EVENT = 'cp:dress';
export function dressRoom(kit: ThemeKit | null) {
  if (kit === dressed) return;
  dressed = kit;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DRESS_EVENT));
}
/** A room wears its own dress (the festivals' sky stays out of it). */
export const isDressed = () => dressed !== null;

export const themeKit = (): ThemeKit | null => dressed ?? KITS[roomTheme()];
/** The light of the hour as the theme sees it. */
export const themedLighting = (lighting: Lighting): Lighting => themeKit()?.lighting?.(lighting) ?? lighting;
export { roomTheme, setRoomTheme } from './kit.ts';
export { ROOM_THEMES, type RoomTheme } from '../../../shared/room-themes.ts';
