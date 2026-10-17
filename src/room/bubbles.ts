// Speech bubbles, like the old hotel games: each new bubble appears on a fixed lane above the room, at the
// speaker's x, and pushes the older ones one row up. Old or pushed-out bubbles fade, then go.

export interface Bubble {
  id: number;
  /** the session the words belong to: a click on the bubble opens it */
  sessionId: string;
  /** before the words: the speaker's title */
  label: string;
  text: string;
  /** the speaker's x on the canvas when they spoke */
  x: number;
  fromUser: boolean;
  /** the speaker's face (an image URL), at the start of the bubble */
  head: string;
  /** 0 = the newest, on the lane; each newer bubble adds 1 */
  row: number;
  bornAt: number;
  /** set once the bubble starts to fade out */
  fadingSince: number | null;
}

/** Canvas y of the lane where new bubbles appear (in the empty band above the room), and how far up each older row goes. */
export const BUBBLE_LANE = 72;
export const BUBBLE_ROW_HEIGHT = 34;
export const VISIBLE_ROWS = 2;
const LIFETIME_MS = 9000;
/** Must match the opacity transition of .cp-room__bubble in room.css. */
const FADE_MS = 600;
const TEXT_MAX = 150;

/** Where the first block of a message ends: a blank line, or a list starting. */
const BLOCK_BREAK = /\n\s*\n|\n[-+]\s|\n\d+\.\s/;

const withoutMarks = (message: string) => message
  .replace(/```[\s\S]*?(```|$)/g, ' ')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[`*_#>]+/g, '');

/** The first sentence of a message, without markdown marks, shortened to fit a bubble. */
export function bubbleText(message: string): string {
  const plain = withoutMarks(message).split(BLOCK_BREAK)[0].replace(/\s+/g, ' ').trim();
  const sentence = /^.+?[.!?…](?=\s|$)/.exec(plain)?.[0] ?? plain;
  return sentence.length > TEXT_MAX ? `${sentence.slice(0, TEXT_MAX - 1).trimEnd()}…` : sentence;
}

/**
 * The bubble of a message still being written, as soon as it will not change any more: its first sentence is over
 * (a full stop and a space, or the end of the first block), or already too long for a bubble. Null until then.
 */
export function earlyBubbleText(draft: string): string | null {
  const blocks = withoutMarks(draft).split(BLOCK_BREAK);
  const first = blocks[0].replace(/\s+/g, ' ').trimStart();
  const settled = blocks.length > 1 || /[.!?…]\s/.test(first) || first.length > TEXT_MAX;
  return settled ? bubbleText(draft) || null : null;
}

/** Adds a bubble on the lane; the others move one row up, and the ones pushed past the top start fading. */
export function pushBubble(stack: readonly Bubble[], bubble: Omit<Bubble, 'row' | 'fadingSince'>): Bubble[] {
  const raised = stack.map((old) => {
    const row = old.row + 1;
    const fadingSince = old.fadingSince ?? (row >= VISIBLE_ROWS ? bubble.bornAt : null);
    return { ...old, row, fadingSince };
  });
  return [...raised, { ...bubble, row: 0, fadingSince: null }];
}

/** Starts fading the bubbles that lived long enough and drops the ones that finished fading. Same array when nothing changes. */
export function pruneBubbles(stack: readonly Bubble[], now: number): readonly Bubble[] {
  let changed = false;
  const next: Bubble[] = [];
  for (const bubble of stack) {
    if (bubble.fadingSince !== null && now - bubble.fadingSince >= FADE_MS) { changed = true; continue; }
    if (bubble.fadingSince === null && now - bubble.bornAt >= LIFETIME_MS) { changed = true; next.push({ ...bubble, fadingSince: now }); continue; }
    next.push(bubble);
  }
  return changed ? next : stack;
}
