// What waits for the user, pinned to the bottom left corner of the screen in both views: one line per session to
// answer, allow, read or check, the most urgent first. A click opens the session.
import { useMemo } from 'react';
import { t } from '../i18n/index.ts';
import { todoLabel } from '../state/labels.ts';
import { attentionQueue } from '../state/queue.ts';
import { useSessions } from '../state/sessions.ts';

export function TodoList() {
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const select = useSessions((s) => s.select);
  const selectedId = useSessions((s) => s.selectedId);
  const items = useMemo(() => attentionQueue(Object.values(sessions), seen), [sessions, seen]);
  if (!items.length) return null;
  return (
    <section className="cp-todo" aria-label={t.session.todo.title}>
      <h2 className="cp-todo__title">{t.session.todo.title} <span className="cp-todo__count">{items.length}</span></h2>
      <ul className="cp-todo__list">
        {items.map(({ session, kind }) => (
          <li key={session.id}>
            <button type="button" className="cp-todo__item" data-kind={kind} aria-current={session.id === selectedId} onClick={() => select(session.id)}>
              <span className="cp-todo__dot" aria-hidden="true" />
              {todoLabel(session, kind)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
