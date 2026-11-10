import { useState, type FormEvent } from 'react';
import { MAX_MOD_REQUEST, type ModInfo } from '../../shared/mods.ts';
import { t } from '../i18n/index.ts';
import { modsNews } from '../room/metrics.ts';
import { useSessions } from '../state/sessions.ts';
import { ChartIcon, MOD_ICONS, ModsIcon, PencilIcon, RemoveIcon, SendIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';

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

/** The mods' dialog: every mod to open or close, edit or delete, and the field that asks for a new one. */
export function ModsDialog() {
  const open = useSessions((s) => s.modsOpen);
  return open ? <ModsContent /> : null;
}

function ModsContent() {
  const mods = useSessions((s) => s.mods) ?? NO_MODS;
  const withMetrics = useSessions((s) => s.preferences.metricsFile !== '');
  const metricsUnread = useSessions((s) => s.metricsUnread);
  const { openMetrics, openModsPanel } = useSessions.getState();
  const [request, setRequest] = useState('');
  const words = t.mods;
  const close = () => openModsPanel(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (request.trim() && useSessions.getState().createMod(request.trim())) setRequest('');
  };
  return (
    <Modal title={words.heading} onClose={close} wide>
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
      {mods.length === 0 && !withMetrics ? <p className="cp-mods__none">{words.none}</p> : (
        <ul className="cp-mods__grid">
          {mods.map((mod) => <ModCard key={mod.id} mod={mod} />)}
          {withMetrics && (
            <li className="cp-mods__card">
              <button type="button" className="cp-mods__open" onClick={() => { close(); openMetrics(true); }}>
                <span className="cp-mods__icon"><ChartIcon /></span>
                <span className="cp-mods__text"><strong>{words.metrics}</strong><small>{words.metricsDescription}</small></span>
              </button>
              {metricsUnread && <span className="cp-mods__foot"><span className="cp-mods__chip" data-tone="news">{words.unread}</span></span>}
            </li>
          )}
        </ul>
      )}
      <div className="cp-form__actions">
        <button type="button" className="cp-button" onClick={close}>{t.settings.close}</button>
      </div>
    </Modal>
  );
}

function ModCard({ mod }: { mod: ModInfo }) {
  const isOpen = useSessions((s) => s.openMods.includes(mod.id));
  const { openMod, closeMod, editMod, deleteMod } = useSessions.getState();
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
          <button type="button" className="cp-icon-button" data-size="small" aria-label={words.edit} title={words.editTitle(mod.name)} onClick={() => editMod(mod.id)}><PencilIcon /></button>
          {removing
            ? <button type="button" className="cp-button cp-mods__confirm" onClick={() => deleteMod(mod.id)}>{words.confirmRemove}</button>
            : <button type="button" className="cp-icon-button" data-size="small" aria-label={words.remove} title={words.removeTitle(mod.name)} onClick={() => setRemoving(true)}><RemoveIcon /></button>}
        </span>
      </span>
    </li>
  );
}
