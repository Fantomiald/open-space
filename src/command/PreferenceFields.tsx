import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FUR_COLORS, PET_EYE_COLORS } from '../design/people-palette.ts';
import { CAT_PATTERNS, DOG_BREEDS, PET_KINDS, type PetChoice, type PetColors } from '../../shared/pets.ts';
import { furOf, petSprite } from '../room/pet.ts';
import { homeRelative, isAbsoluteFolder } from '../lib/format.ts';
import { LANGUAGES, type Language } from '../../shared/i18n.ts';
import { PERMISSION_MODES, type Preferences, type RootSuggestion } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { modeLabel, models } from '../state/labels.ts';
import { useSessions } from '../state/sessions.ts';

/**
 * The folders sessions may run in: the suggested ones and those already chosen, checked or not, plus any folder typed in
 * full; and the default one. Shown read-only when OFFICE_ROOTS sets them. At the first start and in the settings.
 */
export function FoldersPicker({ roots, onRoots, defaultFolder, onDefaultFolder, suggestions, locked, withDefault = true }: {
  roots: string[]; onRoots: (roots: string[]) => void; defaultFolder: string; onDefaultFolder: (folder: string) => void;
  suggestions: RootSuggestion[] | null; locked: boolean;
  /** the default folder's field below the list (the settings show it as a row of its own) */
  withDefault?: boolean;
}) {
  const [other, setOther] = useState('');
  const toggle = (folder: string) => onRoots(roots.includes(folder) ? roots.filter((root) => root !== folder) : [...roots, folder]);
  const add = () => {
    const folder = other.trim();
    if (!isAbsoluteFolder(folder)) return;
    if (!roots.includes(folder)) onRoots([...roots, folder]);
    setOther('');
  };
  const listed = [...(suggestions ?? []).map((folder) => folder.path), ...roots.filter((root) => !suggestions?.some((folder) => folder.path === root))];
  return (
    <>
      {locked ? (
        <p>{t.settings.folders.lockedBy}<code>OFFICE_ROOTS</code>{t.settings.folders.lockedList(roots.map(homeRelative).join(', '))}</p>
      ) : (
        <>
          <ul className="cp-onboarding__folders">
            {listed.map((folder) => {
              const projects = suggestions?.find((suggestion) => suggestion.path === folder)?.projects;
              return (
                <li key={folder}>
                  <label>
                    <input type="checkbox" checked={roots.includes(folder)} onChange={() => toggle(folder)} />
                    <span className="cp-onboarding__folder" title={folder}>{homeRelative(folder)}</span>
                    <span className="cp-muted">{projects === undefined ? t.settings.folders.added : projects < 0 ? t.settings.folders.notLookedInto : t.settings.folders.projects(projects)}</span>
                  </label>
                </li>
              );
            })}
            {suggestions === null && <li className="cp-muted">{t.settings.folders.searching}</li>}
          </ul>
          <div className="cp-onboarding__other">
            <input value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={t.settings.folders.otherPlaceholder} aria-label={t.settings.folders.otherLabel} />
            <button type="button" className="cp-button" disabled={!isAbsoluteFolder(other.trim())} onClick={add}>{t.settings.folders.add}</button>
          </div>
        </>
      )}
      {withDefault && roots.length > 1 && (
        <label className="cp-onboarding__field">
          <span>{t.settings.folders.defaultFolder}</span>
          <select value={roots.includes(defaultFolder) ? defaultFolder : roots[0]} onChange={(e) => onDefaultFolder(e.target.value)}>
            {roots.map((root) => <option key={root} value={root}>{homeRelative(root)}</option>)}
          </select>
        </label>
      )}
    </>
  );
}

type Habits = Pick<Preferences, 'model' | 'permissionMode' | 'notifications' | 'festivals' | 'officeLife' | 'agentNote'>;


