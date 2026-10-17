import { useEffect, useMemo, useState } from 'react';
import { festivalDay, monthDay, type FestivalDay } from '../../shared/festivals.ts';
import { useSessions } from '../state/sessions.ts';

const CHECK_EVERY_MS = 10 * 60_000;
const NONE: FestivalDay = { festival: null, guests: [] };

/**
 * Today's festival for the crew, and who it is for (it changes at midnight, so the day is checked every few minutes),
 * unless the preview menu shows another; none when the user turned the festivals off.
 */
export function useFestival(): FestivalDay {
  const [day, setDay] = useState(() => monthDay(new Date()));
  const preview = useSessions((s) => s.preview.festival);
  const crew = useSessions((s) => s.crew);
  const enabled = useSessions((s) => s.preferences.festivals);
  useEffect(() => {
    const timer = window.setInterval(() => setDay(monthDay(new Date())), CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => (preview === undefined && !enabled ? NONE : festivalDay(new Date(), crew, preview)), [day, preview, crew, enabled]);
}
