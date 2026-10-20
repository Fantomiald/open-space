import { useEffect, useState } from 'react';
import { CloseIcon } from '../command/Icons.tsx';
import { t } from '../i18n/index.ts';
import { ALT_KEY, ARRANGED_EVENT } from '../lib/drag.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';

/** A card at the bottom of the room saying that Alt moves the room and the windows, until it was used once (or closed). */
export function ArrangeHint() {
  const [seen, setSeen] = useState(() => readPreference('arrangeHintSeen', false));
  useEffect(() => {
    const onArranged = () => setSeen(true);
    window.addEventListener(ARRANGED_EVENT, onArranged);
    return () => window.removeEventListener(ARRANGED_EVENT, onArranged);
  }, []);
  if (seen) return null;
  const words = t.room.arrange;
  return (
    <aside className="cp-room__arrange" aria-label={words.title}>
      <ul>
        <li><kbd>{ALT_KEY}</kbd> + {words.move}</li>
        <li><kbd>{ALT_KEY}</kbd> + {words.zoom}</li>
      </ul>
      <button type="button" aria-label={words.close} title={words.close} onClick={() => { writePreference('arrangeHintSeen', true); setSeen(true); }}><CloseIcon /></button>
    </aside>
  );
}
