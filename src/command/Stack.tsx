import { t } from '../i18n/index.ts';
import { maxColumnsIn, tilingOf, useSessions } from '../state/sessions.ts';
import { addTo, placement } from '../state/stack.ts';
import { Detail } from './Detail.tsx';
import { Launcher } from './Launcher.tsx';

/** The launcher's place in the grid, among the sessions' ids. */
const LAUNCHER = 'launcher';

/**
 * The open sessions over the room, each in its place of the grid (stack.ts). All are children of one element, keyed by
 * session, so closing or zooming one never remounts another: each keeps its draft and where its thread was scrolled to.
 * Tab hides them to see the room (still mounted), the button brings them back. In focus mode the launcher can join them,
 * in the place the new session will take (over all of them when there is no room left).
 */
export function Stack() {
  const columns = useSessions((s) => s.columns);
  const zoomedId = useSessions((s) => s.zoomedId);
  const hidden = useSessions((s) => s.stackHidden);
  const hideStack = useSessions((s) => s.hideStack);
  const view = useSessions((s) => s.view);
  const launcherOpen = useSessions((s) => s.launcherOpen);
  const closeLauncher = useSessions((s) => s.closeLauncher);
  const active = useSessions((s) => (s.selectedId ? s.sessions[s.selectedId]?.name : undefined));
  const tiling = tilingOf(view);
  const withLauncher = launcherOpen ? addTo(columns, LAUNCHER, maxColumnsIn(view), tiling) : null;
  const zoomed = launcherOpen && !withLauncher ? LAUNCHER : zoomedId;
  const { rows, slots } = placement(withLauncher ?? columns, tiling);
  const several = slots.length > 1;
  return (
    <>
      <div
        className="cp-stack" data-count={slots.length} data-columns={(withLauncher ?? columns).length} data-rows={rows} data-zoomed={zoomed !== null}
        data-hidden={hidden} aria-hidden={hidden || undefined}
      >
        {slots.map(({ id, column, row, span }) => (
          <div
            key={id} className="cp-stack__slot" data-column={column} data-row={row} data-span={span} data-zoomed={zoomed === id}
            data-compact={several && zoomed !== id}
          >
            {id === LAUNCHER ? <Launcher onClose={closeLauncher} /> : <Detail sessionId={id} />}
          </div>
        ))}
        {zoomed === LAUNCHER && !withLauncher && (
          <div key={LAUNCHER} className="cp-stack__slot" data-zoomed="true"><Launcher onClose={closeLauncher} replacing={active} /></div>
        )}
      </div>
      {hidden && (
        <button type="button" className="cp-button cp-stack__show" onClick={() => hideStack(false)}>
          {t.room.stack.show(slots.length)} <kbd className="cp-kbd">Tab</kbd>
        </button>
      )}
    </>
  );
}
