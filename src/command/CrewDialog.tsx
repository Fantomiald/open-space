import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CLOTH_COLORS, DEFAULT_LOOK, FANCY_SKINS, GLASSES_COLORS, HAIR_COLORS, SKIN_TONES } from '../design/people-palette.ts';
import { JOBS, type Job } from '../../shared/jobs.ts';
import { ACCESSORIES, BEARD_STYLES, BOTTOMS, EYES, HAIR_STYLES, HATS, SHOES, TOPS, isCostumePiece, randomLook, type Accessory, type Look } from '../../shared/look.ts';
import type { CrewMember } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { HAT_ROWS, chibiHead, chibiPiece, chibiSprite, type BodyPart } from '../room/chibi.ts';
import type { Pose } from '../room/sprites.ts';
import { FIXED_COLOUR } from '../room/wardrobe.ts';
import { useSessions } from '../state/sessions.ts';
import { CheckIcon, ChevronDownIcon, CloseIcon, CrewIcon, ItsMeIcon, PetIcon, PlusIcon, RemoveIcon, ShuffleIcon, TurnLeftIcon, TurnRightIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { PetPicker } from './PreferenceFields.tsx';
import { SaveNote } from './SaveNote.tsx';
import { Switch } from './Switch.tsx';
import { useAutosave } from './useAutosave.ts';
import { useDismiss } from './useDismiss.ts';

/** The hats that take a colour of one's choice. */
const COLOURED_HATS: ReadonlySet<Look['hat']> = new Set(['cap', 'beanie', 'beret', 'tophat', 'party', 'tricorne', 'wizardHat', 'sunHat', 'cowboyHat']);
/** The pieces whose colour is their own (anime, armour...): no colour to pick. */
const ownColour = (piece: string) => isCostumePiece(piece) || FIXED_COLOUR.has(piece);
/** Where the accessories not worn on the head are shown. */
const ACCESSORY_PARTS: Partial<Record<Accessory, BodyPart>> = {
  swords: 'chest', katana: 'chest', lei: 'chest', guitar: 'chest', staff: 'body', parrot: 'body', jetpack: 'back', backpack: 'back', backSword: 'back',
};

const TABS = ['face', 'hair', 'beard', 'head', 'top', 'bottom', 'shoes'] as const;
type Tab = (typeof TABS)[number];
const HEAD_TABS: ReadonlySet<Tab> = new Set(['face', 'hair', 'beard', 'head']);

/** The four directions of the room, turned one after the other by the preview's arrows. */
const DIRECTIONS: Pose['direction'][] = ['down-right', 'down-left', 'up-left', 'up-right'];

type Draft = { previousName: string | null; name: string; look: Look; self: boolean; birthday: string; jobs: readonly Job[] };
const draftOf = (member: CrewMember): Draft => ({ previousName: member.name, name: member.name, look: member.look ?? DEFAULT_LOOK, self: member.self === true, birthday: member.birthday ?? '', jobs: member.jobs ?? [] });
const NEW_MEMBER: Draft = { previousName: null, name: '', look: DEFAULT_LOOK, self: false, birthday: '', jobs: [] };

export function CrewDialog() {
  const open = useSessions((s) => s.crewOpen);
  return open ? <CrewEditor /> : null;
}

/**
 * What the crew editor shows: a person (null: a new one being made), or the office pet. `visit` counts the picks from
 * the side, so a pick opens the page afresh while a rename only moves it.
 */
type Page = { person: string | null; visit: number } | 'pet';

/**
 * The crew laid out like the settings: the people (the user first) and the pet down the side, with a new person always
 * in reach at the top; the page of the one picked beside it, its own actions in its header.
 */
function CrewEditor() {
  const openCrew = useSessions((s) => s.openCrew);
  const crew = useSessions((s) => s.crew);
  const close = () => openCrew(false);
  const self = crew.find((member) => member.self) ?? crew[0];
  const [page, setPage] = useState<Page>({ person: self?.name ?? null, visit: 0 });
  const [visits, setVisits] = useState(0);
  const open = (person: string | null) => { setVisits(visits + 1); setPage({ person, visit: visits + 1 }); };
  const follow = useCallback((person: string | null) => setPage((current) => (current === 'pet' ? current : { ...current, person })), []);
  const words = t.settings.crew;
  const shown = page === 'pet' ? undefined : page.person;
  const people = [...crew].sort((a, b) => Number(b.self === true) - Number(a.self === true));
  return (
    <Modal title={words.title} onClose={close} look="panel">
      <div className="cp-prefs cp-team">
        <aside className="cp-prefs__side">
          <div className="cp-prefs__brand"><CrewIcon /><span>{words.title}</span></div>
          <button type="button" className="cp-button cp-team__add" aria-pressed={shown === null} aria-label={words.addPerson} onClick={() => open(null)}>
            <PlusIcon /><span className="cp-team__label">{words.addPerson}</span>
          </button>
          <nav className="cp-prefs__menu cp-team__people" aria-label={words.people}>
            {shown === null && (
              <button type="button" aria-current="page"><span className="cp-team__blank" aria-hidden="true" /><span>{words.newPerson}</span></button>
            )}
            {people.map((member) => (
              <button
                key={member.name} type="button" aria-current={shown === member.name ? 'page' : undefined} onClick={() => open(member.name)}
                // a person just made is at the end of the list: brought into sight
                ref={shown === member.name ? (button) => button?.scrollIntoView({ block: 'nearest' }) : undefined}
              >
                <img src={chibiHead(member.look ?? DEFAULT_LOOK)} alt="" width={24} height={24} />
                <span>{member.name}</span>
                {member.self && <small className="cp-team__you">{words.you.replace(/[()\s]/g, '')}</small>}
              </button>
            ))}
          </nav>
          <nav className="cp-prefs__menu cp-team__pet" aria-label={words.pet}>
            <button type="button" aria-current={page === 'pet' ? 'page' : undefined} aria-label={words.pet} onClick={() => setPage('pet')}><PetIcon /><span className="cp-team__label">{words.pet}</span></button>
          </nav>
        </aside>
        <div className="cp-prefs__main">
          {page === 'pet'
            ? <PetPage close={close} />
            : <PersonPage key={page.visit} name={page.person} onRename={follow} onRemoved={open} close={close} />}
        </div>
      </div>
    </Modal>
  );
}

/** The page's header, like a settings section's: its picture, its title and what it is, then its actions. */
function PageHead({ picture, title, intro, children, close }: { picture: ReactNode; title: string; intro: string; children?: ReactNode; close: () => void }) {
  return (
    <header className="cp-prefs__head cp-team__head">
      <span className="cp-prefs__head-icon cp-team__face">{picture}</span>
      <div><h3>{title}</h3><p>{intro}</p></div>
      <div className="cp-team__actions">
        {children}
        <button type="button" className="cp-icon-button" aria-label={t.settings.close} title={t.settings.close} onClick={close}><CloseIcon /></button>
      </div>
    </header>
  );
}

/** The office pet, saved with the settings (Preferences.pet) as soon as it changes. */
function PetPage({ close }: { close: () => void }) {
  const saved = useSessions((s) => s.preferences.pet);
  const setPreferences = useSessions((s) => s.setPreferences);
  const [pet, setPet] = useState(saved);
  const { status } = useAutosave(pet, (next) => (setPreferences({ pet: next }) ? null : t.settings.noServer));
  return (
    <>
      <PageHead picture={<PetIcon />} title={t.settings.crew.pet} intro={t.settings.crew.petIntro} close={close}><SaveNote status={status} /></PageHead>
      <div className="cp-prefs__content"><div className="cp-prefs__card cp-team__card"><PetPicker pet={pet} onPet={setPet} /></div></div>
    </>
  );
}

/** What decides a save of a member: the person themselves, not who the draft was loaded from. */
const memberKey = ({ previousName: _from, ...member }: Draft) => JSON.stringify(member);
/** A first name being typed waits longer: each save renames the member, so not after every letter. */
const RENAME_DELAY_MS = 1500;

/** One person (`name`; null: a new one), saved as it is edited: a rename or a creation moves the page to the new name. */
function PersonPage({ name, onRename, onRemoved, close }: { name: string | null; onRename: (name: string | null) => void; onRemoved: (next: string | null) => void; close: () => void }) {
  const crew = useSessions((s) => s.crew);
  const saveMember = useSessions((s) => s.saveMember);
  const removeMember = useSessions((s) => s.removeMember);
  const becomeSelf = useSessions((s) => s.becomeSelf);
  const sessions = useSessions((s) => s.sessions);
  const words = t.settings.crew;
  const [draft, setDraft] = useState<Draft>(() => {
    const member = crew.find((other) => other.name === name);
    return member ? draftOf(member) : NEW_MEMBER;
  });
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = (current: Draft): string | null => {
    const typed = current.name.trim();
    if (!typed) return words.noName;
    if (crew.some((member) => member.name === typed && member.name !== current.previousName)) return words.nameTaken(typed);
    if (!saveMember(current.previousName, typed, current.look, current.birthday || undefined, current.self ? [] : current.jobs)) return t.settings.noServer;
    setDraft((latest) => ({ ...latest, previousName: typed }));
    return null;
  };
  // a new member is created with the name typed so far: it waits as much
  const renaming = draft.name.trim() !== (draft.previousName ?? '');
  const { status, flush, start } = useAutosave(draft, save, memberKey, renaming ? RENAME_DELAY_MS : undefined);
  // the side list follows the saved name, without drawing this page again
  const saved = draft.previousName;
  useEffect(() => { if (saved !== name) onRename(saved); }, [saved, name, onRename]);

  const remove = (member: string) => {
    // nothing left to save: leaving the page would bring them back
    start(draft);
    removeMember(member);
    onRemoved(crew.find((other) => other.self && other.name !== member)?.name ?? null);
  };
  // the user's perso in the room: someone at work in a session would be them twice
  const busy = saved !== null && Object.values(sessions).some((session) => session.name === saved);
  const becomeThem = (member: string) => {
    flush();
    if (becomeSelf(member)) setDraft((current) => ({ ...current, self: true }));
  };

  return (
    <>
      <PageHead
        picture={saved === null ? <PlusIcon /> : <img src={chibiHead(draft.look)} alt="" width={36} height={36} />}
        title={draft.name.trim() || words.newPerson}
        intro={saved === null ? words.newIntro : draft.self ? words.selfIntro : words.memberIntro}
        close={close}
      >
        {(saved !== null || status.state !== 'saved') && <SaveNote status={status} />}
        {saved !== null && !draft.self && (
          <>
            <button type="button" className="cp-button" disabled={busy} onClick={() => becomeThem(saved)} title={busy ? words.busy(saved) : words.becomeThem(saved)}>
              <ItsMeIcon />{words.itsMe}
            </button>
            {confirmRemove
              ? <button type="button" className="cp-button" data-variant="danger" onClick={() => remove(saved)} onBlur={() => setConfirmRemove(false)}><RemoveIcon />{words.confirmRemove}</button>
              : <button type="button" className="cp-icon-button" aria-label={words.remove} title={words.remove} onClick={() => setConfirmRemove(true)}><RemoveIcon /></button>}
          </>
        )}
      </PageHead>
      <div className="cp-prefs__content cp-team__content">
        <div className="cp-crew">
          <LookEditor
            look={draft.look} onLook={(look) => setDraft((current) => ({ ...current, look }))}
            name={draft.name} onName={(typed) => setDraft((current) => ({ ...current, name: typed }))}
            birthday={draft.birthday} onBirthday={(birthday) => setDraft((current) => ({ ...current, birthday }))}
            jobs={draft.self ? undefined : { chosen: draft.jobs, onChange: (jobs) => setDraft((current) => ({ ...current, jobs })) }}
          />
        </div>
      </div>
    </>
  );
}

/** The tab each part of the body opens, from the top of the preview down (rows of the drawn sprite, hats left out). */
const TAB_AT: readonly (readonly [number, Tab])[] = [[21, 'hair'], [27, 'top'], [31, 'bottom'], [36, 'shoes']];

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
  const accentLabel = (words.accents as Partial<Record<Look['top'], string>>)[look.top];
  const [month = '', day = ''] = birthday.split('-');
  const setBirthday = (nextMonth: string, nextDay: string) => onBirthday(nextMonth && nextDay ? `${nextMonth}-${nextDay}` : '');
  const pieces = <T extends string>(label: string, options: readonly T[], names: Record<T, string>, value: T, onPick: (value: T) => void, worn: (option: T) => Partial<Look>, part: BodyPart | ((option: T) => BodyPart)) => (
    <Pieces label={label} options={options} labels={names} value={value} onPick={onPick} picture={(option) => chibiPiece(look, worn(option), typeof part === 'function' ? part(option) : part)} />
  );
  // a click on the preview opens the tab of what is under it (the head keeps a head tab already open)
  const pickPartAt = (row: number) => {
    const found = TAB_AT.find(([last]) => row <= last)?.[1] ?? 'shoes';
    setTab(found === 'hair' && HEAD_TABS.has(tab) ? tab : found);
  };
  return (
    <>
      <div className="cp-crew__stage">
        <Preview look={look} direction={DIRECTIONS[direction]} label={words.preview(name)} onRow={pickPartAt} hint={words.pickPart} />
        <div className="cp-crew__turn">
          <button type="button" className="cp-icon-button" aria-label={words.turnLeft} title={words.turnLeft} onClick={() => setDirection((value) => (value + 3) % 4)}><TurnLeftIcon /></button>
          <button type="button" className="cp-icon-button" aria-label={words.turnRight} title={words.turnRight} onClick={() => setDirection((value) => (value + 1) % 4)}><TurnRightIcon /></button>
          <button type="button" className="cp-button" onClick={() => onLook(randomLook())}><ShuffleIcon />{words.random}</button>
        </div>
        <div className="cp-crew__identity">
          <label className="cp-crew__name">
            <span>{words.firstName}</span>
            <input value={name} maxLength={40} onChange={(e) => onName(e.target.value)} placeholder={words.namePlaceholder} />
          </label>
          <div className="cp-crew__name" role="group" aria-label={words.birthday}>
            <span>{words.birthday}</span>
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
          {jobs && <JobPicker chosen={jobs.chosen} onChange={jobs.onChange} />}
        </div>
      </div>

      <div className="cp-crew__wardrobe">
        <div className="cp-segmented cp-crew__tabs" role="tablist" aria-label={words.parts}>
          {TABS.map((part) => <button key={part} type="button" role="tab" aria-selected={tab === part} onClick={() => setTab(part)}>{words.tabs[part]}</button>)}
        </div>
        <div className="cp-crew__panel" role="tabpanel" aria-label={words.tabs[tab]}>
          {tab === 'face' && (
            <>
              <Swatches label={words.skin} colours={[...SKIN_TONES, ...FANCY_SKINS]} value={look.skin} onPick={(skin) => change({ skin })} />
              {pieces(words.eyes, EYES, labels.eyes, look.eyes, (eyes) => change({ eyes }), (eyes) => ({ eyes }), 'head')}
              {pieces(
                words.glasses, ['none', 'on', 'sun'] as const, words.glassesChoices, look.sunglasses ? 'sun' : look.glasses ? 'on' : 'none',
                (value) => change({ sunglasses: value === 'sun', glasses: value === 'on' ? look.glasses ?? GLASSES_COLORS[0] : null }),
                (value) => ({ sunglasses: value === 'sun', glasses: value === 'on' ? look.glasses ?? GLASSES_COLORS[0] : null }), 'head',
              )}
              {look.glasses && !look.sunglasses && <Swatches label={words.frame} colours={GLASSES_COLORS} value={look.glasses} onPick={(glasses) => change({ glasses })} />}
              <Toggle label={words.watch} checked={look.watch} onChange={(watch) => change({ watch })} />
            </>
          )}
          {tab === 'hair' && (
            <>
              {look.hair !== 'none' && <Swatches label={words.colour} colours={HAIR_COLORS} value={look.hairColor} onPick={(hairColor) => change({ hairColor })} />}
              {pieces(words.hairStyle, HAIR_STYLES, labels.hair, look.hair, (hair) => change({ hair }), (hair) => ({ hair }), 'head')}
            </>
          )}
          {tab === 'beard' && (
            <>
              {look.beard !== 'none' && <Swatches label={words.colour} colours={HAIR_COLORS} value={look.beardColor} onPick={(beardColor) => change({ beardColor })} />}
              {pieces(words.beard, BEARD_STYLES, labels.beard, look.beard, (beard) => change({ beard }), (beard) => ({ beard }), 'head')}
            </>
          )}
          {tab === 'head' && (
            <>
              {COLOURED_HATS.has(look.hat) && <Swatches label={words.colour} colours={CLOTH_COLORS} value={look.hatColor} onPick={(hatColor) => change({ hatColor })} />}
              {pieces(words.hat, HATS, labels.hat, look.hat, (hat) => change({ hat }), (hat) => ({ hat }), 'hat')}
              {pieces(words.accessory, ACCESSORIES, labels.accessory, look.accessory, (accessory) => change({ accessory }), (accessory) => ({ accessory }), (accessory) => ACCESSORY_PARTS[accessory] ?? 'head')}
              <Toggle label={words.headphones} checked={look.headphones} onChange={(headphones) => change({ headphones })} />
              <p className="cp-muted cp-crew__note">{words.festivalHats}</p>
            </>
          )}
          {tab === 'top' && (
            <>
              {look.top !== 'none' && !ownColour(look.top) && <Swatches label={words.colour} colours={CLOTH_COLORS} value={look.topColor} onPick={(topColor) => change({ topColor })} />}
              {accentLabel && <Swatches label={accentLabel} colours={CLOTH_COLORS} value={look.accentColor} onPick={(accentColor) => change({ accentColor })} />}
              {pieces(words.top, TOPS, labels.top, look.top, (top) => change({ top }), (top) => ({ top }), 'chest')}
            </>
          )}
          {tab === 'bottom' && (
            look.top === 'blanket' ? <p className="cp-muted cp-crew__note">{words.blanketHides}</p>
              : look.top === 'dress' ? <p className="cp-muted cp-crew__note">{words.dressIsBottom}</p>
              : look.top === 'overalls' ? <p className="cp-muted cp-crew__note">{words.overallsAreBottom}</p> : (
              <>
                {!ownColour(look.bottom) && <Swatches label={words.colour} colours={CLOTH_COLORS} value={look.bottomColor} onPick={(bottomColor) => change({ bottomColor })} />}
                {pieces(words.bottom, BOTTOMS, labels.bottom, look.bottom, (bottom) => change({ bottom }), (bottom) => ({ bottom }), 'legs')}
              </>
            )
          )}
          {tab === 'shoes' && (
            look.top === 'blanket' ? <p className="cp-muted cp-crew__note">{words.blanketHides}</p> : (
              <>
                {!ownColour(look.shoes) && <Swatches label={words.colour} colours={CLOTH_COLORS} value={look.shoesColor} onPick={(shoesColor) => change({ shoesColor })} />}
                {pieces(words.shoes, SHOES, labels.shoes, look.shoes, (shoes) => change({ shoes }), (shoes) => ({ shoes }), 'feet')}
              </>
            )
          )}
        </div>
      </div>
    </>
  );
}

