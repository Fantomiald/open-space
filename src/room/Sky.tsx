import { useEffect, useRef } from 'react';
import type { Festival } from '../../shared/festivals.ts';
import { useSessions } from '../state/sessions.ts';
import { currentHour, lightingAt } from './lighting.ts';
import { SKY_PIXEL, paintClouds, paintSky, paintSkyFestival, skyIsBusy } from './sky.ts';

/** How often what moves in the sky moves on: the clouds go a sky pixel a second at most, snow and fireworks need more. */
const CLOUD_MS = 1000;
const FESTIVAL_MS = 100;
/** CSS pixels per pixel of the frost, and how often it follows what moves behind the panes. */
const FROST_PIXEL = 12;
const FROST_MS = 1000;

/**
 * The sky behind the page, at the room's hour (or the hour being tried): painted again each quarter of an hour; its
 * clouds (and the festival's snow or fireworks) move on a layer of their own, still when the tab is hidden or the
 * system asks for less motion.
 */
export function Sky({ festival }: { festival: Festival | null }) {
  const sky = useRef<HTMLCanvasElement>(null);
  const moving = useRef<HTMLCanvasElement>(null);
  const previewHour = useSessions((s) => s.preview.hour);
  useEffect(() => {
    const back = sky.current!, front = moving.current!;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let painted = '';
    let lighting = lightingAt(previewHour ?? currentHour());
    const move = () => {
      const context = front.getContext('2d')!;
      const seconds = still ? 0 : Date.now() / 1000;
      paintClouds(context, front.width, front.height, lighting, seconds);
      if (!still) paintSkyFestival(context, front.width, front.height, festival, lighting, seconds);
    };
    const paint = () => {
      const hour = previewHour ?? currentHour();
      const width = Math.ceil(window.innerWidth / SKY_PIXEL), height = Math.ceil(window.innerHeight / SKY_PIXEL);
      const key = `${width}x${height}@${Math.round(hour * 4)}`;
      if (key === painted) return;
      painted = key;
      lighting = lightingAt(hour);
      for (const canvas of [back, front]) { canvas.width = width; canvas.height = height; }
      paintSky(back.getContext('2d')!, width, height, lighting);
      move();
    };
    paint();
    const hourly = window.setInterval(paint, 60_000);
    const frames = still ? undefined : window.setInterval(() => { if (!document.hidden) move(); }, skyIsBusy(festival) ? FESTIVAL_MS : CLOUD_MS);
    window.addEventListener('resize', paint);
    return () => { window.clearInterval(hourly); window.clearInterval(frames); window.removeEventListener('resize', paint); };
  }, [previewHour, festival]);
  useEffect(() => frost([sky.current!, moving.current!]), []);
  return <><canvas ref={sky} className="cp-sky" /><canvas ref={moving} className="cp-sky" /></>;
}

/**
 * The frost of the glass panes (--frost, see --glass-surface in tokens.css): the sky and the rooms behind the panes,
 * blurred into an image of a pixel per FROST_PIXEL, smoothed back up by the browser. Kept up to date every FROST_MS
 * while the tab is visible; the next image is decoded before it replaces the last one, so no frame goes without.
 */
function frost(skies: readonly HTMLCanvasElement[]) {
  const root = document.documentElement;
  const sharp = document.createElement('canvas'), blurred = document.createElement('canvas');
  let shown: string | null = null, waiting = false;
  const update = () => {
    if (document.hidden || waiting) return;
    const width = Math.ceil(window.innerWidth / FROST_PIXEL), height = Math.ceil(window.innerHeight / FROST_PIXEL);
    for (const canvas of [sharp, blurred]) if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = sharp.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    for (const canvas of skies) context.drawImage(canvas, 0, 0, width, height);
    for (const room of document.querySelectorAll<HTMLCanvasElement>('.cp-room__canvas')) {
      const stage = (room.closest('.cp-room__stage') ?? room).getBoundingClientRect(), box = room.getBoundingClientRect();
      if (!stage.width) continue;
      context.save();
      context.beginPath();
      context.rect(stage.left / FROST_PIXEL, stage.top / FROST_PIXEL, stage.width / FROST_PIXEL, stage.height / FROST_PIXEL);
      context.clip();
      context.drawImage(room, box.left / FROST_PIXEL, box.top / FROST_PIXEL, box.width / FROST_PIXEL, box.height / FROST_PIXEL);
      context.restore();
    }
    // the sharp image under the blurred one: the blur fades out at the edges, the sharp one fills in
    const glass = blurred.getContext('2d')!;
    glass.drawImage(sharp, 0, 0);
    glass.filter = 'blur(2px) saturate(1.6)';
    glass.drawImage(sharp, 0, 0);
    glass.filter = 'none';
    waiting = true;
    blurred.toBlob((blob) => {
      if (!blob) { waiting = false; return; }
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.src = url;
      image.decode().then(() => {
        root.style.setProperty('--frost', `url(${url})`);
        if (shown) URL.revokeObjectURL(shown);
        shown = url;
      }, () => URL.revokeObjectURL(url)).finally(() => { waiting = false; });
    });
  };
  update();
  const timer = window.setInterval(update, FROST_MS);
  window.addEventListener('resize', update);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('resize', update);
    root.style.removeProperty('--frost');
    if (shown) URL.revokeObjectURL(shown);
  };
}
