import { useEffect, useState } from 'react';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import type { Look } from '../../shared/look.ts';
import { DEFAULT_PET } from '../../shared/pets.ts';
import type { Preferences } from '../../shared/protocol.ts';
import { useSessions } from '../state/sessions.ts';
import { LookEditor } from './CrewDialog.tsx';
import { FoldersPicker, HabitsFields, PetPicker } from './PreferenceFields.tsx';

const STEPS = ['Bienvenue', 'Toi', 'Tes dossiers', 'Tes habitudes'] as const;

/**
 * The first start: who the user is (their own character, their birthday), the folders sessions may run in, and how they
 * like to work. Nothing runs before it is done; everything stays changeable afterwards (the crew editor, the settings).
 */
export function Onboarding() {
  const claude = useSessions((s) => s.claude);
  const rootsLocked = useSessions((s) => s.rootsLocked);
  const lockedRoots = useSessions((s) => s.roots);
  const suggestions = useSessions((s) => s.rootSuggestions);
  const send = useSessions((s) => s.send);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [birthday, setBirthday] = useState('');
  const [roots, setRoots] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<Omit<Preferences, 'roots'>>({
    notifications: true, defaultFolder: '', model: 'opus', permissionMode: 'auto', agentNote: '', festivals: true, pet: DEFAULT_PET,
  });

  useEffect(() => { send({ t: 'suggestRoots' }); }, [send]);
  // the folders holding the most projects come checked
  useEffect(() => {
    if (suggestions) setRoots((current) => (current.length ? current : suggestions.filter((folder) => folder.projects > 0).slice(0, 3).map((folder) => folder.path)));
  }, [suggestions]);

  const chosenRoots = rootsLocked ? lockedRoots : roots;
  const canGoOn = step === 1 ? name.trim() !== '' : step === 2 ? chosenRoots.length > 0 : true;
  const finish = () => {
    const defaultFolder = chosenRoots.includes(preferences.defaultFolder) ? preferences.defaultFolder : chosenRoots[0] ?? '';
    send({ t: 'onboard', self: { name: name.trim(), look, ...(birthday ? { birthday } : {}) }, preferences: { ...preferences, defaultFolder, roots: chosenRoots } });
  };
  const next = () => { if (!canGoOn) return; if (step === STEPS.length - 1) finish(); else setStep(step + 1); };

  return (
    <main className="cp-onboarding" aria-labelledby="onboarding-title">
      <div className="cp-onboarding__card">
        <ol className="cp-onboarding__steps" aria-label="Étapes">
          {STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} data-done={index < step}>{label}</li>)}
        </ol>

        {step === 0 && (
          <section className="cp-onboarding__page">
            <h1 id="onboarding-title">Bienvenue dans ton Open Space</h1>
            <p>Ici, tu lances et suis plusieurs sessions Claude Code en même temps, dans un petit bureau en pixel art : chaque session est un perso à son poste, qui lève la main quand il a besoin de toi.</p>
            <p>Tes skills, tes plugins, ton <code>CLAUDE.md</code> et tes réglages de Claude Code s’appliquent comme dans ton terminal : Open Space ne fait que lancer le <code>claude</code> de ton ordinateur.</p>
            {claude?.found
              ? <p className="cp-onboarding__check" data-ok="true">Claude Code {claude.version} est bien là.</p>
              : <p className="cp-onboarding__check" data-ok="false">Claude Code est introuvable. Installe-le (<code>npm install -g @anthropic-ai/claude-code</code>), lance <code>claude</code> une fois dans un terminal pour te connecter, puis relance Open Space.</p>}
            <p className="cp-muted">Quatre petites étapes, et tout reste modifiable ensuite.</p>
          </section>
        )}

        {step === 1 && (
          <section className="cp-onboarding__page">
            <h1 id="onboarding-title">Toi</h1>
            <p className="cp-muted">Ton perso dans le bureau. Ton prénom est aussi donné à tes agents, et ton anniversaire fait la fête dans les deux pièces.</p>
            <div className="cp-crew" data-solo="true">
              <LookEditor look={look} onLook={setLook} name={name} onName={setName} birthday={birthday} onBirthday={setBirthday} />
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="cp-onboarding__page">
            <h1 id="onboarding-title">Tes dossiers</h1>
            <p className="cp-muted">Les sessions ne peuvent travailler que dans ces dossiers et leurs sous-dossiers. Coche ceux où tu ranges tes projets.</p>
            <FoldersPicker
              roots={chosenRoots} onRoots={setRoots} defaultFolder={preferences.defaultFolder} onDefaultFolder={(defaultFolder) => setPreferences({ ...preferences, defaultFolder })}
              suggestions={suggestions} locked={rootsLocked}
            />
          </section>
        )}

        {step === 3 && (
          <section className="cp-onboarding__page">
            <h1 id="onboarding-title">Tes habitudes</h1>
            <PetPicker pet={preferences.pet} onPet={(pet) => setPreferences({ ...preferences, pet })} />
            <HabitsFields habits={preferences} onHabits={(habits) => setPreferences({ ...preferences, ...habits })} />
          </section>
        )}

        <div className="cp-onboarding__actions">
          {step > 0 && <button type="button" className="cp-button" onClick={() => setStep(step - 1)}>Retour</button>}
          <button type="button" className="cp-button" data-variant="primary" disabled={!canGoOn} onClick={next}>
            {step === 0 ? 'C’est parti' : step === STEPS.length - 1 ? 'Ouvrir mon bureau' : 'Continuer'}
          </button>
        </div>
      </div>
    </main>
  );
}
