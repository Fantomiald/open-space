import { useEffect, useState } from 'react';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import type { Look } from '../../shared/look.ts';
import { DEFAULT_PET } from '../../shared/pets.ts';
import { GLASS_OPACITY, type Preferences } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { chibiHead } from '../room/chibi.ts';
import { useSessions } from '../state/sessions.ts';
import { LookEditor } from './CrewDialog.tsx';
import { FoldersPicker, HabitsFields, LanguagePicker, PetPicker } from './PreferenceFields.tsx';
import { ShowcaseArt } from './ShowcaseArt.tsx';
import { ONBOARDING_SLIDES, Tour } from './Tour.tsx';
import { markNewsSeen } from './WhatsNewDialog.tsx';

/**
 * The first start: the language, who the user is (their own character, their birthday), the folders sessions may run in,
 * how they like to work, and a tour of what Open Space does (Tour.tsx, which can be skipped). Nothing runs before it is done; everything stays changeable afterwards (the crew editor, the
 * settings). The language is saved at once and the page is mounted again in it, losing what was typed: so it comes first.
 */
export function Onboarding() {
  const claude = useSessions((s) => s.claude);
  const rootsLocked = useSessions((s) => s.rootsLocked);
  const lockedRoots = useSessions((s) => s.roots);
  const suggestions = useSessions((s) => s.rootSuggestions);
  const send = useSessions((s) => s.send);
  const language = useSessions((s) => s.language);
  const saveLanguage = useSessions((s) => s.setPreferences);
  // a crew file copied in before the first start: the user may be in it already
  const crew = useSessions((s) => s.crew).filter((member) => !member.self);
  const steps = t.settings.onboarding.steps;
  const [step, setStep] = useState(0);
  const [slide, setSlide] = useState(0);
  const [name, setName] = useState('');
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [birthday, setBirthday] = useState('');
  const [roots, setRoots] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<Omit<Preferences, 'roots'>>({
    notifications: true, defaultFolder: '', model: 'opus', permissionMode: 'auto', agentNote: '', festivals: true, officeLife: true, theme: 'office', pet: DEFAULT_PET, isolate: 'busy', autoPip: true, autoTag: false, autoTagRule: '',
    // empty: the server's default (~/Journal), and no numbers file; changed later in the settings
    journalFolder: '',
    favoriteNotes: [],
    automataFolder: '',
    hooksAddress: '',
    copyOnSelect: false, effort: '', claude: {}, timeFormat: 'auto', timestamps: false, turnDuration: true, detailedActions: false, promptSuggestions: true, reduceMotion: false, glassOpacity: GLASS_OPACITY.initial, windowStyle: 'classic', tagColors: false, remoteByDefault: false, idleCompact: 0, accountsBrowser: 'shared',
  });

  useEffect(() => { send({ t: 'suggestRoots' }); }, [send]);
  // the folders holding the most projects come checked
  useEffect(() => {
    if (suggestions) setRoots((current) => (current.length ? current : suggestions.filter((folder) => folder.projects > 0).slice(0, 3).map((folder) => folder.path)));
  }, [suggestions]);

  const welcome = t.settings.onboarding.welcome;
  const chosenRoots = rootsLocked ? lockedRoots : roots;
  const canGoOn = step === 1 ? name.trim() !== '' : step === 2 ? chosenRoots.length > 0 : true;
  const finish = () => {
    const defaultFolder = chosenRoots.includes(preferences.defaultFolder) ? preferences.defaultFolder : chosenRoots[0] ?? '';
    // the news of this version would only repeat the tour
    markNewsSeen();
    send({ t: 'onboard', self: { name: name.trim(), look, ...(birthday ? { birthday } : {}) }, preferences: { ...preferences, language, defaultFolder, roots: chosenRoots } });
  };
  const touring = step === steps.length - 1;
  const lastSlide = slide === ONBOARDING_SLIDES.length - 1;
  const next = () => {
    if (!canGoOn) return;
    if (!touring) setStep(step + 1);
    else if (lastSlide) finish();
    else setSlide(slide + 1);
  };
  const back = () => { if (touring && slide > 0) setSlide(slide - 1); else setStep(step - 1); };

  return (
    <main className="cp-onboarding" aria-labelledby="onboarding-title">
      <div className="cp-onboarding__card" data-touring={touring}>
        <ol className="cp-onboarding__steps" aria-label={t.settings.onboarding.stepsLabel}>
          {steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} data-done={index < step}>{label}</li>)}
        </ol>

        {step === 0 && (
          <section className="cp-onboarding__page">
            <div className="cp-onboarding__hero">
              <ShowcaseArt art="room" />
              <LanguagePicker language={language} onLanguage={(next) => saveLanguage({ language: next })} />
            </div>
            <h1 id="onboarding-title">{welcome.title}</h1>
            <p className="cp-onboarding__lead">{welcome.intro}</p>
            <p className="cp-muted">{welcome.setup[0]}<code>CLAUDE.md</code>{welcome.setup[1]}<code>claude</code>{welcome.setup[2]}</p>
            {claude?.found
              ? <p className="cp-onboarding__check" data-ok="true">{welcome.claudeFound(claude.version)}</p>
              : <p className="cp-onboarding__check" data-ok="false">{welcome.claudeMissing[0]}<code>npm install -g @anthropic-ai/claude-code</code>{welcome.claudeMissing[1]}<code>claude</code>{welcome.claudeMissing[2]}</p>}
            <p className="cp-muted">{welcome.fewSteps}</p>
          </section>
        )}

        {step === 1 && (
          <section className="cp-onboarding__page">
            <h1 id="onboarding-title">{t.settings.onboarding.you.title}</h1>
            <p className="cp-muted">{t.settings.onboarding.you.intro}</p>
            {crew.length > 0 && (
              <div className="cp-onboarding__crew">
                <p>{t.settings.onboarding.you.alreadyInCrew}</p>
                <div role="radiogroup" aria-label={t.settings.onboarding.you.youInCrew}>
                  {crew.map((member) => (
                    <button
                      key={member.name} type="button" role="radio" aria-checked={name.trim() === member.name} className="cp-crew__member"
                      onClick={() => { setName(member.name); setLook(member.look ?? DEFAULT_LOOK); setBirthday(member.birthday ?? ''); }}
                    >
                      <img src={chibiHead(member.look ?? DEFAULT_LOOK)} alt="" width={27} height={27} />
                      <span>{member.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="cp-crew" data-solo="true">
              <LookEditor look={look} onLook={setLook} name={name} onName={setName} birthday={birthday} onBirthday={setBirthday} />
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="cp-onboarding__page">
            <h1 id="onboarding-title">{t.settings.onboarding.folders.title}</h1>
            <p className="cp-muted">{t.settings.onboarding.folders.intro}</p>
            <FoldersPicker
              roots={chosenRoots} onRoots={setRoots} defaultFolder={preferences.defaultFolder} onDefaultFolder={(defaultFolder) => setPreferences({ ...preferences, defaultFolder })}
              suggestions={suggestions} locked={rootsLocked}
            />
          </section>
        )}

        {step === 3 && (
          <section className="cp-onboarding__page">
            <h1 id="onboarding-title">{t.settings.onboarding.habits.title}</h1>
            <PetPicker pet={preferences.pet} onPet={(pet) => setPreferences({ ...preferences, pet })} />
            <HabitsFields habits={preferences} onHabits={(habits) => setPreferences({ ...preferences, ...habits })} />
          </section>
        )}

        {touring && <Tour index={slide} onIndex={setSlide} look={look} slides={ONBOARDING_SLIDES} />}

        <div className="cp-onboarding__actions">
          {touring && !lastSlide && <button type="button" className="cp-button cp-onboarding__skip" data-variant="quiet" onClick={finish}>{t.showcase.tour.skip}</button>}
          {step > 0 && <button type="button" className="cp-button" onClick={back}>{t.settings.onboarding.back}</button>}
          <button type="button" className="cp-button" data-variant="primary" disabled={!canGoOn} onClick={next}>
            {step === 0 ? t.settings.onboarding.start : touring ? (lastSlide ? t.settings.onboarding.finish : t.showcase.tour.next) : t.settings.onboarding.next}
          </button>
        </div>
      </div>
    </main>
  );
}
