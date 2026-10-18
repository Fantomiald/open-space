// What a visitor of the crew is doing (src/room/visitors.ts), as a tiny pixel icon in a bubble above their head,
// shaped like a session's status (see paintStatus in draw.ts) but white, so it does not read as one.
import { ROOM_PALETTE } from '../design/room-palette.ts';
import type { Activity } from './visitors.ts';

const C = ROOM_PALETTE.activity;

/** 9 x 8 pixels each; a letter is a colour of the key below, a dot is nothing. */
const ICONS: Readonly<Record<Activity, readonly string[]>> = {
  // a mug, steaming
  coffee: ['..s..s...', '.s..s....', '..s..s...', 'mmmmmmm..', 'mcccccmmm', 'mmmmmmm.m', 'mmmmmmmmm', '.mmmmm...'],
  water: ['....w....', '...www...', '...wlw...', '..wwlww..', '.wwwlwww.', '.wwwwwww.', '..wwwww..', '...www...'],
  // a bird, seen out of the window
  window: ['....bb...', '...bkbbo.', '...bbbb..', 'bb.bbbb..', '.bbbbbb..', '..bbbbb..', '...o.o...', '.........'],
  // an open book
  books: ['rrrr.rrrr', 'rpppkpppr', 'rpkpkpkpr', 'rpppkpppr', 'rpkpkpkpr', 'rpppkpppr', 'rrrrkrrrr', '....k....'],
  // a phone, on the sofa
  sofa: ['..kkkkk..', '..kssskk.', '..ksssk..', '..ksssk..', '..ksssk..', '..ksssk..', '..kkkkk..', '..kk.kk..'],
  // a balloon, at the party
  party: ['...rrr...', '..rrhrr..', '..rhrrr..', '..rrrrr..', '...rrr...', '....r....', '....k....', '...k.....'],
};

const KEY: Readonly<Record<string, string>> = {
  s: C.steam, m: C.mug, c: C.coffee, w: C.water, l: C.waterLight, k: C.ink, p: C.pages, b: C.bird, o: C.beak,
  r: C.cover, h: C.shine,
};
/** Letters whose colour depends on the icon (the same letter means two things). */
const OWN_KEY: Partial<Record<Activity, Readonly<Record<string, string>>>> = {
  sofa: { s: C.screen },
  party: { r: C.balloon },
};

/** The bubble with the activity's icon, the tip of its little tail at (x, y) in room pixels, just above the head. */
export function paintActivity(context: CanvasRenderingContext2D, activity: Activity, x: number, y: number) {
  const left = Math.round(x - 8), top = Math.round(y - 15);
  context.fillStyle = C.ink;
  context.beginPath(); context.roundRect(left - 1, top - 1, 17, 14, 3); context.fill();
  context.fillStyle = C.bubble;
  context.beginPath(); context.roundRect(left, top, 15, 12, 2); context.fill();
  // the tail, pointing down at the head
  context.fillStyle = C.ink;
  context.fillRect(left + 6, top + 12, 3, 2);
  context.fillStyle = C.bubble;
  context.fillRect(left + 7, top + 11, 1, 2);
  const colours = { ...KEY, ...OWN_KEY[activity] };
  ICONS[activity].forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const colour = colours[row[dx]];
      if (!colour) continue;
      context.fillStyle = colour;
      context.fillRect(left + 3 + dx, top + 2 + dy, 1, 1);
    }
  });
}
