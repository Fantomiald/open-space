// The server room's card: empty, what it is for and its first automaton, in the middle of the room; once there are
// some, a small card in its corner with how many, the next start, and the way to them (the orb opens them too).
import { formatClock } from '../lib/format.ts';
import { t } from '../i18n/index.ts';
import { useNow } from '../lib/useNow.ts';
import { useSessions } from '../state/sessions.ts';
import { nextStart } from '../state/triggers.ts';
import { AutomatonIcon, PlusIcon } from './Icons.tsx';

export function ServerRoomEmpty() {
  // the external runs' folder counts as automatons too: their robots stand in the room (AutomataDialog's `external`)
  const empty = useSessions((s) => s.triggers.triggers.length === 0 && s.preferences.automataFolder === '' && s.automata.running.length + s.automata.recent.length === 0);
  const triggers = useSessions((s) => s.triggers.triggers);
  const openAutomata = useSessions((s) => s.openAutomata);
  const now = useNow(60_000);
  const words = t.automata.room;
  if (!empty) {
    const on = triggers.filter((trigger) => trigger.enabled);
    const next = on
      .map((trigger) => ({ trigger, at: nextStart(trigger, now) }))
      .filter((each): each is { trigger: (typeof on)[number]; at: number } => typeof each.at === 'number')
      .sort((a, b) => a.at - b.at)[0];
    return (
      <div className="cp-server-card">
        <AutomatonIcon />
        <div className="cp-server-card__text">
          <strong>{words.count(triggers.length, on.length)}</strong>
          <span>{next ? words.next(next.trigger.name, formatClock(next.at)) : words.noNext}</span>
        </div>
        <button type="button" className="cp-button" data-size="small" onClick={() => openAutomata(true)}>{words.manage}</button>
      </div>
    );
  }
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
