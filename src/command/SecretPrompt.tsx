import { useState, type ClipboardEvent } from 'react';
import type { PermissionPrompt, SessionInfo } from '../../shared/protocol.ts';
import { isMultiline, isSecretName, PASTE_SCOPES, parseEnvBlock, type PasteScope, type SecretEntry, type StoredOffer } from '../../shared/secrets.ts';
import { Tooltip } from '../design/Tooltip.tsx';
import { t } from '../i18n/index.ts';
import { folderName } from '../lib/format.ts';
import { useSessions } from '../state/sessions.ts';
import { AlertIcon, CloseIcon, KeyIcon, PlusIcon, RemoveIcon, UndoIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { useAnswerButtons } from './useAnswerButtons.ts';

const emptyRow = (name = ''): SecretEntry => ({ name, value: '' });
const filled = (rows: readonly SecretEntry[]) => rows.filter((row) => row.name.trim() || row.value);
const valid = (rows: readonly SecretEntry[]) => filled(rows).length > 0 && filled(rows).every((row) => isSecretName(row.name.trim()) && row.value);

/** Where each pasted key is kept, chosen at the end of its row; `hint`: what each scope means, in the select's tooltip. */
interface ScopePick { of: Readonly<Record<string, PasteScope>>; pick: (name: string, scope: PasteScope) => void; hint: string }

/**
 * Name and value rows, as many as needed. A block of `NAME=value` lines pasted in any field fills the rows at once; a
 * value of several other lines (a .p8 or .pem key) stays whole, shown as its count of lines. The values are password
 * fields: nothing of them shows, nor goes anywhere but to Open Space's server. `kept`: names whose value the server
 * already holds (an empty field keeps it); `hints`: a line under a name's row; `scopes`: where each key is kept, picked
 * at the end of its row; `more`: a button adds a row. `focused`: the first empty field takes the focus when its dialog opens (not in a page where the
 * rows are one setting among others).
 */
export function SecretRows({ rows, setRows, fixed, kept, hints, scopes, addLabel, more = true, focused = true }: {
  rows: SecretEntry[]; setRows: (rows: SecretEntry[]) => void; fixed?: readonly string[]; kept?: readonly string[]; hints?: Readonly<Record<string, string>>; scopes?: ScopePick; addLabel?: string; more?: boolean; focused?: boolean;
}) {
  const words = t.composer.secrets;
  const change = (index: number, row: Partial<SecretEntry>) => setRows(rows.map((each, at) => (at === index ? { ...each, ...row } : each)));
  const paste = (index: number, value: boolean) => (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    const block = parseEnvBlock(text);
    if (!block) {
      // a password field drops line breaks: the key is kept whole instead
      if (value && isMultiline(text)) { event.preventDefault(); change(index, { value: text.replace(/\r\n?/g, '\n').trim() }); }
      return;
    }
    event.preventDefault();
    const kept = rows.filter((row, at) => at !== index && (row.name || row.value) && !block.some((entry) => entry.name === row.name));
    setRows([...kept, ...block]);
  };
  return (
    <div className="cp-secrets__rows">
      {rows.map((row, index) => {
        const named = fixed?.includes(row.name) ?? false;
        const wrongName = row.name.trim() !== '' && !isSecretName(row.name.trim());
        const held = kept?.includes(row.name.trim()) ?? false;
        const hint = hints?.[row.name.trim()];
        const lines = row.value.includes('\n') ? row.value.split('\n').length : 0;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own, a name can be edited
          <div className="cp-secrets__row" key={index} data-held={held} data-scoped={!!scopes}>
            {named ? (
              <Tooltip text={row.name}>
                <input className="cp-secrets__name" value={row.name} readOnly aria-label={words.name} spellCheck={false} />
              </Tooltip>
            ) : (
              <input
                className="cp-secrets__name" value={row.name} aria-invalid={wrongName} aria-label={words.name} placeholder={words.namePlaceholder}
                spellCheck={false} autoComplete="off" autoCapitalize="off" data-autofocus={focused && index === 0 && !row.name ? true : undefined} onChange={(e) => change(index, { name: e.target.value })} onPaste={paste(index, false)}
              />
            )}
            {lines ? (
              <span className="cp-secrets__value cp-secrets__lines" role="img" aria-label={words.valueOf(row.name || words.name)}>
                {words.lines(lines)}
                <button type="button" className="cp-icon-button" data-size="small" aria-label={words.clearValue} title={words.clearValue} onClick={() => change(index, { value: '' })}><CloseIcon /></button>
              </span>
            ) : (
              <input
                className="cp-secrets__value" type="password" value={row.value} aria-label={words.valueOf(row.name || words.name)} placeholder={held ? words.keptPlaceholder : scopes ? words.pastePlaceholder : words.valuePlaceholder}
                autoComplete="new-password" spellCheck={false} data-autofocus={focused && index === 0 && row.name ? true : undefined} onChange={(e) => change(index, { value: e.target.value })} onPaste={paste(index, true)}
              />
            )}
            {scopes && (
              <span className="cp-secrets__scope">
                <Tooltip text={scopes.hint}>
                  <select aria-label={words.keepFor(row.name || words.name)} value={scopes.of[row.name] ?? 'session'} onChange={(e) => scopes.pick(row.name, e.target.value as PasteScope)}>
                    {PASTE_SCOPES.map((scope) => <option key={scope} value={scope}>{words.scopes[scope]}</option>)}
                  </select>
                </Tooltip>
              </span>
            )}
            {!named && (rows.length > 1 || held) && (
              <button type="button" className="cp-icon-button" data-size="small" aria-label={words.removeRow} title={words.removeRow} onClick={() => setRows(rows.filter((_, at) => at !== index))}><RemoveIcon /></button>
            )}
            {hint && <span className="cp-secrets__hint">{hint}</span>}
          </div>
        );
      })}
      {more && <button type="button" className="cp-button cp-secrets__add" data-variant="quiet" onClick={() => setRows([...rows, emptyRow()])}><PlusIcon />{addLabel ?? words.addRow}</button>}
    </div>
  );
}

