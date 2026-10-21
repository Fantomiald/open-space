// The places the room can be dressed as (src/room/themes): the office as it is, or a space shuttle, a neon Tokyo
// street, a dungeon, a beach bar, a pirate ship, a treehouse. Shared because the settings keep the user's choice.

export const ROOM_THEMES = ['office', 'space', 'tokyo', 'dungeon', 'beach', 'pirate', 'forest'] as const;
export type RoomTheme = (typeof ROOM_THEMES)[number];
export const DEFAULT_ROOM_THEME: RoomTheme = 'office';
export const isRoomTheme = (value: unknown): value is RoomTheme => ROOM_THEMES.some((theme) => theme === value);
