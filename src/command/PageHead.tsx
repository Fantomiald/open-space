import type { ReactNode } from 'react';
import { t } from '../i18n/index.ts';
import { CloseIcon } from './Icons.tsx';

/** The page's header, like a settings section's: its picture, its title and what it is, then its actions. */
export function PageHead({ picture, title, intro, children, close }: { picture: ReactNode; title: string; intro: string; children?: ReactNode; close: () => void }) {
  return (
    <header className="cp-prefs__head cp-team__head">
      <span className="cp-prefs__head-icon cp-team__face">{picture}</span>
      <div><h3>{title}</h3><p>{intro}</p></div>
      <div className="cp-team__actions">
        {children}
        <button type="button" className="cp-icon-button" aria-label={t.settings.close} title={t.settings.close} onClick={close}><CloseIcon /></button>
      </div>
    </header>
  );
}
