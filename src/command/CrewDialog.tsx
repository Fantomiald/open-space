import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CLOTH_COLORS, DEFAULT_LOOK, FANCY_SKINS, GLASSES_COLORS, HAIR_COLORS, SKIN_TONES } from '../design/people-palette.ts';
import { JOBS, type Job } from '../../shared/jobs.ts';
import { BEARD_STYLES, BOTTOMS, EYES, HAIR_STYLES, HATS, SHOES, TOPS, type Look } from '../../shared/look.ts';
import type { CrewMember } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { HAT_ROWS, chibiHead, chibiSprite } from '../room/chibi.ts';
import type { Pose } from '../room/sprites.ts';
import { useSessions } from '../state/sessions.ts';
import { Modal } from './Modal.tsx';
import { PetPicker } from './PreferenceFields.tsx';
import { SaveNote } from './SaveNote.tsx';
import { useAutosave } from './useAutosave.ts';

/** The hats that take a colour of one's choice. */
const COLOURED_HATS: ReadonlySet<Look['hat']> = new Set(['cap', 'beanie', 'beret', 'tophat', 'party']);

const TABS = ['face', 'hair', 'beard', 'head', 'top', 'bottom', 'shoes'] as const;
type Tab = (typeof TABS)[number];

/** The four directions of the room, turned one after the other by the preview's arrows. */
const DIRECTIONS: Pose['direction'][] = ['down-right', 'down-left', 'up-left', 'up-right'];

type Draft = { previousName: string | null; name: string; look: Look; self: boolean; birthday: string; jobs: readonly Job[] };
const draftOf = (member: CrewMember): Draft => ({ previousName: member.name, name: member.name, look: member.look ?? DEFAULT_LOOK, self: member.self === true, birthday: member.birthday ?? '', jobs: member.jobs ?? [] });
const NEW_MEMBER: Draft = { previousName: null, name: '', look: DEFAULT_LOOK, self: false, birthday: '', jobs: [] };

export function CrewDialog() {
  const open = useSessions((s) => s.crewOpen);
  return open ? <CrewEditor /> : null;
}

/** The crew in two tabs: the people (the user among them), and the office pet. */
function CrewEditor() {
  const openCrew = useSessions((s) => s.openCrew);
  const [section, setSection] = useState<'people' | 'pet'>('people');
  const close = () => openCrew(false);
  return (
    <Modal title={t.settings.crew.title} onClose={close} wide>
      <div className="cp-segmented cp-crew__sections" role="tablist" aria-label={t.settings.crew.sections}>
        <button type="button" role="tab" aria-selected={section === 'people'} onClick={() => setSection('people')}>{t.settings.crew.people}</button>
        <button type="button" role="tab" aria-selected={section === 'pet'} onClick={() => setSection('pet')}>{t.settings.crew.pet}</button>
      </div>
      {section === 'people' ? <PeopleTab close={close} /> : <PetTab close={close} />}
    </Modal>
  );
}

/** The office pet, saved with the settings (Preferences.pet) as soon as it changes. */
function PetTab({ close }: { close: () => void }) {
  const saved = useSessions((s) => s.preferences.pet);
  const setPreferences = useSessions((s) => s.setPreferences);
  const [pet, setPet] = useState(saved);
  const { status } = useAutosave(pet, (next) => (setPreferences({ pet: next }) ? null : t.settings.noServer));
  return (
    <>
      <div className="cp-onboarding__page"><PetPicker pet={pet} onPet={setPet} /></div>
      <div className="cp-form__actions">
        <SaveNote status={status} />
        <button type="button" className="cp-button" onClick={close}>{t.settings.close}</button>
      </div>
    </>
  );
}

/** What decides a save of a member: the person themselves, not who the draft was loaded from. */
const memberKey = ({ previousName: _from, ...member }: Draft) => JSON.stringify(member);
/** A first name being typed waits longer: each save renames the member, so not after every letter. */
const RENAME_DELAY_MS = 1500;

