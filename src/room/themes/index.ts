// Every theme of the room (see kit.ts), and the one the room is dressed in.
import type { Lighting } from '../lighting.ts';
import type { RoomTheme } from '../../../shared/room-themes.ts';
import { roomTheme, type ThemeKit } from './kit.ts';
import { BEACH } from './beach.ts';
import { DUNGEON } from './dungeon.ts';
import { FOREST } from './forest.ts';
import { PIRATE } from './pirate.ts';
import { SPACE } from './space.ts';
import { TOKYO } from './tokyo.ts';

/** The office is the room as it is: no kit, everything drawn as usual. */
const KITS: Readonly<Record<RoomTheme, ThemeKit | null>> = { office: null, space: SPACE, tokyo: TOKYO, dungeon: DUNGEON, beach: BEACH, pirate: PIRATE, forest: FOREST };

export const themeKit = (): ThemeKit | null => KITS[roomTheme()];
/** The light of the hour as the theme sees it. */
export const themedLighting = (lighting: Lighting): Lighting => themeKit()?.lighting?.(lighting) ?? lighting;
export { roomTheme, setRoomTheme } from './kit.ts';
export { ROOM_THEMES, type RoomTheme } from '../../../shared/room-themes.ts';
