import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
let query: MediaQueryList | undefined;
function systemReduces() {
  query ??= window.matchMedia(QUERY);
  return query.matches;
}

/** For what CSS cannot reach (the room's canvas, scrolling): the setting (data-motion, see App.tsx) or the system asks for less motion. */
export const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || systemReduces();

/** The same, as a React value that follows a change of the system's preference. */
export function useReducedMotion(force: boolean) {
  const [system, setSystem] = useState(systemReduces);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => setSystem(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return force || system;
}
