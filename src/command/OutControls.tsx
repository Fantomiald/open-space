import { useEffect, useState } from 'react';
import { t } from '../i18n/index.ts';
import { putBack } from '../net/out.ts';
import type { OutTarget } from '../state/out.ts';
import { CloseIcon, PinIcon, PutBackIcon, UnpinIcon } from './Icons.tsx';

/**
 * The buttons of a window taken out of Open Space: kept over the other apps or not (the Mac app's windows only), back
 * into Open Space, closed. `outlined` for a session's head, small for the title bar of a mod or a browser.
 */
export function OutControls({ target, variant }: { target: OutTarget; variant: 'outlined' | 'small' }) {
  const words = t.common.out;
  const desktop = window.openSpaceDesktop;
  const [onTop, setOnTop] = useState<boolean | null>(null);
  useEffect(() => { void desktop?.keepOnTop().then(setOnTop); }, [desktop]);
  const look = variant === 'outlined' ? { 'data-variant': 'outlined' } : { 'data-size': 'small' };
  return (
    <>
      {onTop !== null && (
        <button
          type="button" className="cp-icon-button" {...look} aria-pressed={onTop} aria-label={words.pin} title={onTop ? words.unpin : words.pin}
          onClick={() => { void desktop?.keepOnTop(!onTop).then(setOnTop); }}
        >{onTop ? <PinIcon /> : <UnpinIcon />}</button>
      )}
      <button type="button" className="cp-icon-button" {...look} aria-label={words.putBack} title={words.putBack} onClick={() => putBack(target)}><PutBackIcon /></button>
      <button type="button" className="cp-icon-button" {...look} aria-label={words.close} title={words.close} onClick={() => window.close()}><CloseIcon /></button>
    </>
  );
}
