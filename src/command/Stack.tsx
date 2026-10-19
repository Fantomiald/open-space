import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { placement } from '../state/stack.ts';
import { Detail } from './Detail.tsx';

/**
 * The open sessions over the room, each in its place of the grid (stack.ts). All are children of one element, keyed by
 * session, so closing or zooming one never remounts another: each keeps its draft and where its thread was scrolled to.
 * Tab hides them to see the room (still mounted), the button brings them back.
 */
export function Stack() {
  const columns = useSessions((s) => s.columns);
  const zoomedId = useSessions((s) => s.zoomedId);
  const hidden = useSessions((s) => s.stackHidden);
  const hideStack = useSessions((s) => s.hideStack);
  const { rows, slots } = placement(columns);
  const several = slots.length > 1;
  return (
    <>
      <div
        className="cp-stack" data-count={slots.length} data-columns={columns.length} data-rows={rows} data-zoomed={zoomedId !== null}
        data-hidden={hidden} aria-hidden={hidden || undefined}
      >
        {slots.map(({ id, column, row }) => (
          <div
            key={id} className="cp-stack__slot" data-column={column} data-row={row} data-zoomed={zoomedId === id}
            data-compact={several && zoomedId !== id}
          >
            <Detail sessionId={id} />
          </div>
        ))}
      </div>
      {hidden && (
        <button type="button" className="cp-button cp-stack__show" onClick={() => hideStack(false)}>
          {t.room.stack.show(slots.length)} <kbd className="cp-kbd">Tab</kbd>
        </button>
      )}
    </>
  );
}
