import type { PermissionDecision, PermissionPrompt as Prompt } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { useAnswerButtons } from './useAnswerButtons.ts';

/** A tool call waiting for yes / no / always, with the exact command or path it is about. Mount with `key={prompt.requestId}`. */
export function PermissionPrompt({ sessionId, prompt, more }: { sessionId: string; prompt: Prompt; more?: number }) {
  const answerPermission = useSessions((s) => s.answerPermission);
  const buttons = useAnswerButtons();
  const words = t.composer.permission;
  const answer = (decision: PermissionDecision) => buttons.sent(answerPermission(sessionId, prompt.requestId, decision));
  const scope = prompt.canAlways && prompt.always?.length ? words.alwaysScope(prompt.always) : null;
  return (
    <div className="cp-permission" role="group" aria-label={words.label(prompt.tool)}>
      <div className="cp-permission__what">
        <strong>{prompt.tool}</strong>
        {more ? <span className="cp-muted"> {words.morePending(more)}</span> : null}
      </div>
      <pre className="cp-permission__detail">{prompt.detail}</pre>
      <div className="cp-permission__actions">
        <button type="button" className="cp-button" data-variant="primary" disabled={buttons.disabled} onClick={() => answer('allow')}>{words.yes}</button>
        <button type="button" className="cp-button" disabled={buttons.disabled} onClick={() => answer('deny')}>{words.no}</button>
        {prompt.canAlways && (
          <button type="button" className="cp-button" disabled={buttons.disabled} title={scope ?? words.alwaysTitle} onClick={() => answer('always')}>
            {words.always}
          </button>
        )}
      </div>
      {scope && <p className="cp-permission__always">{scope}</p>}
    </div>
  );
}
