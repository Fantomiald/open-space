import type { SessionInfo } from '../../shared/protocol.ts';
import type { AttentionKind } from '../state/queue.ts';
import { stateLabel, toneOf } from '../state/labels.ts';

export function StateBadge({ session, kind }: { session: SessionInfo; kind: AttentionKind | null }) {
  return <span className="cp-badge" data-tone={toneOf(session, kind)}>{stateLabel(session, kind)}</span>;
}
