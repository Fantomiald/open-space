// Words and tones for session states. One place, so the design can restyle the tones without touching logic.
import type { PermissionMode, SessionInfo } from '../../shared/protocol.ts';
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
export const MODELS: readonly (readonly [string, string])[] = [['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku'], ['fable', 'Fable'], ['', 'Par défaut']];

export const SHORT_MODE_LABELS = { auto: 'Auto', acceptEdits: 'Accepte les modifs', manual: 'Demande tout', plan: 'Plan seulement' } as const satisfies Record<PermissionMode, string>;

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  auto: 'Auto (Claude décide, demande si risqué)',
  acceptEdits: 'Accepte les modifications de fichiers',
  manual: 'Demande à chaque fois',
  plan: 'Plan seulement (aucune modification)',
};

const ATTENTION_LABEL: Record<AttentionKind, string> = {
  permission: 'Autorisation', question: 'Question pour toi', finished: 'Terminé, à voir', error: 'Erreur',
};

export function stateLabel(session: SessionInfo, kind: AttentionKind | null): string {
  if (kind) return ATTENTION_LABEL[kind];
  switch (session.state) {
    case 'starting': return 'Démarre';
    case 'work': return 'Au travail';
    case 'wait': return 'Prête';
    case 'closed': return 'Fermée';
    case 'done': return 'Finie';
    case 'error': return 'Erreur';
    default: return session.state;
  }
}

/** True when the session can still receive a message that makes it work (all of them can: a stopped one is resumed). */
export const isRunning = (session: SessionInfo) => session.state === 'starting' || session.state === 'work' || session.state === 'perm';

/** What the user has to do for a session, as a to-do line ("Répondre à Lina", "Autoriser Bash pour Iris"). */
export function todoLabel(session: SessionInfo, kind: AttentionKind): string {
  switch (kind) {
    case 'permission': return `Autoriser ${session.permissions[0]?.tool ?? 'une action'} pour ${session.name}`;
    case 'question': return `Répondre à ${session.name}`;
    case 'finished': return `Lire ce qu’a fait ${session.name}`;
    case 'error': return `Voir l’erreur de ${session.name}`;
  }
}
