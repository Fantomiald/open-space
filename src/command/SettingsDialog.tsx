import { useEffect, useState } from 'react';
import type { Preferences } from '../../shared/protocol.ts';
import { useSessions } from '../state/sessions.ts';
import { Modal } from './Modal.tsx';
import { FoldersPicker, HabitsFields } from './PreferenceFields.tsx';

export function SettingsDialog() {
  const open = useSessions((s) => s.settingsOpen);
  return open ? <SettingsEditor /> : null;
}

/** The settings chosen at the first start, to change: the folders, and how the user likes to work. Saved together. */
function SettingsEditor() {
  const preferences = useSessions((s) => s.preferences);
  const rootsLocked = useSessions((s) => s.rootsLocked);
  const roots = useSessions((s) => s.roots);
  const suggestions = useSessions((s) => s.rootSuggestions);
  const send = useSessions((s) => s.send);
  const setPreferences = useSessions((s) => s.setPreferences);
  const openSettings = useSessions((s) => s.openSettings);
  const toast = useSessions((s) => s.toast);
  const [draft, setDraft] = useState<Preferences>(() => ({ ...preferences, roots: rootsLocked ? roots : preferences.roots }));

  useEffect(() => { send({ t: 'suggestRoots' }); }, [send]);

  const close = () => openSettings(false);
  const save = () => {
    if (!draft.roots.length) { toast('error', 'Garde au moins un dossier : les sessions ne pourraient travailler nulle part.'); return; }
    if (!setPreferences(draft)) { toast('error', 'Pas de connexion au serveur, réessaie.'); return; }
    toast('info', 'Réglages enregistrés.');
    close();
  };

  return (
    <Modal title="Réglages" onClose={close} wide>
      <div className="cp-onboarding__page">
        <h3 className="cp-settings__heading">Tes dossiers</h3>
        <p className="cp-muted">Les sessions ne peuvent travailler que dans ces dossiers et leurs sous-dossiers.</p>
        <FoldersPicker
          roots={draft.roots} onRoots={(next) => setDraft({ ...draft, roots: next })} defaultFolder={draft.defaultFolder}
          onDefaultFolder={(defaultFolder) => setDraft({ ...draft, defaultFolder })} suggestions={suggestions} locked={rootsLocked}
        />
        <h3 className="cp-settings__heading">Tes habitudes</h3>
        <HabitsFields habits={draft} onHabits={(habits) => setDraft({ ...draft, ...habits })} />
        <p className="cp-muted">Ton prénom, ton perso et les anniversaires se changent dans Équipe. Sur Mac, l’app du Dock se crée (ou prend ton nouveau perso comme icône) avec <code>python3 scripts/macos-app.py</code>.</p>
      </div>
      <div className="cp-form__actions">
        <button type="button" className="cp-button" onClick={close}>Annuler</button>
        <button type="button" className="cp-button" data-variant="primary" onClick={save}>Enregistrer</button>
      </div>
    </Modal>
  );
}
