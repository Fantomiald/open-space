import type { ReactNode } from 'react';

/** One setting: its icon, title and what it does, and its control on the right (below it for a wide one). `config`: its name in Claude Code's /config. */
export function Row({ id, icon, title, hint, config, extra, wide, flash, children }: {
  id: string; icon: ReactNode; title: string; hint?: ReactNode; config?: string; extra?: ReactNode; wide?: boolean; flash?: boolean; children: ReactNode;
}) {
  return (
    <div className="cp-prefs__row" id={`setting-${id}`} data-wide={wide} data-flash={flash}>
      <span className="cp-prefs__row-icon">{icon}</span>
      <div className="cp-prefs__row-text">
        <span className="cp-prefs__row-title" id={`setting-${id}-title`}>{title}{config && <code className="cp-prefs__config" title="/config">{config}</code>}</span>
        {hint && <span className="cp-prefs__row-hint">{hint}</span>}
        {extra}
      </div>
      <div className="cp-prefs__row-control">{children}</div>
    </div>
  );
}
