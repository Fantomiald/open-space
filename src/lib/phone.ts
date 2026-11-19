import { useEffect, useState } from 'react';

// A touch screen without hover, small in either orientation: a phone, not a Mac window made narrow nor a tablet
const QUERY = '(hover: none) and (pointer: coarse) and (max-width: 40rem), (hover: none) and (pointer: coarse) and (max-height: 30rem)';

export function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => setPhone(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return phone;
}
