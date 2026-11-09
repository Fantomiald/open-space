// An empty server room says what it is for and makes the first automaton; once there is one, its orb opens them.
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { AutomatonIcon, PlusIcon } from './Icons.tsx';

export function ServerRoomEmpty() {
  const empty = useSessions((s) => s.triggers.triggers.length === 0);
  const openAutomata = useSessions((s) => s.openAutomata);
  if (!empty) return null;
  const words = t.automata.room;
  return (
    <div className="cp-server-empty">
      <AutomatonIcon />
      <strong>{words.empty}</strong>
      <p>{words.emptyText}</p>
      <button type="button" className="cp-button" data-variant="primary" onClick={() => openAutomata(true, null, null, true)}>
        <PlusIcon />{words.add}
      </button>
    </div>
  );
}