function PeopleTab({ close }: { close: () => void }) {
  const crew = useSessions((s) => s.crew);
  const saveMember = useSessions((s) => s.saveMember);
  const removeMember = useSessions((s) => s.removeMember);
  const becomeSelf = useSessions((s) => s.becomeSelf);
  const sessions = useSessions((s) => s.sessions);
  const first = crew.find((member) => member.self) ?? crew[0];
  const [draft, setDraft] = useState<Draft>(() => (first ? draftOf(first) : NEW_MEMBER));
  const [confirmRemove, setConfirmRemove] = useState(false);

  // saved as it is edited: a rename moves the member, so the draft then comes from its new name
  const save = (current: Draft): string | null => {
    const name = current.name.trim();
    if (!name) return t.settings.crew.noName;
    if (crew.some((member) => member.name === name && member.name !== current.previousName)) return t.settings.crew.nameTaken(name);
    if (!saveMember(current.previousName, name, current.look, current.birthday || undefined, current.self ? [] : current.jobs)) return t.settings.noServer;
    setDraft((latest) => ({ ...latest, previousName: name }));
    return null;
  };
  // a new member is created with the name typed so far: it waits as much
  const renaming = draft.name.trim() !== (draft.previousName ?? '');
  const { status, flush, start } = useAutosave(draft, save, memberKey, renaming ? RENAME_DELAY_MS : undefined);

  const pick = (member: Draft) => { flush(); start(member); setDraft(member); setConfirmRemove(false); };
  const remove = (name: string) => {
    const next = first && first.name !== name ? draftOf(first) : NEW_MEMBER;
    start(next);
    removeMember(name);
    setDraft(next);
    setConfirmRemove(false);
  };
  // the user's perso in the room: someone at work in a session would be them twice
  const busy = draft.previousName !== null && Object.values(sessions).some((session) => session.name === draft.previousName);
  const becomeThem = (name: string) => {
    flush();
    if (!becomeSelf(name)) return;
    const next = { ...draft, previousName: name, name, self: true };
    start(next);
    setDraft(next);
  };

  return (
    <>
      <div className="cp-crew">
        <nav className="cp-crew__list" aria-label={t.settings.crew.people}>
          {crew.map((member) => (
            <button key={member.name} type="button" className="cp-crew__member" aria-current={draft.previousName === member.name} onClick={() => pick(draftOf(member))}>
              <img src={chibiHead(member.look ?? DEFAULT_LOOK)} alt="" width={27} height={27} />
              <span>{member.name}{member.self && <small className="cp-muted">{t.settings.crew.you}</small>}</span>
            </button>
          ))}
          <button type="button" className="cp-button" onClick={() => pick(NEW_MEMBER)}>
            {t.settings.crew.addPerson}
          </button>
        </nav>
        <LookEditor
          look={draft.look} onLook={(look) => setDraft((current) => ({ ...current, look }))}
          name={draft.name} onName={(name) => setDraft((current) => ({ ...current, name }))}
          birthday={draft.birthday} onBirthday={(birthday) => setDraft((current) => ({ ...current, birthday }))}
          jobs={draft.self ? undefined : { chosen: draft.jobs, onChange: (jobs) => setDraft((current) => ({ ...current, jobs })) }}
        />
      </div>

      <div className="cp-form__actions">
        <SaveNote status={status} />
        {draft.previousName !== null && !draft.self && (
          <button
            type="button" className="cp-button" disabled={busy} onClick={() => becomeThem(draft.previousName!)}
            title={busy ? t.settings.crew.busy(draft.previousName) : t.settings.crew.becomeThem(draft.previousName)}
          >
            {t.settings.crew.itsMe}
          </button>
        )}
        {draft.previousName !== null && !draft.self && (confirmRemove
          ? <button type="button" className="cp-button" data-variant="danger" onClick={() => remove(draft.previousName!)}>{t.settings.crew.confirmRemove}</button>
          : <button type="button" className="cp-button" onClick={() => setConfirmRemove(true)}>{t.settings.crew.remove}</button>)}
        <button type="button" className="cp-button" onClick={close}>{t.settings.close}</button>
      </div>
    </>
  );
}

/**
 * A person's look, turned around in a preview, with their first name and birthday, and the wardrobe to dress them:
 * in the crew editor and at the first start. `jobs`: what they do, for the crew's other members (not the user).
 */
