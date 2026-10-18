// What is typed in a session's field and not sent yet, kept per session in this browser: going to another session and
// back finds it again. A session switched off takes its draft with it, so a new session for the same person starts empty.
import { readPreference, writePreference } from '../lib/preferences.ts';

const KEY = 'drafts';
const all = () => readPreference<Record<string, string>>(KEY, {});

export const readDraft = (sessionId: string) => all()[sessionId] ?? '';

export function writeDraft(sessionId: string, text: string) {
  const { [sessionId]: _previous, ...others } = all();
  writePreference(KEY, text.trim() ? { ...others, [sessionId]: text } : others);
}

/** Forgets the drafts of the sessions that are gone. */
export function keepDrafts(sessionIds: readonly string[]) {
  const drafts = all();
  const kept = Object.fromEntries(Object.entries(drafts).filter(([id]) => sessionIds.includes(id)));
  if (Object.keys(kept).length !== Object.keys(drafts).length) writePreference(KEY, kept);
}
