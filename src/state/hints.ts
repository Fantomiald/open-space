// The "compact" hints the user closed, in this browser: one per conversation and context level, so a fuller context,
// or a new conversation, shows it again.
import { readPreference, writePreference } from '../lib/preferences.ts';

const KEY = 'compactClosed';
const LIMIT = 50;
const all = () => readPreference<string[]>(KEY, []);

export const compactClosed = (key: string) => all().includes(key);

export function closeCompact(key: string) {
  writePreference(KEY, [...all().filter((closed) => closed !== key), key].slice(-LIMIT));
}
