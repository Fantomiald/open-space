import { useEffect, useState } from 'react';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';

const IDLE_MS = 2000;

/** Tab hid everything but the room: how to bring it back, top right, faded out while the mouse rests. */
export function BareHint() {
  const words = t.room.bare;
  const hideUi = useSessions((s) => s.hideUi);
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    window.addEventListener('pointermove', wake);
    return () => { window.clearTimeout(timer); window.removeEventListener('pointermove', wake); };
  }, []);
  return (
    <button type="button" className="cp-button cp-bare-hint" data-idle={idle} onClick={() => hideUi(false)}>
      {words.before} <kbd className="cp-kbd">Tab</kbd> {words.after}
    </button>
  );
}
