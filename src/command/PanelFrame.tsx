import type { ReactNode } from 'react';
import { t } from '../i18n/index.ts';
import { BackIcon, RefreshIcon } from './Icons.tsx';

/**
 * A view shown in a session's panel in place of its conversation (what it changed, its MCP servers, its context, the
 * plan's usage): back to the conversation, a line saying what is there, and a refresh.
 */
export function PanelFrame({ label, summary, onBack, onRefresh, refreshTitle, children }: { label: string; summary: ReactNode; onBack: () => void; onRefresh: () => void; refreshTitle?: string; children: ReactNode }) {
  const words = t.session.panel;
  const refresh = refreshTitle ?? words.refresh;
  return (
    <section className="cp-panel-view" aria-label={label}>
      <header className="cp-panel-view__head">
        <button type="button" className="cp-button" data-variant="quiet" onClick={onBack}><BackIcon />{words.back}</button>
        <p className="cp-panel-view__summary" aria-live="polite">{summary}</p>
        <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={refresh} title={refresh} onClick={onRefresh}><RefreshIcon /></button>
      </header>
      <div className="cp-panel-view__body">{children}</div>
    </section>
  );
}