/** A pet drawn at three screen pixels per art pixel: walking when it is the one picked, sitting otherwise. */
function PetSprite({ pet, moving }: { pet: Exclude<PetChoice, { kind: 'none' }>; moving: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current!.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    let frame: 0 | 1 = 0;
    const paint = () => {
      const sprite = petSprite(pet, moving ? 'walk' : 'sit', frame);
      context.clearRect(0, 0, canvas.current!.width, canvas.current!.height);
      context.drawImage(sprite, 0, 0, sprite.width * 3, sprite.height * 3);
      frame = frame ? 0 : 1;
    };
    paint();
    if (!moving || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(paint, 220);
    return () => window.clearInterval(timer);
  }, [pet, moving]);
  return <canvas ref={canvas} width={22 * 3} height={17 * 3} />;
}

/** One choice of pet, shown as it would walk in the room, with its name under it. */
function PetTile({ pet, label, picked, onPick }: { pet: PetChoice; label: string; picked: boolean; onPick: () => void }) {
  return (
    <button type="button" className="cp-pet__tile" aria-pressed={picked} title={label} onClick={onPick}>
      {pet.kind === 'none' ? <span className="cp-pet__empty" aria-hidden="true" /> : <PetSprite pet={pet} moving={picked} />}
      <span className="cp-pet__name">{label}</span>
    </button>
  );
}

function PetTiles({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cp-crew__field" role="group" aria-label={label}>
      <span className="cp-crew__label">{label}</span>
      <div className="cp-pet__tiles">{children}</div>
    </div>
  );
}

/** What the one colour of a pet is called, when it is not its fur. */
const COLOUR_PART: Partial<Record<PetChoice['kind'], 'shell' | 'colour' | 'skin' | 'feathers' | 'scales' | 'spines' | 'light'>> = {
  rocky: 'shell', turtle: 'shell', crab: 'shell', duck: 'colour', clawd: 'colour', robotDog: 'colour', slime: 'colour', golem: 'colour',
  axolotl: 'skin', octopus: 'skin', alien: 'skin', parrot: 'feathers', owl: 'feathers', penguin: 'feathers', dragon: 'scales', hedgehog: 'spines',
  firefly: 'light',
};

/** A kind of pet as it comes, before any colour is picked. */
const defaultOf = (kind: PetChoice['kind']): PetChoice =>
  kind === 'cat' ? { kind, variant: 'plain' } : kind === 'dog' ? { kind, variant: 'labrador' } : { kind } as PetChoice;

/** The office pet: one colour (shown as it is now) and a cat's eyes, then its kind and a cat's pattern or a dog's breed. */
export function PetPicker({ pet, onPet }: { pet: PetChoice; onPet: (pet: PetChoice) => void }) {
  const paint = (part: keyof PetColors, colour: string) => { if (pet.kind !== 'none') onPet({ ...pet, colors: { ...pet.colors, [part]: colour } }); };
  return (
    <div className="cp-pet">
      {/* the colours first, as in a person's wardrobe: in sight whatever the pet */}
      {pet.kind !== 'none' && (
        <div className="cp-pet__colours">
          <ColourRow label={t.settings.pet[COLOUR_PART[pet.kind] ?? 'fur']} colours={withCurrent(FUR_COLORS, furOf(pet))} value={furOf(pet)} onPick={(colour) => paint('fur', colour)} />
          {pet.kind === 'cat' && <ColourRow label={t.settings.pet.eyes} colours={PET_EYE_COLORS} value={pet.colors?.eyes ?? PET_EYE_COLORS[0]} onPick={(colour) => paint('eyes', colour)} />}
        </div>
      )}
      {/* the pet picked is drawn with its own colours, the others as they come */}
      <PetTiles label={t.settings.pet.kind}>
        {PET_KINDS.map((kind) => (
          <PetTile key={kind} pet={pet.kind === kind ? pet : defaultOf(kind)} label={t.settings.pet.kinds[kind]} picked={pet.kind === kind} onPick={() => pet.kind !== kind && onPet(defaultOf(kind))} />
        ))}
      </PetTiles>
      {/* a new pattern or breed starts from its own colour */}
      {pet.kind === 'cat' && (
        <PetTiles label={t.settings.pet.pattern}>
          {CAT_PATTERNS.map((pattern) => {
            const choice: PetChoice = { kind: 'cat', variant: pattern, ...(pet.colors?.eyes ? { colors: { eyes: pet.colors.eyes } } : {}) };
            return <PetTile key={pattern} pet={pet.variant === pattern ? pet : choice} label={t.settings.pet.patterns[pattern]} picked={pet.variant === pattern} onPick={() => pet.variant !== pattern && onPet(choice)} />;
          })}
        </PetTiles>
      )}
      {pet.kind === 'dog' && (
        <PetTiles label={t.settings.pet.breed}>
          {DOG_BREEDS.map((breed) => (
            <PetTile key={breed} pet={pet.variant === breed ? pet : { kind: 'dog', variant: breed }} label={t.settings.pet.breeds[breed]} picked={pet.variant === breed} onPick={() => pet.variant !== breed && onPet({ kind: 'dog', variant: breed })} />
          ))}
        </PetTiles>
      )}
    </div>
  );
}

