// What is said in any session as it happens (live, never replayed history): the session agent's texts, and the user's
// messages and answers. The meeting room listens to it for its speech bubbles; nothing is stored. What sub-agents
// write stays in their tab: several of them at once would fill the room with bubbles.
import type { OfficeEvent, PermissionDecision } from '../../shared/protocol.ts';
import { earlyBubbleText } from '../room/bubbles.ts';
import { writingStops } from './partials.ts';

/** The speaker of the user's own messages and answers. */
export const USER_SPEAKER = 'user';

/** `speaker`: USER_SPEAKER or "chef" (the session's agent). */
export interface Speech { sessionId: string; speaker: string; text: string }

/**
 * Sessions whose message being written already has its bubble (see earlySpeech): its whole message then makes none.
 * Forgotten when that message arrives, or when the turn stops without it.
 */
const spokenEarly = new Set<string>();

export function speechOf(sessionId: string, ev: OfficeEvent): Speech | null {
  if (ev.k === 'say') {
    if (ev.who !== 'chef') return null;
    return spokenEarly.delete(sessionId) ? null : { sessionId, speaker: ev.who, text: ev.text };
  }
  if (writingStops(ev)) spokenEarly.delete(sessionId);
  if (ev.k === 'start') return { sessionId, speaker: USER_SPEAKER, text: ev.text };
  return null;
}

/** The bubble of the session agent's message being written, once its first sentence is over; only once per message. */
export function earlySpeech(sessionId: string, who: string, draft: string): Speech | null {
  if (who !== 'chef' || spokenEarly.has(sessionId)) return null;
  const sentence = earlyBubbleText(draft);
  if (!sentence) return null;
  spokenEarly.add(sessionId);
  return { sessionId, speaker: who, text: sentence };
}

const DECISION_WORDS: Record<PermissionDecision, string> = { allow: 'Oui', deny: 'Non', always: 'Toujours' };

export const answerSpeech = (sessionId: string, decision: PermissionDecision): Speech => ({ sessionId, speaker: USER_SPEAKER, text: DECISION_WORDS[decision] });

export const replySpeech = (sessionId: string, answers: Readonly<Record<string, string>>): Speech => ({ sessionId, speaker: USER_SPEAKER, text: Object.values(answers).join(' · ') });

const listeners = new Set<(speech: Speech) => void>();

export function onSpeech(listener: (speech: Speech) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function announceSpeech(speech: Speech) {
  for (const listener of listeners) listener(speech);
}