/** The jobs of a person, several at once, in a menu of checkboxes: the button says which. */
function JobPicker({ chosen, onChange }: { chosen: readonly Job[]; onChange: (jobs: Job[]) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  const words = t.settings.look;
  const toggle = (job: Job) => onChange(JOBS.filter((other) => (other === job ? !chosen.includes(job) : chosen.includes(other))));
  return (
    <div className="cp-crew__name" role="group" aria-label={words.job}>
      <span>{words.job}</span>
      <div className="cp-crew__jobs" ref={box}>
        <button type="button" className="cp-crew__jobs-button" aria-haspopup="menu" aria-expanded={open} title={words.jobHint} onClick={() => setOpen(!open)}>
          <span>{chosen.length ? chosen.map((job) => t.settings.jobs[job]).join(', ') : words.noJob}</span>
          <ChevronDownIcon />
        </button>
        {open && (
          <div className="cp-crew__jobs-menu" role="menu" aria-label={words.job}>
            <p>{words.jobHint}</p>
            {JOBS.map((job) => (
              <button key={job} type="button" role="menuitemcheckbox" aria-checked={chosen.includes(job)} onClick={() => toggle(job)}>
                <span className="cp-crew__jobs-check" aria-hidden="true">{chosen.includes(job) && <CheckIcon />}</span>{t.settings.jobs[job]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The choices of a piece, each worn by the see-through dummy (`picture`), its name under it. */
function Pieces<T extends string>({ label, options, labels, value, onPick, picture }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onPick: (value: T) => void; picture: (option: T) => string }) {
  return (
    <div className="cp-crew__field" role="group" aria-label={label}>
      <span className="cp-crew__label">{label}</span>
      <div className="cp-crew__pieces">
        {options.map((option) => (
          <button key={option} type="button" aria-pressed={option === value} title={labels[option]} onClick={() => onPick(option)}>
            <img src={picture(option)} alt="" />
            <span>{labels[option]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="cp-crew__toggle">
      <span>{label}</span>
      <Switch label={label} checked={checked} onChange={onChange} />
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

/** The look walking on the spot, drawn like in the room (six screen pixels per art pixel). `onRow`: the sprite row clicked. */
function Preview({ look, direction, label, onRow, hint }: { look: Look; direction: Pose['direction']; label: string; onRow: (row: number) => void; hint: string }) {
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
  // the parts can be reached by the tabs too: the click is a shortcut, not the only way
  return (
    <canvas
      ref={canvas} className="cp-crew__preview" width={26 * 6} height={36 * 6} role="img" aria-label={label} title={hint}
      onClick={(e) => { const box = e.currentTarget.getBoundingClientRect(); onRow(Math.floor(((e.clientY - box.top) / box.height) * 36)); }}
    />
  );
}
