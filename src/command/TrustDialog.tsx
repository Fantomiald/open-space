import { t } from '../i18n/index.ts';
import { homeRelative } from '../lib/format.ts';
import { useSessions } from '../state/sessions.ts';
import { Modal } from './Modal.tsx';

/**
 * Asked before the first session in a folder that runs code of its own (hooks, MCP servers, settings) and was never trusted,
 * here or in Claude Code: Claude Code asks this in a terminal, but not when Open Space runs it (server/trust.ts).
 */
export function TrustDialog() {
  const request = useSessions((s) => s.trustRequest);
  const answerTrust = useSessions((s) => s.answerTrust);
  if (!request) return null;
  const { cwd, code } = request;
  const words = t.composer.trust;
  return (
    <Modal title={words.title} onClose={() => answerTrust(null)} wide>
      <div className="cp-trust">
        <p>
          <strong>{homeRelative(cwd)}</strong> {words.neverTrusted}
        </p>
        {code.hooks.length > 0 && (
          <section>
            <h3>{words.hooks}</h3>
            <ul>{code.hooks.map((hook) => <li key={hook}><code>{hook}</code></li>)}</ul>
          </section>
        )}
        {code.mcpServers.length > 0 && (
          <section>
            <h3>{words.mcpServers}</h3>
            <ul>{code.mcpServers.map((server) => <li key={server}><code>{server}</code></li>)}</ul>
          </section>
        )}
        {code.settings.length > 0 && (
          <section>
            <h3>{words.settings}</h3>
            <ul>{code.settings.map((setting) => <li key={setting}><code>{setting}</code></li>)}</ul>
          </section>
        )}
        <p className="cp-muted">
          {words.withoutSettings}
          {code.instructions ? words.instructionsRead : ''}
        </p>
        <div className="cp-form__actions">
          <button type="button" className="cp-button" onClick={() => answerTrust(null)}>{words.cancel}</button>
          <button type="button" className="cp-button" onClick={() => answerTrust('folder')}>{words.trustFolder}</button>
          <button type="button" className="cp-button" data-variant="primary" data-autofocus onClick={() => answerTrust('restricted')}>{words.startRestricted}</button>
        </div>
      </div>
    </Modal>
  );
}
