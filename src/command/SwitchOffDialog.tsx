import type { SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { backgroundWork } from '../state/labels.ts';
import { useSessions } from '../state/sessions.ts';
import { BranchName } from './BranchCard.tsx';
import { KeepIcon, MergeIcon, RemoveIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';

/**
 * Switching off a session whose branch has work on it: what is there, and three ways out. Merge then switch off (the
 * session does its part, then Open Space merges and it switches off), keep the branch (its work committed as wip, its
 * folder removed), or throw it all away. Nothing is lost without one of them.
 */
export function SwitchOffDialog({ session, onClose }: { session: SessionInfo; onClose: () => void }) {
  const send = useSessions((s) => s.send);
  const closeOpen = useSessions((s) => s.closeOpen);
  const worktree = session.worktree;
  if (!worktree) return null;
  const words = t.branches.switchOff;
  const status = worktree.status;
  const switchOff = (branch: 'merge' | 'keep' | 'discard') => {
    send({ t: 'forget', sessionId: session.id, branch });
    onClose();
    // merging first: the session stays open until it is merged, to follow it
    if (branch !== 'merge') closeOpen(session.id);
  };
  const busy = backgroundWork(session);
  return (
    <Modal title={words.title(session.name)} onClose={onClose}>
      <p className="cp-muted">{words.branch} <BranchName name={worktree.branch} />{words.has(status?.ahead ?? 0, status?.dirty ?? 0)}</p>
      {busy.length > 0 && <p className="cp-muted">{t.session.detail.stopsWith(busy.join(', '))}</p>}
      <div className="cp-choices">
        <button type="button" className="cp-choice" data-variant="primary" data-autofocus onClick={() => switchOff('merge')}>
          <MergeIcon /><strong>{words.merge}</strong><span>{words.mergeText(session.name, worktree.base)}</span>
        </button>
        <button type="button" className="cp-choice" onClick={() => switchOff('keep')}>
          <KeepIcon /><strong>{words.keep}</strong><span>{words.keepText}</span>
        </button>
        <button type="button" className="cp-choice" data-variant="danger" onClick={() => switchOff('discard')}>
          <RemoveIcon /><strong>{words.discard}</strong><span>{words.discardText}</span>
        </button>
      </div>
      <div className="cp-form__actions">
        <button type="button" className="cp-button" data-variant="quiet" onClick={onClose}>{words.cancel}</button>
      </div>
    </Modal>
  );
}
