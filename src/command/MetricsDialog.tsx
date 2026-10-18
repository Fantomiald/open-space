import { useEffect } from 'react';
import { t } from '../i18n/index.ts';
import { formatDuration, homeRelative } from '../lib/format.ts';
import { useNow } from '../lib/useNow.ts';
import { useSessions } from '../state/sessions.ts';
import { Modal } from './Modal.tsx';
import { Prose } from './Prose.tsx';

export function MetricsDialog() {
  const open = useSessions((s) => s.metricsOpen);
  return open ? <Metrics /> : null;
}

/**
 * The numbers object of the room, read only: the Markdown file of the settings that the user's scripts or sessions keep
 * up to date, its tables laid out for figures. Reading it clears the badge; a file rewritten while it is open is read again.
 */
function Metrics() {
  const metrics = useSessions((s) => s.metrics);
  const unread = useSessions((s) => s.metricsUnread);
  const file = useSessions((s) => s.preferences.metricsFile);
  const openMetrics = useSessions((s) => s.openMetrics);
  const send = useSessions((s) => s.send);
  const now = useNow(60_000);
  const words = t.metrics;

  useEffect(() => { if (unread) send({ t: 'metrics' }); }, [unread, send]);

  return (
    <Modal title={words.title} onClose={() => openMetrics(false)} wide>
      <div className="cp-metrics">
        {metrics === undefined ? (
          <p className="cp-muted">{words.loading}</p>
        ) : metrics === null ? (
          <div className="cp-empty-state">
            <p>{words.empty}</p>
            <p>{words.emptyHint(homeRelative(file))}</p>
          </div>
        ) : (
          <>
            <Prose text={metrics.text} className="cp-metrics__prose" />
            <p className="cp-metrics__stamp">{words.changed(formatDuration(now - metrics.mtime))}</p>
          </>
        )}
      </div>
      <div className="cp-form__actions">
        <button type="button" className="cp-button" onClick={() => openMetrics(false)}>{t.settings.close}</button>
      </div>
    </Modal>
  );
}
