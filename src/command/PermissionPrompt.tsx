import type { PermissionDecision, PermissionPrompt as Prompt } from '../../shared/protocol.ts';
import { useSessions } from '../state/sessions.ts';
import { useAnswerButtons } from './useAnswerButtons.ts';

/** A tool call waiting for yes / no / always, with the exact command or path it is about. Mount with `key={prompt.requestId}`. */
export function PermissionPrompt({ sessionId, prompt, more }: { sessionId: string; prompt: Prompt; more?: number }) {
  const answerPermission = useSessions((s) => s.answerPermission);
  const buttons = useAnswerButtons();
  const answer = (decision: PermissionDecision) => buttons.sent(answerPermission(sessionId, prompt.requestId, decision));
  return (
    <div className="cp-permission" role="group" aria-label={`Autorisation demandée pour ${prompt.tool}`}>
      <div className="cp-permission__what">
        <strong>{prompt.tool}</strong>
        {more ? <span className="cp-muted"> et {more} autre{more > 1 ? 's' : ''} en attente</span> : null}
      </div>
      <pre className="cp-permission__detail">{prompt.detail}</pre>
      <div className="cp-permission__actions">
        <button type="button" className="cp-button" data-variant="primary" disabled={buttons.disabled} onClick={() => answer('allow')}>Oui</button>
        <button type="button" className="cp-button" disabled={buttons.disabled} onClick={() => answer('deny')}>Non</button>
        {prompt.canAlways && (
          <button type="button" className="cp-button" disabled={buttons.disabled} title="Autorise cette action pour le reste de la session (rien n'est écrit dans tes réglages)" onClick={() => answer('always')}>
            Toujours (session)
          </button>
        )}
      </div>
      {prompt.canAlways && prompt.always?.length ? (
        <p className="cp-permission__always">« Toujours » autorise, jusqu’à la fin de cette session : {prompt.always.join(' ; ')}.</p>
      ) : null}
    </div>
  );
}
