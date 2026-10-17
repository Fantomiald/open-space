import { useEffect, useState } from 'react';

/** The current time, refreshed every `everyMs`, so "since 3 min" labels stay true. */
export function useNow(everyMs = 15_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
