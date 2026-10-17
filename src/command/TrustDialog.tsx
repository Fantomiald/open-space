import { homeRelative } from '../lib/format.ts';
import { useSessions } from '../state/sessions.ts';
import { Modal } from './Modal.tsx';

/**
 * Asked before the first session in a folder that runs code of its own (hooks, MCP servers) and was never trusted,
 * here or in Claude Code: Claude Code asks this in a terminal, but not when Open Space runs it (server/trust.ts).
 */
export function TrustDialog() {
  const request = useSessions((s) => s.trustRequest);
  const answerTrust = useSessions((s) => s.answerTrust);
  if (!request) return null;
  const { cwd, code } = request;
  return (
    <Modal title="Ce dossier fait tourner du code à lui" onClose={() => answerTrust(null)} wide>
      <div className="cp-trust">
        <p>
          <strong>{homeRelative(cwd)}</strong> n’a jamais été approuvé, ni ici ni dans Claude Code. Avec une session, il lancerait de lui-même :
        </p>
        {code.hooks.length > 0 && (
          <section>
            <h3>Des hooks</h3>
            <ul>{code.hooks.map((hook) => <li key={hook}><code>{hook}</code></li>)}</ul>
          </section>
        )}
        {code.mcpServers.length > 0 && (
          <section>
            <h3>Des serveurs MCP</h3>
            <ul>{code.mcpServers.map((server) => <li key={server}><code>{server}</code></li>)}</ul>
          </section>
        )}
        <p className="cp-muted">
          Sans ses réglages, la session garde les tiens (tes serveurs MCP, tes autorisations) mais rien de ce dossier ne démarre.
          {code.instructions ? ' Son CLAUDE.md est lu dans les deux cas.' : ''}
        </p>
        <div className="cp-form__actions">
          <button type="button" className="cp-button" onClick={() => answerTrust(null)}>Annuler</button>
          <button type="button" className="cp-button" onClick={() => answerTrust('folder')}>Je lui fais confiance</button>
          <button type="button" className="cp-button" data-variant="primary" autoFocus onClick={() => answerTrust('restricted')}>Lancer sans ses réglages</button>
        </div>
      </div>
    </Modal>
  );
}
