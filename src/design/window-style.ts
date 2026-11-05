import type { WindowStyle } from '../../shared/protocol.ts';
import type { RoomTheme } from '../../shared/room-themes.ts';

/** The window style "match" gives each office theme. */
const MATCHING: Record<RoomTheme, WindowStyle> = { office: 'classic', space: 'space', tokyo: 'neon', dungeon: 'dungeon', beach: 'beach', pirate: 'pirate', forest: 'forest', cellar: 'hacker' };

/** The style the windows are dressed in (data-window-style, tokens.css). */
export function shownWindowStyle(style: WindowStyle, theme: RoomTheme): WindowStyle {
  return style === 'match' ? MATCHING[theme] : style;
}