/** The swatches, with the colour in use first when it is not among them (a pattern's or a breed's own). */
const withCurrent = (colours: readonly string[], current: string) => (colours.includes(current) ? colours : [current, ...colours]);

function ColourRow({ label, colours, value, onPick }: { label: string; colours: readonly string[]; value: string | undefined; onPick: (colour: string) => void }) {
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

/** How the user likes to work: default model and permissions, sound, notifications, festivals, a note for every agent. */
export function HabitsFields({ habits, onHabits }: { habits: Habits; onHabits: (habits: Habits) => void }) {
  const sound = useSessions((s) => s.sound);
  const toggleSound = useSessions((s) => s.toggleSound);
  return (
    <>
      <div className="cp-onboarding__grid">
        <label className="cp-onboarding__field">
          <span>{t.settings.habits.model}</span>
          <select value={habits.model} onChange={(e) => onHabits({ ...habits, model: e.target.value })}>
            {models().map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="cp-onboarding__field">
          <span>{t.settings.habits.permissions}</span>
          <select value={habits.permissionMode} onChange={(e) => onHabits({ ...habits, permissionMode: e.target.value as Preferences['permissionMode'] })}>
            {PERMISSION_MODES.map((mode) => <option key={mode} value={mode}>{modeLabel(mode)}</option>)}
          </select>
        </label>
      </div>
      <label className="cp-crew__check"><input type="checkbox" checked={sound} onChange={toggleSound} /> {t.settings.habits.sound}</label>
      <label className="cp-crew__check"><input type="checkbox" checked={habits.notifications} onChange={(e) => onHabits({ ...habits, notifications: e.target.checked })} /> {t.settings.habits.notifications}</label>
      <label className="cp-crew__check"><input type="checkbox" checked={habits.festivals} onChange={(e) => onHabits({ ...habits, festivals: e.target.checked })} /> {t.settings.habits.festivals}</label>
      <label className="cp-crew__check"><input type="checkbox" checked={habits.officeLife} onChange={(e) => onHabits({ ...habits, officeLife: e.target.checked })} /> {t.settings.habits.officeLife}</label>
      <label className="cp-onboarding__field">
        <span>{t.settings.habits.agentNote} <small className="cp-muted">{t.settings.habits.agentNoteHint}</small></span>
        <textarea rows={2} maxLength={600} value={habits.agentNote} onChange={(e) => onHabits({ ...habits, agentNote: e.target.value })} placeholder={t.settings.habits.agentNotePlaceholder} />
      </label>
    </>
  );
}

/** Each language written in itself, so it can be found whatever the page is shown in. */
export const LANGUAGE_NAMES: Record<Language, string> = { fr: 'Français', en: 'English' };

/** The language of the page, of the server's messages and of new agents' instructions. */
export function LanguagePicker({ language, onLanguage }: { language: Language; onLanguage: (language: Language) => void }) {
  return (
    <label className="cp-onboarding__field">
      <span>{t.settings.language}</span>
      <select value={language} onChange={(e) => onLanguage(e.target.value as Language)}>
        {LANGUAGES.map((option) => <option key={option} value={option} lang={option}>{LANGUAGE_NAMES[option]}</option>)}
      </select>
    </label>
  );
}
