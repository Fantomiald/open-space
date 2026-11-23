// Settings > Keys: the keys of the vault (server/vault.ts), names only: who each is kept for (every session, a project,
// a trigger, a mod), who used it and when (in amber after a month), and the way to add, replace or delete one. A key
// replaced here is replaced for every session it was handed to. The last line says how they are kept on this computer.
import { useState } from 'react';
import type { SecretEntry, StoredKey, VaultScope } from '../../shared/secrets.ts';
import { t } from '../i18n/index.ts';
import { folderName, formatAgo, homeRelative } from '../lib/format.ts';
import { isStale, projectChoices, sortKeys } from '../state/keys.ts';
import { useSessions } from '../state/sessions.ts';
import { AlertIcon, LockIcon, PlusIcon } from './Icons.tsx';
import { SecretRows } from './SecretPrompt.tsx';

const MAX_PROJECTS_NAMED = 3;
const ALL = '*';

type Editing = { kind: 'add' } | { kind: 'replace'; key: StoredKey } | null;

export function KeysPanel() {
  const { storage, keys, unreachable } = useSessions((s) => s.keys);
  const here = useSessions((s) => (s.selectedId ? s.sessions[s.selectedId]?.project : undefined));
  const [editing, setEditing] = useState<Editing>(null);
  const words = t.settings.keys;
  const shown = sortKeys(keys);
  return (
    <section className="cp-prefs__group cp-keys" aria-label={t.settings.prefs.sections.keys}>
      <div className="cp-keys__tools">
        {storage !== 'memory' && !editing && <button type="button" className="cp-button" data-variant="primary" data-size="small" onClick={() => setEditing({ kind: 'add' })}><PlusIcon />{words.add}</button>}
      </div>
      {unreachable && <p className="cp-keys__warning" role="status"><AlertIcon />{words.unreachable}</p>}
      {editing && <KeyForm editing={editing} here={here} done={() => setEditing(null)} />}
      {shown.length ? (
        <div className="cp-prefs__card cp-keys__card">
          <table className="cp-keys__table">
            <thead>
              <tr><th>{words.columns.name}</th><th>{words.columns.scope}</th><th>{words.columns.usedBy}</th><th>{words.columns.lastUsed}</th><th><span className="cp-sr-only">{words.columns.actions}</span></th></tr>
            </thead>
            <tbody>{shown.map((key) => <KeyRow key={key.id} stored={key} replace={() => setEditing({ kind: 'replace', key })} />)}</tbody>
          </table>
        </div>
      ) : (
        <p className="cp-prefs__empty">{storage === 'memory' ? words.storage.memory : words.empty}</p>
      )}
      <p className="cp-keys__storage" data-storage={storage}><LockIcon />{words.storage[storage]}</p>
    </section>
  );
}

/** Who a key is for: every session, a project (its folder's name), a trigger or a mod (its name, or that it is gone). */
function useOwnerName() {
  const triggers = useSessions((s) => s.triggers.triggers);
  const mods = useSessions((s) => s.mods) ?? [];
  const trashed = useSessions((s) => s.keys.trashedMods);
  const words = t.settings.keys;
  return (key: StoredKey) => {
    if (key.scope === 'all') return words.everywhere;
    if (key.scope === 'project') return folderName(key.owner ?? '');
    if (key.scope === 'trigger') return triggers.find((each) => each.id === key.owner)?.name ?? words.gone;
    return mods.find((each) => each.id === key.owner)?.name ?? trashed?.[key.owner ?? ''] ?? words.gone;
  };
}