export function LookEditor({ look, onLook, name, onName, birthday, onBirthday, jobs }: {
  look: Look; onLook: (look: Look) => void; name: string; onName: (name: string) => void; birthday: string; onBirthday: (birthday: string) => void;
  jobs?: { chosen: readonly Job[]; onChange: (jobs: Job[]) => void };
}) {
  const [direction, setDirection] = useState(0);
  const [tab, setTab] = useState<Tab>('face');
  const words = t.settings.look;
  const labels = words.options;
  const change = (part: Partial<Look>) => onLook({ ...look, ...part });
  const [month = '', day = ''] = birthday.split('-');
  const setBirthday = (nextMonth: string, nextDay: string) => onBirthday(nextMonth && nextDay ? `${nextMonth}-${nextDay}` : '');
  return (
    <>

        <div className="cp-crew__stage">
          <Preview look={look} direction={DIRECTIONS[direction]} label={words.preview(name)} />
          <div className="cp-crew__turn">
            <button type="button" className="cp-button" aria-label={words.turnLeft} onClick={() => setDirection((value) => (value + 3) % 4)}>←</button>
            <button type="button" className="cp-button" aria-label={words.turnRight} onClick={() => setDirection((value) => (value + 1) % 4)}>→</button>
          </div>
          <label className="cp-crew__name">
            <span>{words.firstName}</span>
            <input value={name} maxLength={40} onChange={(e) => onName(e.target.value)} placeholder={words.namePlaceholder} />
          </label>
          <div className="cp-crew__name" role="group" aria-label={words.birthday}>
            <span>{words.birthday} <small className="cp-muted">{words.optional}</small></span>
            <div className="cp-crew__birthday">
              <select aria-label={words.day} value={day} onChange={(e) => setBirthday(month || '01', e.target.value)}>
                <option value="">{words.day}</option>
                {Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, '0')).map((value) => <option key={value} value={value}>{Number(value)}</option>)}
              </select>
              <select aria-label={words.month} value={month} onChange={(e) => setBirthday(e.target.value, day || '01')}>
                <option value="">{words.month}</option>
                {words.months.map((label, index) => { const value = String(index + 1).padStart(2, '0'); return <option key={value} value={value}>{label}</option>; })}
              </select>
            </div>
          </div>
          {jobs && (
            <div className="cp-crew__name" role="group" aria-label={words.job}>
              <span>{words.job} <small className="cp-muted">{words.jobHint}</small></span>
              <div className="cp-crew__choices">
                {JOBS.map((job) => {
                  const chosen = jobs.chosen.includes(job);
                  return <button key={job} type="button" aria-pressed={chosen} onClick={() => jobs.onChange(JOBS.filter((other) => (other === job ? !chosen : jobs.chosen.includes(other))))}>{t.settings.jobs[job]}</button>;
                })}
              </div>
            </div>
          )}
        </div>

        <div className="cp-crew__wardrobe">
          <div className="cp-crew__tabs" role="tablist" aria-label={words.parts}>
            {TABS.map((part) => <button key={part} type="button" role="tab" aria-selected={tab === part} onClick={() => setTab(part)}>{words.tabs[part]}</button>)}
          </div>
          <div className="cp-crew__panel" role="tabpanel" aria-label={words.tabs[tab]}>
            {tab === 'face' && (
              <>
                <Swatches label={words.skin} colours={[...SKIN_TONES, ...FANCY_SKINS]} value={look.skin} onPick={(skin) => change({ skin })} />
                <Choices label={words.eyes} options={EYES} labels={labels.eyes} value={look.eyes} onPick={(eyes) => change({ eyes })} />
                <Choices
                  label={words.glasses} options={['none', 'on', 'sun'] as const} labels={words.glassesChoices}
                  value={look.sunglasses ? 'sun' : look.glasses ? 'on' : 'none'}
                  onPick={(value) => change({ sunglasses: value === 'sun', glasses: value === 'on' ? look.glasses ?? GLASSES_COLORS[0] : null })}
                />
                {look.glasses && !look.sunglasses && <Swatches label={words.frame} colours={GLASSES_COLORS} value={look.glasses} onPick={(glasses) => change({ glasses })} />}
                <label className="cp-crew__check"><input type="checkbox" checked={look.watch} onChange={(e) => change({ watch: e.target.checked })} /> {words.watch}</label>
              </>
            )}
            {tab === 'hair' && (
              <>
                <Choices label={words.hairStyle} options={HAIR_STYLES} labels={labels.hair} value={look.hair} onPick={(hair) => change({ hair })} />
                {look.hair !== 'none' && <Swatches label={words.colour} colours={HAIR_COLORS} value={look.hairColor} onPick={(hairColor) => change({ hairColor })} />}
              </>
            )}
            {tab === 'beard' && (
              <>
                <Choices label={words.beard} options={BEARD_STYLES} labels={labels.beard} value={look.beard} onPick={(beard) => change({ beard })} />
                {look.beard !== 'none' && <Swatches label={words.colour} colours={HAIR_COLORS} value={look.beardColor} onPick={(beardColor) => change({ beardColor })} />}
              </>
            )}
            {tab === 'head' && (
              <>
                <Choices label={words.hat} options={HATS} labels={labels.hat} value={look.hat} onPick={(hat) => change({ hat })} />
                {COLOURED_HATS.has(look.hat) && <Swatches label={words.colour} colours={CLOTH_COLORS} value={look.hatColor} onPick={(hatColor) => change({ hatColor })} />}
                <label className="cp-crew__check"><input type="checkbox" checked={look.headphones} onChange={(e) => change({ headphones: e.target.checked })} /> {words.headphones}</label>
                <p className="cp-muted">{words.festivalHats}</p>
              </>
            )}
            {tab === 'top' && (
              <>
                <Choices label={words.top} options={TOPS} labels={labels.top} value={look.top} onPick={(top) => change({ top })} />
                {look.top !== 'none' && <Swatches label={words.colour} colours={CLOTH_COLORS} value={look.topColor} onPick={(topColor) => change({ topColor })} />}
                {(look.top === 'threePiece' || look.top === 'tracksuit' || look.top === 'jacket') && (
                  <Swatches label={words.accents[look.top]} colours={CLOTH_COLORS} value={look.accentColor} onPick={(accentColor) => change({ accentColor })} />
                )}
              </>
            )}
            {tab === 'bottom' && (
              look.top === 'blanket' ? <p className="cp-muted">{words.blanketHides}</p>
                : look.top === 'dress' ? <p className="cp-muted">{words.dressIsBottom}</p> : (
                <>
                  <Choices label={words.bottom} options={BOTTOMS} labels={labels.bottom} value={look.bottom} onPick={(bottom) => change({ bottom })} />
                  <Swatches label={words.colour} colours={CLOTH_COLORS} value={look.bottomColor} onPick={(bottomColor) => change({ bottomColor })} />
                </>
              )
            )}
            {tab === 'shoes' && (
              look.top === 'blanket' ? <p className="cp-muted">{words.blanketHides}</p> : (
                <>
                  <Choices label={words.shoes} options={SHOES} labels={labels.shoes} value={look.shoes} onPick={(shoes) => change({ shoes })} />
                  <Swatches label={words.colour} colours={CLOTH_COLORS} value={look.shoesColor} onPick={(shoesColor) => change({ shoesColor })} />
                </>
              )
            )}
          </div>
        </div>
    </>
  );
}

