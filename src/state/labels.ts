// Words and tones for session states. One place, so the design can restyle the tones without touching logic.
import type { PermissionMode, SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import type { AttentionKind } from './queue.ts';

/** Drives the colour of badges and cards (see --tone-* in design/tokens.css). */
export type Tone = 'permission' | 'reply' | 'work' | 'error' | 'idle';

/** `kind` is the session's attention kind (see queue.ts): a finished turn only stands out until the user has seen it. */
export function toneOf(session: SessionInfo, kind: AttentionKind | null): Tone {
  switch (session.state) {
    case 'perm': return 'permission';
    case 'wait': return kind === 'finished' ? 'reply' : 'idle';
    case 'work': case 'starting': return 'work';
    case 'error': return 'error';
    default: return 'idle';
  }
}

/** The models offered for a session: the alias Claude Code takes, and its name ('' : Claude Code's default). */
export const models = (): readonly (readonly [string, string])[] => [
  ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku'], ['fable', 'Fable'], ['', t.session.models.default],
];

/** A permission mode in a word or two (`short`, for a chip), or in a sentence. */
export const modeLabel = (mode: PermissionMode, length: 'short' | 'long' = 'long') => t.session.modes[length][mode];

export function stateLabel(session: SessionInfo, kind: AttentionKind | null): string {
  const words = t.session.states;
  if (kind) return words.attention[kind];
  switch (session.state) {
    case 'starting': return words.starting;
    case 'work': return words.work;
    case 'wait': return words.wait;
    case 'closed': return words.closed;
    case 'done': return words.done;
    case 'error': return words.error;
    default: return session.state;
  }
}

/**
 * How full a session's context is, as its meter shows it: calm, filling (half the window, or 300k tokens in a very large
 * one: answers get less sharp in a long context), nearly full (three quarters). Null before the first answer told it.
 */
export function contextLevel(context: SessionInfo['context']): 'calm' | 'rising' | 'high' | null {
  if (!context?.max) return null;
  const share = context.used / context.max;
  if (share >= 0.75) return 'high';
  return share >= 0.5 || context.used >= 300_000 ? 'rising' : 'calm';
}

/** True when the session can still receive a message that makes it work (all of them can: a stopped one is resumed). */
export const isRunning = (session: SessionInfo) => session.state === 'starting' || session.state === 'work' || session.state === 'perm';

/** What the user has to do for a session, as a to-do line ("Répondre à Lina", "Autoriser Bash pour Iris"). */
export function todoLabel(session: SessionInfo, kind: AttentionKind): string {
  switch (kind) {
    case 'permission': return t.session.todo.allow(session.permissions[0]?.tool, session.name);
    case 'question': return t.session.todo.answer(session.name);
    case 'finished': return t.session.todo.read(session.name);
    case 'error': return t.session.todo.error(session.name);
  }
}
