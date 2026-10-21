import { useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { RefreshIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';

/**
 * The account every session uses, as `/login` and `/logout` would change it in a terminal: log in (the browser opens),
 * switch to another account, or log out after a warning.
 */
export function AccountAction() {
  const account = useSessions((s) => s.claudeAccount);
  const [warned, setWarned] = useState(false);
  const words = t.settings.prefs.rows.account;
  if (!account) return null;
  const store = useSessions.getState;
  const logout = () => { setWarned(false); store().claudeLogout(); };
  const busy = !!account.busy;
  return (
    <>
      {account.loggedIn && (
        <button type="button" className="cp-button" disabled={busy} aria-busy={account.busy === 'logout' || undefined} onClick={() => setWarned(true)}>
          {account.busy === 'logout' && <RefreshIcon />}{words.logout}
        </button>
      )}
      <button
        type="button" className="cp-button" data-variant={account.loggedIn ? undefined : 'primary'} disabled={busy}
        aria-busy={account.busy === 'login' || undefined} onClick={() => store().claudeLogin()}
      >
        {account.busy === 'login' ? <><RefreshIcon />{words.waiting}</> : account.loggedIn ? words.switch : words.login}
      </button>
      {/* out of the settings, whose panel styles would reach into it */}
      {warned && createPortal(
        <Modal title={words.logoutQuestion} onClose={() => setWarned(false)}>
          <p className="cp-muted">{words.logoutWarning}</p>
          <div className="cp-form__actions">
            <button type="button" className="cp-button" autoFocus onClick={() => setWarned(false)}>{t.settings.prefs.update.cancel}</button>
            <button type="button" className="cp-button" data-variant="primary" onClick={logout}>{words.logout}</button>
          </div>
        </Modal>,
        document.body,
      )}
    </>
  );
}