function KeyRow({ stored, replace }: { stored: StoredKey; replace: () => void }) {
  const deleteKey = useSessions((s) => s.deleteKey);
  const ownerName = useOwnerName();
  const inTrash = useSessions((s) => stored.scope === 'mod' && !s.mods?.some((mod) => mod.id === stored.owner) && !!s.keys.trashedMods?.[stored.owner ?? '']);
  const [removing, setRemoving] = useState(false);
  const words = t.settings.keys;
  const owner = ownerName(stored);
  const usedBy = stored.scope === 'trigger' ? words.trigger(owner)
    : stored.scope === 'mod' ? (inTrash ? words.modInTrash : words.mod(owner))
    : stored.usedIn.length > MAX_PROJECTS_NAMED ? words.projects(stored.usedIn.length)
    : stored.usedIn.map(folderName).join(', ') || words.unused;
  const now = Date.now();
  return (
    <tr>
      <td className="cp-keys__name"><code>{stored.name}</code></td>
      <td className="cp-keys__scope"><span className="cp-keys__pill" data-scope={stored.scope} title={stored.scope === 'project' ? homeRelative(stored.owner ?? '') : undefined}>{owner}</span></td>
      <td className="cp-keys__used">{usedBy}</td>
      <td className="cp-keys__when" data-stale={isStale(stored, now)} title={stored.lastUsed?.by}>{stored.lastUsed ? formatAgo(now - stored.lastUsed.at) : words.never}</td>
      <td className="cp-keys__actions">
        {removing ? (
          <span className="cp-keys__confirm">
            <span>{words.removeAsk(stored.name)}</span>
            <button type="button" className="cp-button" data-size="small" data-variant="danger" onClick={() => deleteKey(stored.id)}>{words.remove}</button>
            <button type="button" className="cp-button" data-size="small" onClick={() => setRemoving(false)}>{words.cancel}</button>
          </span>
        ) : (
          <>
            <button type="button" className="cp-button" data-size="small" data-variant="quiet" onClick={replace}>{words.replace}</button>
            <button type="button" className="cp-button" data-size="small" data-variant="quiet" onClick={() => setRemoving(true)}>{words.remove}</button>
          </>
        )}
      </td>
    </tr>
  );
}

/** A key to add (its name, its value, for every session or one project) or the new value of one (`replace`). */
function KeyForm({ editing, here, done }: { editing: Exclude<Editing, null>; here?: string; done: () => void }) {
  const { saveKey, replaceKey } = useSessions.getState();
  const sessions = useSessions((s) => s.sessions);
  const keys = useSessions((s) => s.keys.keys);
  const replacing = editing.kind === 'replace' ? editing.key : null;
  const [rows, setRows] = useState<SecretEntry[]>([{ name: replacing?.name ?? '', value: '' }]);
  const [scope, setScope] = useState(here ?? ALL);
  const words = t.settings.keys;
  const filled = rows.filter((row) => row.name.trim() && row.value);
  const save = () => {
    if (!filled.length) return;
    if (replacing) { if (replaceKey(replacing.id, filled[0]!.value)) done(); return; }
    const where: VaultScope = scope === ALL ? { kind: 'all' } : { kind: 'project', path: scope };
    if (filled.every((row) => saveKey(row.name.trim(), row.value, where))) done();
  };
  return (
    <form className="cp-prefs__card cp-keys__form" aria-label={replacing ? words.replaceTitle(replacing.name) : words.add} onSubmit={(e) => { e.preventDefault(); save(); }}>
      {replacing && <h5 className="cp-keys__form-title">{words.replaceTitle(replacing.name)}</h5>}
      <SecretRows rows={rows} setRows={setRows} fixed={replacing ? [replacing.name] : undefined} more={!replacing} />
      {!replacing && (
        <label className="cp-keys__where">
          <span>{words.scope}</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value={ALL}>{words.everywhere}</option>
            {projectChoices(Object.values(sessions).map((session) => session.project), keys).map((project) => <option key={project} value={project}>{homeRelative(project)}</option>)}
          </select>
        </label>
      )}
      <div className="cp-form__actions">
        <button type="button" className="cp-button" onClick={done}>{words.cancel}</button>
        <button type="submit" className="cp-button" data-variant="primary" disabled={!filled.length}>{words.save}</button>
      </div>
    </form>
  );
}
