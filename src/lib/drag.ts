// What moving things by hand shares: when a press becomes a drag, and the Alt key (Option on a Mac) that grabs a
// window or the room from anywhere.
import { useEffect, useState } from 'react';
import { IS_MAC } from './platform.ts';
import { writePreference } from './preferences.ts';

/** a press that moved less than this is still a click */
export const DRAG_THRESHOLD = 4;

export const startsDrag = (from: { x: number; y: number }, to: { x: number; y: number }) => Math.hypot(to.x - from.x, to.y - from.y) > DRAG_THRESHOLD;

let swallowNextAlt = false;

/**
 * After an Alt+drag: on Windows, letting go of Alt alone would then move the keyboard to the browser's menu.
 */
export const swallowAltRelease = () => { swallowNextAlt = true; };

/** Whether Alt is held; also `data-alt` on the root element, for the grab cursors. */
export function useAltKey(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const set = (value: boolean) => {
      setHeld(value);
      if (value) root.dataset.alt = '';
      else delete root.dataset.alt;
    };
    const onDown = (event: KeyboardEvent) => { if (event.key === 'Alt') set(true); };
    const onUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return;
      set(false);
      if (swallowNextAlt) event.preventDefault();
      swallowNextAlt = false;
    };
    const onBlur = () => set(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      set(false);
    };
  }, []);
  return held;
}

/** Whether the screen is wide enough for windows and the room to be moved by hand (the small-screen layout shows one). */
export const canArrange = () => window.matchMedia('(min-width: 60.01rem)').matches;

/** Fired once the room or a window was moved with Alt: the hint about it has done its job (ArrangeHint.tsx). */
export const ARRANGED_EVENT = 'cp:arranged';

export function markArranged() {
  writePreference('arrangeHintSeen', true);
  window.dispatchEvent(new Event(ARRANGED_EVENT));
}

/** The Alt key as the keyboard shows it. */
export const ALT_KEY = IS_MAC ? '⌥' : 'Alt';
