// Alt+drag moves the room, Alt+wheel (or a pinch on the trackpad) zooms it out and back, Alt+double-click puts it back in
// its place. The frame is applied as CSS variables on the stage and remembered per room (room-frame.ts).
import { useEffect, type RefObject } from 'react';
import { canArrange, markArranged, startsDrag, swallowAltRelease } from '../lib/drag.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { clampRoom, DEFAULT_ROOM_FRAME, panRoom, roomBox, sanitizeRoomFrames, zoomRoom, type Box, type RoomName } from '../state/room-frame.ts';
import { refreshFrost } from './Sky.tsx';

const SETTLE_MS = 220;

export function useRoomFrame(stage: RefObject<HTMLDivElement | null>, room: RoomName) {
  useEffect(() => {
    const element = stage.current!;
    const fit = element.parentElement!;
    let frame = sanitizeRoomFrames(readPreference('roomFrames', null))[room] ?? DEFAULT_ROOM_FRAME;

    // the room in its own place, as the layout puts it (centred in its area), whatever transform it carries
    const home = (): Box => {
      const area = fit.getBoundingClientRect(), width = element.offsetWidth, height = element.offsetHeight;
      return { left: area.left + (area.width - width) / 2, top: area.top + (area.height - height) / 2, width, height };
    };
    const bounds = (): Box => {
      const main = (element.closest('.cp-main') ?? document.body).getBoundingClientRect();
      const gutter = Number.parseFloat(getComputedStyle(element).getPropertyValue('--gutter')) * 16 || 12;
      return { left: main.left + gutter, top: main.top + gutter, width: main.width - 2 * gutter, height: main.height - 2 * gutter };
    };
    const show = () => {
      if (!canArrange()) { for (const name of ['--room-x', '--room-y', '--room-scale']) element.style.removeProperty(name); return; }
      const from = home(), box = roomBox(from, clampRoom(frame, from, bounds()));
      element.style.setProperty('--room-x', `${box.left - from.left}px`);
      element.style.setProperty('--room-y', `${box.top - from.top}px`);
      element.style.setProperty('--room-scale', String(box.width / from.width));
      refreshFrost();
    };
    const save = () => writePreference('roomFrames', { ...sanitizeRoomFrames(readPreference('roomFrames', null)), [room]: frame });
    // what is shown (clamped to this window) becomes the frame, so a move starts from where the room is seen
    const settle = () => { frame = clampRoom(frame, home(), bounds()); };

    let press: { x: number; y: number; id: number } | null = null, dragging = false;
    const onPointerDown = (event: PointerEvent) => {
      if (!event.altKey || event.button !== 0 || !canArrange()) return;
      settle();
      press = { x: event.clientX, y: event.clientY, id: event.pointerId };
      dragging = false;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      // let go somewhere the stage never heard of it (over a window, out of the page): the press is over
      if ((event.buttons & 1) === 0) { press = null; dragging = false; delete element.dataset.dragging; return; }
      if (!dragging) {
        if (!startsDrag(press, { x: event.clientX, y: event.clientY })) return;
        dragging = true;
        element.setPointerCapture(event.pointerId);
        element.dataset.dragging = '';
      }
      frame = panRoom(frame, home(), bounds(), event.clientX - press.x, event.clientY - press.y);
      press = { ...press, x: event.clientX, y: event.clientY };
      show();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      press = null;
      if (!dragging) return;
      delete element.dataset.dragging;
      swallowAltRelease();
      save();
      markArranged();
      dragging = false;
      // the click that ends a drag is not a click on the room (none comes when the pointer was let go elsewhere)
      const swallow = (click: MouseEvent) => click.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    };
    let saving = 0;
    const onWheel = (event: WheelEvent) => {
      if (!(event.altKey || event.ctrlKey) || !canArrange()) return;
      event.preventDefault();
      settle();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      frame = zoomRoom(frame, home(), bounds(), { x: event.clientX, y: event.clientY }, Math.exp(-delta / 300));
      show();
      window.clearTimeout(saving);
      saving = window.setTimeout(() => { save(); markArranged(); }, 200);
    };
    let settling = 0;
    const onDoubleClick = (event: MouseEvent) => {
      if (!event.altKey || !canArrange()) return;
      event.preventDefault();
      frame = DEFAULT_ROOM_FRAME;
      element.dataset.settling = '';
      window.clearTimeout(settling);
      settling = window.setTimeout(() => { delete element.dataset.settling; refreshFrost(); }, SETTLE_MS);
      show();
      save();
    };

    show();
    const observer = new ResizeObserver(show);
    observer.observe(fit);
    window.addEventListener('resize', show);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('dblclick', onDoubleClick);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', show);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('dblclick', onDoubleClick);
      window.clearTimeout(saving);
      window.clearTimeout(settling);
    };
  }, [stage, room]);
}
