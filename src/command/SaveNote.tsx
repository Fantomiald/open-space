import { t } from '../i18n/index.ts';
import type { SaveStatus } from './useAutosave.ts';

/** Where an editor saved by itself stands: saved, about to be, or why it cannot be. */
export function SaveNote({ status }: { status: SaveStatus }) {
  return (
    <p className="cp-save-note" data-state={status.state} role="status" aria-live="polite">
      {status.state === 'blocked' ? status.problem : status.state === 'pending' ? t.common.save.pending : t.common.save.saved}
    </p>
  );
}
