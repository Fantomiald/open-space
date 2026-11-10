import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_MOD_DESCRIPTION, MAX_MOD_NAME, MAX_MOD_REQUEST, MOD_ICONS as ICON_NAMES, MOD_REFRESH, type ModIcon, type ModInfo } from '../../shared/mods.ts';
import { isSecretName, type SecretEntry } from '../../shared/secrets.ts';
import { t } from '../i18n/index.ts';
import { modsNews } from '../room/metrics.ts';
import { useSessions } from '../state/sessions.ts';
import { BackIcon, KeyIcon, MOD_ICONS, ModsIcon, PencilIcon, RefreshIcon, RemoveIcon, SendIcon, SettingsIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { SecretRows } from './SecretPrompt.tsx';

const NO_MODS: ModInfo[] = [];

/** The header's Mods button: it opens the mods' dialog, with a dot when something new waits in one. */
export function ModsButton() {
  const open = useSessions((s) => s.modsOpen);
  const openModsPanel = useSessions((s) => s.openModsPanel);
  const news = useSessions(modsNews);
  const words = t.mods;
  return (
    <div className="cp-mods">
      <button type="button" className="cp-button" data-variant="quiet" aria-haspopup="dialog" aria-expanded={open} data-news={news} aria-label={words.title} title={news ? words.news : words.buttonTitle} onClick={() => openModsPanel(true)}>
        <ModsIcon />
      </button>
    </div>
  );
}

/** The mods' dialog: every mod to open or close, edit or delete, and the field that asks for a new one; or one mod's settings. */
export function ModsDialog() {
  const open = useSessions((s) => s.modsOpen);
  const settingsOf = useSessions((s) => (s.modSettings ? s.mods?.find((mod) => mod.id === s.modSettings) : undefined));
  const openModsPanel = useSessions((s) => s.openModsPanel);
  if (!open) return null;
  // one dialog for both, so going to a mod's settings and back slides inside it rather than closing and opening again
  return (
    <Modal title={settingsOf ? t.mods.settingsView.title(settingsOf.name) : t.mods.heading} onClose={() => openModsPanel(false)} wide look={settingsOf ? 'sheet' : undefined}>
      {settingsOf ? <ModSettingsView key={settingsOf.id} mod={settingsOf} /> : <ModsContent />}
    </Modal>
  );
}

function ModsContent() {
  const mods = useSessions((s) => s.mods) ?? NO_MODS;
  const { openModsPanel } = useSessions.getState();
  const [request, setRequest] = useState('');
  const words = t.mods;
  const close = () => openModsPanel(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (request.trim() && useSessions.getState().createMod(request.trim())) setRequest('');
  };
  return (
    <div className="cp-mods__list">
      <form className="cp-mods__new" onSubmit={submit}>
        <label className="cp-mods__heading" htmlFor="cp-mods-request">{words.newHeading}</label>
        <div className="cp-mods__field">
          <input id="cp-mods-request" className="cp-mods__input" value={request} maxLength={MAX_MOD_REQUEST} placeholder={words.newPlaceholder} onChange={(event) => setRequest(event.target.value)} autoComplete="off" />
          <button type="submit" className="cp-icon-button cp-mods__send" aria-label={words.create} title={words.create} disabled={!request.trim()}><SendIcon /></button>
        </div>
        {mods.length === 0 && (
          <div className="cp-mods__ideas" role="group" aria-label={words.ideasLabel}>
            {words.ideas.map((idea) => <button key={idea} type="button" className="cp-mods__idea" onClick={() => setRequest(idea)}>{idea}</button>)}
          </div>
        )}
        <p className="cp-mods__hint">{words.newHint}</p>
      </form>
      {mods.length === 0 ? <p className="cp-mods__none">{words.none}</p> : (
        <ul className="cp-mods__grid">
          {mods.map((mod) => <ModCard key={mod.id} mod={mod} />)}
        </ul>
      )}
      <div className="cp-form__actions">
        <button type="button" className="cp-button" onClick={close}>{t.settings.close}</button>
      </div>
    </div>
  );
}

function ModCard({ mod }: { mod: ModInfo }) {
  const isOpen = useSessions((s) => s.openMods.includes(mod.id));
  const { openMod, closeMod, deleteMod, openModSettings } = useSessions.getState();
  const [removing, setRemoving] = useState(false);
  const words = t.mods;
  const Icon = MOD_ICONS[mod.icon];
  const chip = mod.draft ? <span className="cp-mods__chip">{words.draft}</span>
    : mod.unread && !isOpen ? <span className="cp-mods__chip" data-tone="news">{words.unread}</span>
    : isOpen ? <span className="cp-mods__chip" data-tone="open">{words.open}</span> : null;
  return (
    <li className="cp-mods__card" data-open={isOpen} onPointerLeave={() => setRemoving(false)}>
      <button type="button" className="cp-mods__open" aria-pressed={isOpen} title={isOpen ? words.close : words.openTitle} onClick={() => (isOpen ? closeMod(mod.id) : openMod(mod.id))}>
        <span className="cp-mods__icon"><Icon /></span>
        <span className="cp-mods__text"><strong>{mod.name}</strong>{mod.description && <small>{mod.description}</small>}</span>
      </button>
      <span className="cp-mods__foot">
        {chip}
        <span className="cp-mods__actions">
          <button type="button" className="cp-icon-button" data-size="small" aria-label={words.settings} title={words.settingsTitle(mod.name)} onClick={() => openModSettings(mod.id)}><SettingsIcon /></button>
          {removing
            ? <button type="button" className="cp-button cp-mods__confirm" onClick={() => deleteMod(mod.id)}>{words.confirmRemove}</button>
            : <button type="button" className="cp-icon-button" data-size="small" aria-label={words.remove} title={words.removeTitle(mod.name)} onClick={() => setRemoving(true)}><RemoveIcon /></button>}
        </span>
      </span>
    </li>
  );
}

const withValue = (rows: readonly SecretEntry[]) => rows.map((row) => ({ name: row.name.trim(), value: row.value })).filter((row) => row.name);

/**
 * A mod's settings, in place of the list: its name, description and icon, how often its window refreshes it, and the
 * variables its page reads (the ones it asks for in its mod.json first). Saved at once, then back to the list.
 */
function ModSettingsView({ mod }: { mod: ModInfo }) {
  const { openModSettings, configureMod, editMod } = useSessions.getState();
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const words = t.mods.settingsView;
  const [name, setName] = useState(mod.name);
  const [description, setDescription] = useState(mod.description);
  const [icon, setIcon] = useState<ModIcon>(mod.icon);
  const [refresh, setRefresh] = useState(mod.refresh);
  const asked = mod.env.map((need) => need.name);
  const [rows, setRows] = useState<SecretEntry[]>(() => {
    const names = [...asked, ...mod.envSet.filter((each) => !asked.includes(each))];
    return names.length ? names.map((each) => ({ name: each, value: '' })) : [{ name: '', value: '' }];
  });
  const hints = Object.fromEntries(mod.env.filter((need) => need.label).map((need) => [need.name, need.label]));
  const entries = withValue(rows);
  const names = entries.map((row) => row.name);
  const rowsValid = entries.every((row) => isSecretName(row.name)) && new Set(names).size === names.length;
  const valid = name.trim() !== '' && rowsValid;
  const back = () => openModSettings(null);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    // a variable asked for but left empty, never given: nothing to keep
    const env = entries.filter((row) => row.value || mod.envSet.includes(row.name));
    configureMod(mod.id, { name: name.trim(), description: description.trim(), icon, refresh, env });
    back();
  };
  const Icon = MOD_ICONS[icon];
  return (
    <form className="cp-mod-settings" onSubmit={save}>
      <header className="cp-mod-settings__head">
        <button type="button" className="cp-icon-button" aria-label={words.back} title={words.back} onClick={back}><BackIcon /></button>
        <span className="cp-mods__icon" aria-hidden="true"><Icon /></span>
        <div className="cp-mod-settings__titles">
          <h3>{name.trim() || mod.name}</h3>
          <p>{words.subtitle}</p>
        </div>
      </header>

      <div className="cp-mod-settings__content">
      <section className="cp-prefs__group" aria-labelledby="cp-mod-settings-window">
        <h4 className="cp-prefs__group-title" id="cp-mod-settings-window">{words.window}</h4>
        <div className="cp-prefs__card">
          <label className="cp-mod-settings__field">
            <span>{words.name}</span>
            <input value={name} maxLength={MAX_MOD_NAME} required onChange={(event) => setName(event.target.value)} autoComplete="off" ref={first} />
          </label>
          <label className="cp-mod-settings__field">
            <span>{words.description}</span>
            <input value={description} maxLength={MAX_MOD_DESCRIPTION} placeholder={words.descriptionPlaceholder} onChange={(event) => setDescription(event.target.value)} autoComplete="off" />
          </label>
          <div className="cp-mod-settings__field" role="radiogroup" aria-label={words.icon}>
            <span aria-hidden="true">{words.icon}</span>
            <div className="cp-mod-settings__icons">
              {ICON_NAMES.map((each) => {
                const Each = MOD_ICONS[each];
                return <button key={each} type="button" role="radio" className="cp-mod-settings__icon" aria-checked={each === icon} aria-label={each} title={each} onClick={() => setIcon(each)}><Each /></button>;
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="cp-prefs__group" aria-labelledby="cp-mod-settings-refresh">
        <h4 className="cp-prefs__group-title" id="cp-mod-settings-refresh">{words.refresh}</h4>
        <div className="cp-prefs__card">
          <div className="cp-mod-settings__field">
            <span className="cp-mod-settings__label"><RefreshIcon />{words.refreshLabel}</span>
            <div className="cp-segmented cp-mod-settings__paces" role="radiogroup" aria-label={words.refreshLabel}>
              {MOD_REFRESH.map((seconds) => (
                <button key={seconds} type="button" role="radio" aria-checked={seconds === refresh} onClick={() => setRefresh(seconds)}>{words.pace(seconds)}</button>
              ))}
            </div>
            <small>{refresh ? words.refreshHint(refresh) : words.refreshNever}</small>
          </div>
        </div>
      </section>

      <section className="cp-prefs__group" aria-labelledby="cp-mod-settings-env">
        <h4 className="cp-prefs__group-title" id="cp-mod-settings-env">{words.env}</h4>
        <div className="cp-prefs__card cp-mod-settings__env">
          <p className="cp-mod-settings__note"><KeyIcon />{words.envHint}</p>
          <SecretRows rows={rows} setRows={setRows} fixed={asked} kept={mod.envSet} hints={hints} addLabel={words.addVariable} />
          {!rowsValid && <p className="cp-mod-settings__error" role="alert">{words.envInvalid}</p>}
        </div>
      </section>

      </div>

      <footer className="cp-mod-settings__foot">
        <button type="button" className="cp-button" data-variant="quiet" onClick={() => editMod(mod.id)}><PencilIcon />{words.editWithAgent}</button>
        <span className="cp-mod-settings__actions">
          <button type="button" className="cp-button" onClick={back}>{words.cancel}</button>
          <button type="submit" className="cp-button" data-variant="primary" disabled={!valid}>{words.save}</button>
        </span>
      </footer>
    </form>
  );
}
