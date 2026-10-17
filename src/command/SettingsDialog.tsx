import { useEffect, useState } from 'react';
import type { Preferences } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { Modal } from './Modal.tsx';
import { FoldersPicker, HabitsFields, LanguagePicker } from './PreferenceFields.tsx';
import { SaveNote } from './SaveNote.tsx';
import { useAutosave } from './useAutosave.ts';

export function SettingsDialog() {
  const open = useSessions((s) => s.settingsOpen);
  return open ? <SettingsEditor /> : null;
}

/** The settings chosen at the first start, to change: the language, the folders, and how the user likes to work. Saved as they change. */
function SettingsEditor() {
  const preferences = useSessions((s) => s.preferences);
  const rootsLocked = useSessions((s) => s.rootsLocked);
  const roots = useSessions((s) => s.roots);
  const suggestions = useSessions((s) => s.rootSuggestions);
  const send = useSessions((s) => s.send);
  const setPreferences = useSessions((s) => s.setPreferences);
  const openSettings = useSessions((s) => s.openSettings);
  const language = useSessions((s) => s.language);
  const [draft, setDraft] = useState<Preferences>(() => ({ ...preferences, roots: rootsLocked ? roots : preferences.roots }));

  useEffect(() => { send({ t: 'suggestRoots' }); }, [send]);

  const close = () => openSettings(false);
  const { status } = useAutosave(draft, (next) => {
    if (!next.roots.length) return t.settings.dialog.noFolder;
    return setPreferences(next) ? null : t.settings.noServer;
  });

  return (
    <Modal title={t.settings.dialog.title} onClose={close} wide>
      <div className="cp-onboarding__page">
        <LanguagePicker language={draft.language ?? language} onLanguage={(next) => setDraft({ ...draft, language: next })} />
        <h3 className="cp-settings__heading">{t.settings.dialog.folders}</h3>
        <p className="cp-muted">{t.settings.dialog.foldersIntro}</p>
        <FoldersPicker
          roots={draft.roots} onRoots={(next) => setDraft({ ...draft, roots: next })} defaultFolder={draft.defaultFolder}
          onDefaultFolder={(defaultFolder) => setDraft({ ...draft, defaultFolder })} suggestions={suggestions} locked={rootsLocked}
        />
        <h3 className="cp-settings__heading">{t.settings.dialog.habits}</h3>
        <HabitsFields habits={draft} onHabits={(habits) => setDraft({ ...draft, ...habits })} />
        <p className="cp-muted">{t.settings.dialog.elsewhere[0]}<code>python3 scripts/macos-app.py</code>{t.settings.dialog.elsewhere[1]}</p>
      </div>
      <div className="cp-form__actions">
        <SaveNote status={status} />
        <button type="button" className="cp-button" onClick={close}>{t.settings.close}</button>
      </div>
    </Modal>
  );
}