/** Keys of the vault offered to a session: its name and where it is kept, and, when `skipped` is given, a button to leave it out or take it back. */
function StoredChips({ stored, skipped, toggle }: { stored: readonly StoredOffer[]; skipped?: ReadonlySet<string>; toggle?: (name: string) => void }) {
  const words = t.composer.secrets;
  return (
    <ul className="cp-secrets__stored">
      {stored.map(({ name, scope }) => {
        const off = skipped?.has(name) ?? false;
        return (
          <li key={name} data-off={off}>
            <Tooltip text={name}><code>{name}</code></Tooltip><small>{words.scopes[scope]}</small>
            {toggle && (
              <button type="button" className="cp-icon-button" data-size="small" aria-label={off ? words.giveBack(name) : words.dontGive(name)} title={off ? words.giveBack(name) : words.dontGive(name)} aria-pressed={off} onClick={() => toggle(name)}>
                {off ? <UndoIcon /> : <CloseIcon />}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * An agent's `os-secret ask`. When every key it wants is in the vault: their names, handed over this time or for good in
 * this project ("always" is not offered to a folder not trusted). Otherwise: the vault's keys it may have, ticked (each
 * can be left out), then a row per key to paste with where to keep it, or the key to replace when the agent says the
 * saved one fails. Mount with `key={prompt.requestId}`.
 */
export function SecretPrompt({ sessionId, prompt }: { sessionId: string; prompt: PermissionPrompt }) {
  const who = useSessions((s) => s.sessions[sessionId]?.name) ?? '';
  const card = prompt.keys;
  const paste = prompt.secrets ?? [];
  if (card?.stored.length && !paste.length) return <StoredPrompt sessionId={sessionId} prompt={prompt} who={who} stored={card.stored} canAlways={!!card.canAlways} />;
  return <PastePrompt sessionId={sessionId} prompt={prompt} who={who} />;
}

function StoredPrompt({ sessionId, prompt, who, stored, canAlways }: { sessionId: string; prompt: PermissionPrompt; who: string; stored: readonly StoredOffer[]; canAlways: boolean }) {
  const giveSecrets = useSessions((s) => s.giveSecrets);
  const answerPermission = useSessions((s) => s.answerPermission);
  const buttons = useAnswerButtons();
  const words = t.composer.secrets;
  const give = (always: boolean) => buttons.sent(giveSecrets(sessionId, prompt.requestId, [], { stored: stored.map((each) => each.name), always }));
  return (
    <div className="cp-permission cp-secrets" role="group" aria-label={words.askLabel}>
      <div className="cp-permission__what"><KeyIcon /><strong>{words.wantsStored(who, stored.length)}</strong></div>
      {prompt.detail && <p className="cp-secrets__why">{prompt.detail}</p>}
      <StoredChips stored={stored} />
      <div className="cp-permission__actions">
        {canAlways && <button type="button" className="cp-button" data-variant="primary" disabled={buttons.disabled} onClick={() => give(true)}>{words.always}</button>}
        <button type="button" className="cp-button" data-variant={canAlways ? undefined : 'primary'} disabled={buttons.disabled} onClick={() => give(false)}>{words.once}</button>
        <button type="button" className="cp-button" disabled={buttons.disabled} onClick={() => buttons.sent(answerPermission(sessionId, prompt.requestId, 'deny'))}>{words.refuse}</button>
      </div>
      <p className="cp-secrets__note">{words.onlyNames(who)}</p>
    </div>
  );
}

function PastePrompt({ sessionId, prompt, who }: { sessionId: string; prompt: PermissionPrompt; who: string }) {
  const giveSecrets = useSessions((s) => s.giveSecrets);
  const answerPermission = useSessions((s) => s.answerPermission);
  const buttons = useAnswerButtons();
  const card = prompt.keys;
  const asked = prompt.secrets ?? [];
  const stored = card?.stored ?? [];
  const [rows, setRows] = useState<SecretEntry[]>(() => asked.map((name) => emptyRow(name)));
  const [scopes, setScopes] = useState<Record<string, PasteScope>>(() => ({ ...card?.scopes }));
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const words = t.composer.secrets;
  const handed = stored.map((each) => each.name).filter((name) => !skipped.has(name));
  const ready = asked.length ? valid(rows) : handed.length > 0;
  const give = () => {
    if (!ready) return;
    const entries = filled(rows).map((row) => ({ name: row.name.trim(), value: row.value, ...(card?.canSave && scopes[row.name] && scopes[row.name] !== 'session' ? { scope: scopes[row.name] } : {}) }));
    buttons.sent(giveSecrets(sessionId, prompt.requestId, entries, { stored: handed, always: false }));
  };
  const toggle = (name: string) => setSkipped((before) => { const next = new Set(before); if (!next.delete(name)) next.add(name); return next; });
  const grouped = stored.length > 0 || !!card?.again;
  return (
    <form className="cp-permission cp-secrets" aria-label={words.askLabel} onSubmit={(e) => { e.preventDefault(); give(); }}>
      <div className="cp-permission__what"><KeyIcon /><strong>{card?.again ? words.again : who ? words.asksCount(who, asked.length + stored.length) : words.asks(asked.length)}</strong></div>
      {prompt.detail && <p className="cp-secrets__why">{prompt.detail}</p>}
      {stored.length > 0 && (
        <div className="cp-secrets__group">
          <span className="cp-secrets__label">{words.storedGroup}</span>
          <StoredChips stored={stored} skipped={skipped} toggle={toggle} />
        </div>
      )}
      {asked.length > 0 && (
        <div className="cp-secrets__group">
          {grouped && <span className="cp-secrets__label">{card?.again ? words.replaceGroup : words.toPaste}</span>}
          <SecretRows rows={rows} setRows={setRows} fixed={asked} scopes={card?.canSave ? { of: scopes, pick: (name, scope) => setScopes({ ...scopes, [name]: scope }), hint: words.scopesHint(folderName(card.project ?? '')) } : undefined} />
        </div>
      )}
      <div className="cp-permission__actions">
        <button type="submit" className="cp-button" data-variant="primary" disabled={buttons.disabled || !ready}>{words.give}</button>
        <button type="button" className="cp-button" disabled={buttons.disabled} onClick={() => buttons.sent(answerPermission(sessionId, prompt.requestId, 'deny'))}>{words.refuse}</button>
      </div>
      <p className="cp-secrets__note">{card?.canSave && who ? words.onlyNames(who) : words.never}</p>
    </form>
  );
}

/**
 * The keys a session holds (names only): those given to it alone, forgotten one by one or all at once, and those it
 * was handed from the vault (managed in Settings > Keys); new ones given without being asked, for this session only.
 */
export function SecretsDialog({ session, name = '', onClose }: { session: SessionInfo; name?: string; onClose: () => void }) {
  const giveSecrets = useSessions((s) => s.giveSecrets);
  const forgetSecrets = useSessions((s) => s.forgetSecrets);
  const openSettings = useSessions((s) => s.openSettings);
  const lasting = useSessions((s) => s.keys.storage !== 'memory');
  const [rows, setRows] = useState<SecretEntry[]>([emptyRow(name)]);
  const words = t.composer.secrets;
  const inherited = session.inheritedSecrets ?? [];
  const given = (session.secrets ?? []).filter((each) => !inherited.includes(each));
  const give = () => {
    if (!valid(rows)) return;
    if (giveSecrets(session.id, undefined, filled(rows).map((row) => ({ name: row.name.trim(), value: row.value })))) setRows([emptyRow()]);
  };
  const held = (names: readonly string[], label: string) => (
    <div className="cp-secrets__group">
      <span className="cp-secrets__label">{label}</span>
      <ul className="cp-secrets__held" aria-label={label}>
        {names.map((each) => (
          <li key={each}>
            <code>{each}</code>
            <button type="button" className="cp-icon-button" data-size="small" aria-label={words.forget(each)} title={words.forget(each)} onClick={() => forgetSecrets(session.id, [each])}><RemoveIcon /></button>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <Modal title={words.title(session.name)} onClose={onClose}>
      <div className="cp-secrets">
        {given.length > 0 && held(given, words.given)}
        {inherited.length > 0 && held(inherited, words.inherited)}
        {lasting && (
          <button type="button" className="cp-prefs__inherit" onClick={() => { onClose(); openSettings(true, 'keys'); }}>{words.manage}</button>
        )}
        <form className="cp-form" onSubmit={(e) => { e.preventDefault(); give(); }}>
          <SecretRows rows={rows} setRows={setRows} />
          <p className="cp-secrets__note">{words.never} {words.howToUse}</p>
          <div className="cp-form__actions">
            {given.length + inherited.length > 1 && <button type="button" className="cp-button" data-variant="danger" onClick={() => forgetSecrets(session.id)}>{words.forgetAll}</button>}
            <button type="button" className="cp-button" onClick={onClose}>{words.close}</button>
            <button type="submit" className="cp-button" data-variant="primary" disabled={!valid(rows)}>{words.add}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

/** The keys a trigger hands each run (names only, never shown again once saved): forgotten one by one, added or replaced by name. */
export function TriggerKeys({ triggerId }: { triggerId: string }) {
  const held = useSessions((s) => s.triggers.keys[triggerId]) ?? [];
  const elsewhere = useSessions((s) => s.keys.unreachable?.triggers[triggerId]);
  const { setTriggerKeys, forgetTriggerKey } = useSessions.getState();
  const [rows, setRows] = useState<SecretEntry[]>([emptyRow()]);
  const words = t.composer.secrets;
  const save = () => {
    if (valid(rows) && setTriggerKeys(triggerId, filled(rows).map((row) => ({ name: row.name.trim(), value: row.value })))) setRows([emptyRow()]);
  };
  return (
    <div className="cp-secrets">
      {elsewhere?.length ? <p className="cp-keys__warning" role="status"><AlertIcon />{t.settings.keys.triggerUnreachable(elsewhere)}</p> : null}
      {held.length > 0 && (
        <ul className="cp-secrets__held" aria-label={words.held}>
          {held.map((name) => (
            <li key={name}>
              <code>{name}</code>
              <button type="button" className="cp-icon-button" data-size="small" aria-label={words.forget(name)} title={words.forget(name)} onClick={() => forgetTriggerKey(triggerId, name)}><RemoveIcon /></button>
            </li>
          ))}
        </ul>
      )}
      <SecretRows rows={rows} setRows={setRows} focused={false} />
      <button type="button" className="cp-button cp-secrets__save" data-size="small" disabled={!valid(rows)} onClick={save}>{t.automata.triggers.fields.keysSave}</button>
    </div>
  );
}
