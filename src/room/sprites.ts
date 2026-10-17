// How people are drawn: the room goes through a SpriteSource, so the drawing (chibi.ts) can change without touching
// the rest of the room.
import type { Point } from './geometry.ts';

/** Where someone faces on screen: the room only has the four diagonal directions of an isometric grid. */
export type Direction = 'down-right' | 'down-left' | 'up-right' | 'up-left';
export type Posture = 'stand' | 'walk' | 'sit';

/** What the arms do: typing at the desk, or one raised (to ask something). */
export type Gesture = 'none' | 'typing' | 'raising';

/** `step`: the frame of walking, typing or waving (two of each). `smiling`: a finished turn waits to be seen. */
export interface Pose { direction: Direction; posture: Posture; step: 0 | 1; blinking: boolean; smiling: boolean; gesture: Gesture }

export interface SpriteSource {
  /** Draws someone with their feet at (x, y) in room pixels. */
  draw(context: CanvasRenderingContext2D, personId: string, pose: Pose, x: number, y: number): void;
  /** How far above the feet the top of the head (or of a hat) is, in room pixels: the name tag and the status icon go above. */
  height(pose: Pose, personId?: string): number;
  /**
   * Draws the near forearm and the hand of someone typing at a desk, facing down-left: from their elbow (found from
   * `feet`, where the sprite was drawn) to `hand`, on the keys. Drawn after the desk, which they lie on. `step`: the
   * hand up (1) or down (0).
   */
  drawTypingHand(context: CanvasRenderingContext2D, personId: string, feet: Point, hand: Point, step: 0 | 1): void;
  /** Draws someone's face, `size` room pixels wide, its top left corner at (x, y). */
  drawHead(context: CanvasRenderingContext2D, personId: string, x: number, y: number, size: number): void;
}

/** A small stable number from a text, so the same person always gets the same look. */
export function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

/** When in the blinking cycle someone is, so the room does not blink all at once. */
export const blinkOffsetOf = (id: string) => hash(id) % 4000;
