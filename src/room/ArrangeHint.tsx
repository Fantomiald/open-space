import { useEffect, useState } from 'react';
import { useChromePlace } from '../command/Chrome.tsx';
import { CloseIcon } from '../command/Icons.tsx';
import { t } from '../i18n/index.ts';
import { ALT_KEY, ARRANGED_EVENT } from '../lib/drag.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { useSessions } from '../state/sessions.ts';

/**
 * A card at the bottom of the room saying that Alt moves the room and the windows, until it was used once on the room or
 * a window (or closed); for good with Preferences.alwaysArrangeHint, without its close button then.
 */
export function ArrangeHint() {
  const [seen, setSeen] = useState(() => readPreference('arrangeHintSeen', false));
  const always = useSessions((s) => s.preferences.alwaysArrangeHint === true);
  const place = useChromePlace('hint');
  useEffect(() => {
    const onArranged = () => setSeen(true);
    window.addEventListener(ARRANGED_EVENT, onArranged);
    return () => window.removeEventListener(ARRANGED_EVENT, onArranged);
  }, []);
  if (seen && !always) return null;
  const words = t.room.arrange;
  return (
    <aside className="cp-room__arrange" aria-label={words.title} {...place}>
      <ul>
        <li><kbd>{ALT_KEY}</kbd> + {words.move}</li>
        <li><kbd>{ALT_KEY}</kbd> + {words.zoom}</li>
      </ul>
      {!always && <button type="button" aria-label={words.close} title={words.close} onClick={() => { writePreference('arrangeHintSeen', true); setSeen(true); }}><CloseIcon /></button>}
    </aside>
  );
}
