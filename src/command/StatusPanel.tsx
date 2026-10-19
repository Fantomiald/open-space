// Where every session is at, pinned to the bottom left corner of the screen in both views: what waits for the user
// (to answer, allow, read or check, the most urgent first, with how long it has waited), then who is at work and for
// how long. A click opens the session; the title folds the panel down to its counts.
import { useMemo, useState } from 'react';
import { t } from '../i18n/index.ts';
import { formatDuration } from '../lib/format.ts';
import { useNow } from '../lib/useNow.ts';
import { todoLabel } from '../state/labels.ts';
import { attentionQueue, otherSessions } from '../state/queue.ts';
import { useSessions } from '../state/sessions.ts';
import { ChevronDownIcon, ChevronUpIcon } from './Icons.tsx';

const FOLDED_KEY = 'poste:status-folded';
const readFolded = () => { try { return localStorage.getItem(FOLDED_KEY) === 'true'; } catch { return false; } };
const writeFolded = (folded: boolean) => { try { localStorage.setItem(FOLDED_KEY, String(folded)); } catch { /* not kept: it folds for this visit only */ } };

export function StatusPanel() {
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const show = useSessions((s) => s.show);
  const openIds = useSessions((s) => s.openIds);
  const toggleOpen = useSessions((s) => s.toggleOpen);
  const [folded, setFolded] = useState(readFolded);
  const waiting = useMemo(() => attentionQueue(Object.values(sessions), seen), [sessions, seen]);
  const working = useMemo(() => otherSessions(Object.values(sessions), seen).working, [sessions, seen]);
  // the times go on by the second while someone works, by the minute otherwise
  const now = useNow(working.length ? 1000 : 30_000);
  if (!waiting.length && !working.length) return null;
  const words = t.session.status;
  const fold = () => { setFolded(!folded); writeFolded(!folded); };
  return (
    <section className="cp-status" aria-label={words.title} data-folded={folded}>
      <button type="button" className="cp-status__head" aria-expanded={!folded} title={folded ? words.unfold : words.fold} onClick={fold}>
        <span className="cp-status__title">{words.title}</span>
        {waiting.length > 0 && <span className="cp-status__count" data-kind="waiting" title={words.waiting}>{waiting.length}</span>}
        {working.length > 0 && <span className="cp-status__count" data-kind="working" title={words.working}>{working.length}</span>}
        {folded ? <ChevronUpIcon /> : <ChevronDownIcon />}
      </button>
      {!folded && (
        <div className="cp-status__body">
          {waiting.length > 0 && (
            <div className="cp-status__group">
              <h2 className="cp-status__group-title">{words.waiting}</h2>
              <ul className="cp-status__list">
                {waiting.map(({ session, kind }) => (
                  <li key={session.id}>
                    <button type="button" className="cp-status__item" data-kind={kind} aria-current={openIds.includes(session.id)} onClick={(e) => (e.shiftKey ? toggleOpen(session.id) : show(session.id))}>
                      <span className="cp-status__dot" aria-hidden="true" />
                      <span className="cp-status__label">{todoLabel(session, kind)}</span>
                      <span className="cp-status__time">{formatDuration(now - session.stateSince)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {working.length > 0 && (
            <div className="cp-status__group">
              <h2 className="cp-status__group-title">{words.working}</h2>
              <ul className="cp-status__list">
                {working.map((session) => (
                  <li key={session.id}>
                    <button type="button" className="cp-status__item" data-kind="working" aria-current={openIds.includes(session.id)} onClick={(e) => (e.shiftKey ? toggleOpen(session.id) : show(session.id))}>
                      <span className="cp-status__dot" aria-hidden="true" />
                      <span className="cp-status__label">
                        {session.name}
                        {session.state === 'starting' && <span className="cp-status__note">{words.starting}</span>}
                        {session.subagents.length > 0 && <span className="cp-status__note">{words.subagents(session.subagents.length)}</span>}
                      </span>
                      <span className="cp-status__time">{formatDuration(now - (session.busySince ?? session.stateSince))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
