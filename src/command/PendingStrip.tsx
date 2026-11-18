// What a session leaves to do, above its message field once its turn is over: its own lines (set_pending), then what
// git says of its folder. The user answers in the field; the cross removes a line for good (the agent cannot set it
// again), Later moves the session down to the ready ones in the Status panel until that changes, and folds the list.
import { use, useState } from 'react';
import type { SessionInfo } from '../../shared/protocol.ts';
import { Tooltip } from '../design/Tooltip.tsx';
import { t } from '../i18n/index.ts';
import { gitSummary } from '../state/pending.ts';
import { isPutOff, usePendingLater } from '../state/pending-later.ts';
import { isWorking } from '../state/queue.ts';
import { useSessions } from '../state/sessions.ts';
import { ChevronDownIcon, CloseIcon } from './Icons.tsx';
import { WindowCompactContext } from './useWindowDrag.ts';

export function PendingStrip({ session }: { session: SessionInfo }) {
  const send = useSessions((s) => s.send);
  const later = usePendingLater((s) => s.later);
  const putOff = usePendingLater((s) => s.putOff);
  const putAway = isPutOff(later, session);
  // folded from the start in a small window, or once put off
  const [folded, setFolded] = useState(use(WindowCompactContext) || putAway);
  const items = session.pending ?? [];
  const git = session.git ? gitSummary(session.git) : null;
  if ((!items.length && !git) || session.state !== 'wait' || isWorking(session)) return null;
  const words = t.session.pending;
  return (
    <section className="cp-pending" aria-label={words.title} data-folded={folded}>
      <div className="cp-pending__head">
        <button type="button" className="cp-pending__title" aria-expanded={!folded} onClick={() => setFolded(!folded)}>
          <ChevronDownIcon />{words.title}<span className="cp-pending__count">{items.length + (git ? 1 : 0)}</span>
        </button>
        {putAway
          ? <span className="cp-pending__note">{words.putAway}</span>
          : (
            <Tooltip text={words.laterTitle}>
              <button type="button" className="cp-pending__later" onClick={() => { putOff(session); setFolded(true); }}>{words.later}</button>
            </Tooltip>
          )}
      </div>
      {!folded && (
        <ul className="cp-pending__list">
          {items.map((item) => (
            <li key={item.id} className="cp-pending__item">
              <span className="cp-pending__text" title={item.text}>{item.text}</span>
              <Tooltip text={words.dismiss}>
                <button type="button" className="cp-icon-button cp-pending__dismiss" aria-label={words.dismiss} onClick={() => send({ t: 'dismissPending', sessionId: session.id, id: item.id })}><CloseIcon /></button>
              </Tooltip>
            </li>
          ))}
          {/* no cross: it goes by itself once committed or pushed */}
          {git && <li className="cp-pending__item"><span className="cp-pending__text">{git}</span></li>}
        </ul>
      )}
    </section>
  );
}
