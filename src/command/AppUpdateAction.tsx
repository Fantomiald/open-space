import { useState } from 'react';
import { createPortal } from 'react-dom';
import { busySessions } from '../../shared/app-update.ts';
import { locale, t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { CheckIcon, RefreshIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';

/**
 * What the Mac app can do about a new Open Space, wherever the settings show it: look for one, follow its download,
 * then restart on it, after a warning when sessions are at work.
 */
export function AppUpdateAction() {
  const update = useSessions((s) => s.appUpdate);
  const sessions = useSessions((s) => s.sessions);
  const [warned, setWarned] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const words = t.settings.prefs.update;
  const restart = () => { setWarned(false); setRestarting(true); useSessions.getState().restartApp(); };

  if (update?.state === 'downloading') {
    const percent = new Intl.NumberFormat(locale(), { style: 'percent' }).format(update.percent / 100);
    return (
      <span className="cp-app-update__progress">
        <progress className="cp-meter" value={update.percent} max={100} aria-label={words.appDownloading(update.version)} />
        <span>{percent}</span>
      </span>
    );
  }
  if (update?.state === 'ready') {
    const busy = busySessions(Object.values(sessions));
    const names = new Intl.ListFormat(locale(), { type: 'conjunction' }).format(busy.map((session) => session.name));
    return (
      <>
        <button type="button" className="cp-button" data-variant="primary" disabled={restarting} aria-busy={restarting || undefined} onClick={() => (busy.length ? setWarned(true) : restart())}>
          {restarting && <RefreshIcon />}{words.appRestart}
        </button>
        {/* out of the settings, whose panel styles would reach into it */}
        {warned && createPortal(
          <Modal title={words.restartQuestion} onClose={() => setWarned(false)}>
            <p className="cp-muted">{words.restartBusy(busy.length, names)}</p>
            <div className="cp-form__actions">
              <button type="button" className="cp-button" onClick={() => setWarned(false)}>{words.cancel}</button>
              <button type="button" className="cp-button" data-variant="primary" data-autofocus onClick={restart}>{words.restartAnyway}</button>
            </div>
          </Modal>,
          document.body,
        )}
      </>
    );
  }
  return (
    <CheckButton
      busy={update?.state === 'checking'} done={update?.state === 'upToDate' ? words.upToDate : undefined}
      failure={update?.state === 'failed' ? update.text : undefined} onClick={() => useSessions.getState().checkApp()}
    />
  );
}

/** A button that looks for an update: its icon turns while it looks, then the button itself says what came of it (the reason of a failure on hover). */
export function CheckButton({ busy, done, failure, onClick }: { busy: boolean; done?: string; failure?: string; onClick: () => void }) {
  const words = t.settings.prefs.update;
  return (
    <button type="button" className="cp-button" disabled={busy} aria-busy={busy || undefined} title={failure && words.failed(failure)} onClick={onClick}>
      {done ? <><CheckIcon />{done}</> : <><RefreshIcon />{failure ? words.retry : words.check}</>}
    </button>
  );
}
