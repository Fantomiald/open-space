import { useState, type ClipboardEvent } from 'react';
import type { PermissionPrompt, SessionInfo } from '../../shared/protocol.ts';
import { isSecretName, parseEnvBlock, type SecretEntry } from '../../shared/secrets.ts';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { KeyIcon, PlusIcon, RemoveIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { useAnswerButtons } from './useAnswerButtons.ts';

const emptyRow = (name = ''): SecretEntry => ({ name, value: '' });
const filled = (rows: readonly SecretEntry[]) => rows.filter((row) => row.name.trim() || row.value);
const valid = (rows: readonly SecretEntry[]) => filled(rows).length > 0 && filled(rows).every((row) => isSecretName(row.name.trim()) && row.value);

/**
 * Name and value rows, as many as needed. A block of `NAME=value` lines pasted in any field fills the rows at once.
 * The values are password fields: nothing of them shows, nor goes anywhere but to Open Space's server.
 */
function SecretRows({ rows, setRows, fixed }: { rows: SecretEntry[]; setRows: (rows: SecretEntry[]) => void; fixed?: readonly string[] }) {
  const words = t.composer.secrets;
  const change = (index: number, row: Partial<SecretEntry>) => setRows(rows.map((each, at) => (at === index ? { ...each, ...row } : each)));
  const paste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    const block = parseEnvBlock(event.clipboardData.getData('text'));
    if (!block) return;
    event.preventDefault();
    const kept = rows.filter((row, at) => at !== index && (row.name || row.value) && !block.some((entry) => entry.name === row.name));
    setRows([...kept, ...block]);
  };
  return (
    <div className="cp-secrets__rows">
      {rows.map((row, index) => {
        const named = fixed?.includes(row.name) ?? false;
        const wrongName = row.name.trim() !== '' && !isSecretName(row.name.trim());
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own, a name can be edited
          <div className="cp-secrets__row" key={index}>
            <input
              className="cp-secrets__name" value={row.name} readOnly={named} aria-invalid={wrongName} aria-label={words.name} placeholder={words.namePlaceholder}
              spellCheck={false} autoComplete="off" autoCapitalize="off" data-autofocus={index === 0 && !row.name ? true : undefined} onChange={(e) => change(index, { name: e.target.value })} onPaste={paste(index)}
            />
            <input
              className="cp-secrets__value" type="password" value={row.value} aria-label={words.valueOf(row.name || words.name)} placeholder={words.valuePlaceholder}
              autoComplete="new-password" spellCheck={false} data-autofocus={index === 0 && row.name ? true : undefined} onChange={(e) => change(index, { value: e.target.value })} onPaste={paste(index)}
            />
            {!named && rows.length > 1 && (
              <button type="button" className="cp-icon-button" data-size="small" aria-label={words.removeRow} title={words.removeRow} onClick={() => setRows(rows.filter((_, at) => at !== index))}><RemoveIcon /></button>
            )}
          </div>
        );
      })}
      <button type="button" className="cp-button cp-secrets__add" data-variant="quiet" onClick={() => setRows([...rows, emptyRow()])}><PlusIcon />{words.addRow}</button>
    </div>
  );
}

/** An agent's `os-secret ask`: the keys it wants by name, what for, and the fields to paste them in. Mount with `key={prompt.requestId}`. */
export function SecretPrompt({ sessionId, prompt }: { sessionId: string; prompt: PermissionPrompt }) {
  const giveSecrets = useSessions((s) => s.giveSecrets);
  const answerPermission = useSessions((s) => s.answerPermission);
  const buttons = useAnswerButtons();
  const asked = prompt.secrets ?? [];
  const [rows, setRows] = useState<SecretEntry[]>(() => asked.map((name) => emptyRow(name)));
  const words = t.composer.secrets;
  const give = () => { if (valid(rows)) buttons.sent(giveSecrets(sessionId, prompt.requestId, filled(rows).map((row) => ({ name: row.name.trim(), value: row.value })))); };
  return (
    <form className="cp-permission cp-secrets" aria-label={words.askLabel} onSubmit={(e) => { e.preventDefault(); give(); }}>
      <div className="cp-permission__what"><KeyIcon /> <strong>{words.asks(asked.length)}</strong></div>
      {prompt.detail && <p className="cp-secrets__why">{prompt.detail}</p>}
      <SecretRows rows={rows} setRows={setRows} fixed={asked} />
      <p className="cp-secrets__note">{words.never}</p>
      <div className="cp-permission__actions">
        <button type="submit" className="cp-button" data-variant="primary" disabled={buttons.disabled || !valid(rows)}>{words.give}</button>
        <button type="button" className="cp-button" disabled={buttons.disabled} onClick={() => buttons.sent(answerPermission(sessionId, prompt.requestId, 'deny'))}>{words.refuse}</button>
      </div>
    </form>
  );
}

/** The keys a session holds (names only), forgotten one by one or all at once, and new ones given without being asked. */
export function SecretsDialog({ session, name = '', onClose }: { session: SessionInfo; name?: string; onClose: () => void }) {
  const giveSecrets = useSessions((s) => s.giveSecrets);
  const forgetSecrets = useSessions((s) => s.forgetSecrets);
  const [rows, setRows] = useState<SecretEntry[]>([emptyRow(name)]);
  const words = t.composer.secrets;
  const held = session.secrets ?? [];
  const give = () => {
    if (!valid(rows)) return;
    if (giveSecrets(session.id, undefined, filled(rows).map((row) => ({ name: row.name.trim(), value: row.value })))) setRows([emptyRow()]);
  };
  return (
    <Modal title={words.title(session.name)} onClose={onClose}>
      <div className="cp-secrets">
        {held.length > 0 && (
          <ul className="cp-secrets__held" aria-label={words.held}>
            {held.map((name) => (
              <li key={name}>
                <code>{name}</code>
                <button type="button" className="cp-icon-button" data-size="small" aria-label={words.forget(name)} title={words.forget(name)} onClick={() => forgetSecrets(session.id, [name])}><RemoveIcon /></button>
              </li>
            ))}
          </ul>
        )}
        <form className="cp-form" onSubmit={(e) => { e.preventDefault(); give(); }}>
          <SecretRows rows={rows} setRows={setRows} />
          <p className="cp-secrets__note">{words.never} {words.howToUse}</p>
          <div className="cp-form__actions">
            {held.length > 1 && <button type="button" className="cp-button" data-variant="danger" onClick={() => forgetSecrets(session.id)}>{words.forgetAll}</button>}
            <button type="button" className="cp-button" onClick={onClose}>{words.close}</button>
            <button type="submit" className="cp-button" data-variant="primary" disabled={!valid(rows)}>{words.add}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
