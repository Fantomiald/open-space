// Where the room sits and how big it is, once moved with Alt+drag or zoomed with Alt+wheel. The frame is kept relative to
// the room's own place (its largest 4:3 in its area), so it survives a resized window. Pure functions.

export interface Box { left: number; top: number; width: number; height: number }

/** `x` and `y` in fractions of the room's size at its own place, `scale` from MIN_ROOM_SCALE to 1 (its own size). */
export interface RoomFrame { x: number; y: number; scale: number }

export const DEFAULT_ROOM_FRAME: RoomFrame = { x: 0, y: 0, scale: 1 };
/** smaller, the people and their tags stop being readable */
export const MIN_ROOM_SCALE = 0.6;

export type RoomName = 'office' | 'lounge';

export const roomBox = (home: Box, frame: RoomFrame): Box => ({
  left: home.left + frame.x * home.width, top: home.top + frame.y * home.height, width: home.width * frame.scale, height: home.height * frame.scale,
});

const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const frameOf = (home: Box, box: Box): RoomFrame => ({ x: (box.left - home.left) / home.width, y: (box.top - home.top) / home.height, scale: box.width / home.width });

/** The frame with its scale bounded and the room wholly inside `bounds`. */
export function clampRoom(frame: RoomFrame, home: Box, bounds: Box): RoomFrame {
  const box = roomBox(home, { ...frame, scale: within(frame.scale, MIN_ROOM_SCALE, 1) });
  const left = within(box.left, bounds.left, Math.max(bounds.left, bounds.left + bounds.width - box.width));
  const top = within(box.top, bounds.top, Math.max(bounds.top, bounds.top + bounds.height - box.height));
  return frameOf(home, { ...box, left, top });
}

export function panRoom(frame: RoomFrame, home: Box, bounds: Box, dx: number, dy: number): RoomFrame {
  return clampRoom({ ...frame, x: frame.x + dx / home.width, y: frame.y + dy / home.height }, home, bounds);
}

/** Zoomed by `factor`, the point under the pointer staying under it (until the bounds push the room back in). */
export function zoomRoom(frame: RoomFrame, home: Box, bounds: Box, pointer: { x: number; y: number }, factor: number): RoomFrame {
  const box = roomBox(home, frame);
  const scale = within(frame.scale * factor, MIN_ROOM_SCALE, 1);
  const width = home.width * scale, height = home.height * scale;
  const left = pointer.x - ((pointer.x - box.left) / box.width) * width;
  const top = pointer.y - ((pointer.y - box.top) / box.height) * height;
  return clampRoom(frameOf(home, { left, top, width, height }), home, bounds);
}

const isFrame = (value: unknown): value is RoomFrame =>
  typeof value === 'object' && value !== null && ['x', 'y', 'scale'].every((key) => Number.isFinite((value as Record<string, unknown>)[key]));

/** The frames saved in the browser, without whatever an older version or a broken value left there. */
export function sanitizeRoomFrames(raw: unknown): Partial<Record<RoomName, RoomFrame>> {
  if (typeof raw !== 'object' || raw === null) return {};
  const frames: Partial<Record<RoomName, RoomFrame>> = {};
  for (const room of ['office', 'lounge'] as const) {
    const frame = (raw as Record<string, unknown>)[room];
    if (isFrame(frame)) frames[room] = { x: frame.x, y: frame.y, scale: frame.scale };
  }
  return frames;
}
