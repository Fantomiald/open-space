import { useEffect, useState } from 'react';

// A touch screen without hover, small in either orientation: a phone, not a Mac window made narrow nor a tablet
const QUERY = '(hover: none) and (pointer: coarse) and (max-width: 40rem), (hover: none) and (pointer: coarse) and (max-height: 30rem)';

/** Whether the page matches a media query, followed as it changes. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export const usePhone = () => useMediaQuery(QUERY);