function Choices<T extends string>({ label, options, labels, value, onPick }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onPick: (value: T) => void }) {
  return (
    <div className="cp-crew__field" role="group" aria-label={label}>
      <span className="cp-crew__label">{label}</span>
      <div className="cp-crew__choices">
        {options.map((option) => <button key={option} type="button" aria-pressed={option === value} onClick={() => onPick(option)}>{labels[option]}</button>)}
      </div>
    </div>
  );
}

function Swatches({ label, colours, value, onPick }: { label: string; colours: readonly string[]; value: string; onPick: (colour: string) => void }) {
  return (
    <div className="cp-crew__field" role="group" aria-label={label}>
      <span className="cp-crew__label">{label}</span>
      <div className="cp-crew__palette">
        {colours.map((colour) => (
          <button key={colour} type="button" className="cp-swatch" aria-pressed={colour === value} aria-label={colour} style={{ '--swatch': colour } as CSSProperties} onClick={() => onPick(colour)} />
        ))}
      </div>
    </div>
  );
}

/** The look walking on the spot, drawn like in the room (six screen pixels per art pixel). */
function Preview({ look, direction, label }: { look: Look; direction: Pose['direction']; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current!.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    let step: 0 | 1 = 0;
    const paint = () => {
      const sprite = chibiSprite(look, { direction, posture: 'walk', step, blinking: false, smiling: true, gesture: 'none' });
      context.clearRect(0, 0, canvas.current!.width, canvas.current!.height);
      context.drawImage(sprite, 0, HAT_ROWS, sprite.width, sprite.height - HAT_ROWS, 0, 0, sprite.width * 6, (sprite.height - HAT_ROWS) * 6);
      step = step ? 0 : 1;
    };
    paint();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(paint, 320);
    return () => window.clearInterval(timer);
  }, [look, direction]);
  return <canvas ref={canvas} className="cp-crew__preview" width={26 * 6} height={36 * 6} role="img" aria-label={label} />;
}
