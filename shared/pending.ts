// What a session leaves pending (SessionInfo.pending): the lines its agent declares with the set_pending tool.

import type { PendingItem } from './protocol.ts';

/** How many lines a session may leave pending, and how long each may be. */
export const MAX_PENDING = 8;
export const MAX_PENDING_TEXT = 200;

const lineOf = (raw: unknown): string => {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && typeof (raw as { text?: unknown }).text === 'string') return (raw as { text: string }).text;
  return '';
};

const newId = (): string => crypto.randomUUID().slice(0, 8);

/**
 * The lines of untrusted input (strings, or objects with a `text`): trimmed, cut to MAX_PENDING_TEXT, the empty ones
 * left out, MAX_PENDING at most. A line already in `previous` keeps its id and its age.
 */
export function cleanPending(items: unknown, now: number, previous: readonly PendingItem[] = []): PendingItem[] {
  if (!Array.isArray(items)) return [];
  const kept: PendingItem[] = [];
  for (const text of items.map((item) => lineOf(item).trim().slice(0, MAX_PENDING_TEXT))) {
    if (!text || kept.some((item) => item.text === text)) continue;
    kept.push(previous.find((item) => item.text === text) ?? { id: newId(), text, since: now });
    if (kept.length === MAX_PENDING) break;
  }
  return kept;
}
