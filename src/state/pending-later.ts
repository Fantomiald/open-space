// The sessions whose leftovers the user put off for later, remembered in this browser: such a session waits with the
// ready ones until its lines, or what git says of its folder, change.
import { create } from 'zustand';
import type { SessionInfo } from '../../shared/protocol.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';

/** What a session leaves behind (its pending lines, what git says of its folder), as one key. */
const linesKey = (session: SessionInfo) => JSON.stringify([(session.pending ?? []).map((item) => item.id), session.git ?? null]);

interface PendingLater { later: Readonly<Record<string, string>>; putOff: (session: SessionInfo) => void }

export const usePendingLater = create<PendingLater>((set, get) => ({
  later: readPreference<Record<string, string>>('pendingLater', {}),
  putOff: (session) => {
    const later = { ...get().later, [session.id]: linesKey(session) };
    writePreference('pendingLater', later);
    set({ later });
  },
}));

/** Whether the user put off what this session leaves behind, and it has not changed since. */
export const isPutOff = (later: Readonly<Record<string, string>>, session: SessionInfo) => later[session.id] === linesKey(session);
