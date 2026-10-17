// Halloween on the walls (see FESTIVAL_PIECES in shared/room-layout.ts for the pumpkins). The office: a pumpkin and a
// ghost painted on the left wall, bats above the windows, cobwebs in the corners and a garland of orange and purple
// bulbs. The break room: a moon and a witch's hat on the left wall, spiders hanging on their threads, green and purple
// bulbs.
import { ROOM_PALETTE } from '../design/room-palette.ts';
import { ROOM } from '../../shared/room-layout.ts';
import type { Point } from './geometry.ts';
import { toArt } from './pixel-art.ts';
import { WALL, line, onWall, onWallAt, roomPointOnWall, type Context } from './wall-art.ts';

const C = ROOM_PALETTE.halloween;
export type Room = 'office' | 'lounge';

export const PUMPKIN = [
  '......gg.....',
  '.....gg......',
  '..OOoOOOoOO..',
  '.OOOOOOOOOOO.',
  'OOOkkOOOkkOOO',
  'OOOOOOOOOOOOO',
  'OOkOOkOkOOkOO',
  'OOOkkkkkkkOOO',
  '.OOOOOOOOOOO.',
  '..OOoOOOoOO..',
];
const GHOST = [
  '..WWWWW..',
  '.WWWWWWW.',
  'WWkWWWkWW',
  'WWkWWWkWW',
  'WWWWWWWWW',
  'WWWWkWWWW',
  'WWWWWWWWW',
  'WWWWWWWWW',
  'WWWWWWWWW',
  'WW.WWW.WW',
  'W...W...W',
];
const BAT = [
  'k.......k',
  'kk.k.k.kk',
  '.kkkkkkk.',
  '...k.k...',
];
export const MOON = [
  '...WWWW..',
  '..WWW....',
  '.WWW.....',
  '.WWW.....',
  '.WWW.....',
  '.WWWW....',
  '..WWWWW..',
  '...WWWW..',
];
const WITCH_HAT = [
  '......k....',
  '.....kk....',
  '....kkk....',
  '....kkkk...',
  '...kkkkk...',
  '...OOOOO...',
  '..kkkkkkk..',
  'kkkkkkkkkkk',
];
const SPIDER = [
  'k.k.k',
  '.kkk.',
  'kkkkk',
  '.kkk.',
  'k.k.k',
];
export const PAINT: Record<string, string> = { O: C.pumpkin, o: C.pumpkinDark, g: C.stem, k: C.carved, W: C.ghost };

/** A cobweb in a top corner: threads from the corner and two rings across them. */
function cobweb(context: Context, corner: Point, directions: readonly Point[]) {
  for (const direction of directions) line(context, corner, { x: corner.x + direction.x * 12, y: corner.y + direction.y * 12 }, C.web);
  for (const ring of [5, 9]) {
    for (let index = 0; index < directions.length - 1; index++) {
      const a = directions[index], b = directions[index + 1];
      line(context, { x: corner.x + a.x * ring, y: corner.y + a.y * ring }, { x: corner.x + b.x * ring, y: corner.y + b.y * ring }, C.web);
    }
  }
}

/** Where the garland's bulbs hang along the back wall: wall coordinates and colour. */
function bulbSpots(room: Room): { along: number; z: number; colour: string }[] {
  const spots: { along: number; z: number; colour: string }[] = [];
  for (let index = 0; index * 0.75 + 0.6 < ROOM.width; index++) {
    const odd = index % 2 === 1;
    spots.push({ along: 0.6 + index * 0.75, z: WALL - 4 - (odd ? 1.5 : 0), colour: odd ? C.bulbPurple : room === 'office' ? C.bulbOrange : C.stem });
  }
  return spots;
}

/** The garland's bulbs in room pixels, to light them and make them twinkle (draw.ts). */
export function halloweenBulbs(room: Room): { at: Point; colour: string }[] {
  return bulbSpots(room).map(({ along, z, colour }) => ({ at: roomPointOnWall('back', along, z), colour }));
}

/** Everything painted on the walls, at art resolution, over the walls of the backdrop. */
export function paintHalloweenWalls(context: Context, room: Room) {
  if (room === 'office') {
    onWall(context, PUMPKIN, PAINT, 'left', 2.2, 18);
    onWall(context, GHOST, PAINT, 'left', 5.4, 20);
    onWall(context, BAT, PAINT, 'left', 4.4, 36);
    for (const [x, z] of [[2.6, 42], [8.2, 44], [9.6, 41], [16.4, 43]]) onWall(context, BAT, PAINT, 'back', x, z);
  } else {
    onWall(context, MOON, { W: C.ghost }, 'left', 2.4, 30);
    onWall(context, WITCH_HAT, { k: C.carved, O: C.pumpkin }, 'left', 5.6, 18);
    for (const [x, z] of [[3.4, 40], [5.4, 44]]) onWall(context, BAT, PAINT, 'left', x, z);
    // spiders down their threads, from the top of the back wall
    for (const [x, length] of [[6.2, 9], [13.2, 6], [19.4, 12], [0.6, 7]] as const) {
      line(context, onWallAt('back', x + 2 / 8, WALL), onWallAt('back', x + 2 / 8, WALL - length), C.web);
      onWall(context, SPIDER, PAINT, 'back', x, WALL - length - 5);
    }
  }
  const bulbs = bulbSpots(room);
  bulbs.forEach((bulb, index) => { if (index) line(context, onWallAt('back', bulbs[index - 1].along, bulbs[index - 1].z), onWallAt('back', bulb.along, bulb.z), C.wire); });
  for (const { along, z, colour } of bulbs) { const at = onWallAt('back', along, z); context.fillStyle = colour; context.fillRect(Math.round(at.x), Math.round(at.y), 2, 2); }
  cobweb(context, onWallAt('back', 0, WALL), [{ x: -1, y: 0.5 }, { x: -0.6, y: 0.8 }, { x: 0, y: 1 }, { x: 0.6, y: 0.8 }, { x: 1, y: 0.5 }]);
  cobweb(context, onWallAt('back', ROOM.width, WALL), [{ x: -1, y: -0.5 }, { x: -0.8, y: 0.3 }, { x: 0, y: 1 }]);
  cobweb(context, { ...toArt({ x: 0, y: ROOM.depth }), y: toArt({ x: 0, y: ROOM.depth }).y - WALL }, [{ x: 1, y: -0.5 }, { x: 0.8, y: 0.3 }, { x: 0, y: 1 }]);
}
