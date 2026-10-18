// The numbers object in the office (the object METRICS_OBJECT picks, drawn in pixel-furniture.ts): when its badge
// shows, and where it floats. Pure, so the tests read it without a browser.
import type { FurniturePiece, MetricsKind } from '../../shared/room-layout.ts';
import { toScreen, type Point } from './geometry.ts';

/** Where the badge's tail points, above each object: a floor point from the piece's corner (tiles), and how high (room pixels). */
const BADGE_SPOTS: Readonly<Record<MetricsKind, { x: number; y: number; z: number }>> = {
  cash: { x: 0.3, y: 0.3, z: 50 },
  metricsTv: { x: 0.12, y: 0.4, z: 82 },
  ticker: { x: 0.1, y: 0.4, z: 84 },
  piggyBank: { x: 1, y: 0.3, z: 76 },
};

/** Something new waits in the numbers file, and the panel that shows them is closed (opening it clears the badge before the server says so). */
export const showsMetricsBadge = (unread: boolean, panelOpen: boolean) => unread && !panelOpen;

/** Where the badge's tail points on the canvas, in room pixels. */
export function metricsBadgeAt(piece: FurniturePiece): Point {
  const spot = BADGE_SPOTS[piece.kind as MetricsKind];
  const floor = toScreen({ x: piece.x + spot.x, y: piece.y + spot.y });
  return { x: floor.x, y: floor.y - spot.z };
}
