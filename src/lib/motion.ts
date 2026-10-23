import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** A local opt-in never overrides the system asking for fewer animations. */
export const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || window.matchMedia(QUERY).matches;

export function useReducedMotion(force: boolean) {
  const [system, setSystem] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const update = () => setSystem(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return force || system;
}
