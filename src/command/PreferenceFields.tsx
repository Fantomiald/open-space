import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FUR_COLORS, PET_EYE_COLORS } from '../design/people-palette.ts';
import { CAT_PATTERNS, DOG_BREEDS, type CatPattern, type DogBreed, type PetChoice, type PetColors } from '../../shared/pets.ts';
import { furOf, petSprite } from '../room/pet.ts';
import { homeRelative } from '../lib/format.ts';
import { PERMISSION_MODES, type Preferences, type RootSuggestion } from '../../shared/protocol.ts';
import { MODELS, PERMISSION_MODE_LABELS } from '../state/labels.ts';
import { useSessions } from '../state/sessions.ts';

/**
 * The folders sessions may run in: the suggested ones and those already chosen, checked or not, plus any folder typed in
 * full; and the default one. Shown read-only when OFFICE_ROOTS sets them. At the first start and in the settings.
 */
export function FoldersPicker({ roots, onRoots, defaultFolder, onDefaultFolder, suggestions, locked }: {
  roots: string[]; onRoots: (roots: string[]) => void; defaultFolder: string; onDefaultFolder: (folder: string) => void;
  suggestions: RootSuggestion[] | null; locked: boolean;
}) {
  const [other, setOther] = useState('');
  const toggle = (folder: string) => onRoots(roots.includes(folder) ? roots.filter((root) => root !== folder) : [...roots, folder]);
  const add = () => {
    const folder = other.trim().replace(/\/+$/, '');
    if (!folder.startsWith('/')) return;
    if (!roots.includes(folder)) onRoots([...roots, folder]);
    setOther('');
  };
  const listed = [...(suggestions ?? []).map((folder) => folder.path), ...roots.filter((root) => !suggestions?.some((folder) => folder.path === root))];
  return (
    <>
      {locked ? (
        <p>Ils sont fixés par <code>OFFICE_ROOTS</code> : {roots.map(homeRelative).join(', ')}.</p>
      ) : (
        <>
          <ul className="cp-onboarding__folders">
            {listed.map((folder) => {
              const projects = suggestions?.find((suggestion) => suggestion.path === folder)?.projects;
              return (
                <li key={folder}>
                  <label>
                    <input type="checkbox" checked={roots.includes(folder)} onChange={() => toggle(folder)} />
                    <span className="cp-onboarding__folder">{homeRelative(folder)}</span>
                    <span className="cp-muted">{projects === undefined ? 'ajouté' : projects < 0 ? 'pas regardé dedans' : `${projects} projet${projects > 1 ? 's' : ''}`}</span>
                  </label>
                </li>
              );
            })}
            {suggestions === null && <li className="cp-muted">Je cherche tes projets…</li>}
          </ul>
          <div className="cp-onboarding__other">
            <input value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="/Users/toi/code" aria-label="Un autre dossier (chemin complet)" />
            <button type="button" className="cp-button" disabled={!other.trim().startsWith('/')} onClick={add}>Ajouter</button>
          </div>
        </>
      )}
      {roots.length > 1 && (
        <label className="cp-onboarding__field">
          <span>Dossier par défaut (Maj+N lance une session dedans)</span>
          <select value={roots.includes(defaultFolder) ? defaultFolder : roots[0]} onChange={(e) => onDefaultFolder(e.target.value)}>
            {roots.map((root) => <option key={root} value={root}>{homeRelative(root)}</option>)}
          </select>
        </label>
      )}
    </>
  );
}

type Habits = Pick<Preferences, 'model' | 'permissionMode' | 'notifications' | 'festivals' | 'agentNote'>;

const PET_KINDS = {
  cat: 'Un chat', dog: 'Un chien', duck: 'Un canard en plastique', capybara: 'Un capybara', axolotl: 'Un axolotl', rocky: 'Rocky (Projet Dernière Chance)', none: 'Pas d’animal',
} as const;
const PATTERNS = { plain: 'Uni', tabby: 'Tigré', calico: 'Tricolore', tuxedo: 'Smoking' } as const;
const BREEDS = { labrador: 'Labrador', dalmatian: 'Dalmatien', husky: 'Husky', shiba: 'Shiba', corgi: 'Corgi', dachshund: 'Teckel', pug: 'Carlin' } as const;

/** The pet walking on the spot, like in the room (five screen pixels per art pixel). */
function PetPreview({ pet }: { pet: Exclude<PetChoice, { kind: 'none' }> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current!.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    let frame: 0 | 1 = 0;
    const paint = () => {
      const sprite = petSprite(pet, 'walk', frame);
      context.clearRect(0, 0, canvas.current!.width, canvas.current!.height);
      context.drawImage(sprite, 0, 0, sprite.width * 5, sprite.height * 5);
      frame = frame ? 0 : 1;
    };
    paint();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(paint, 220);
    return () => window.clearInterval(timer);
  }, [pet]);
  return <canvas ref={canvas} className="cp-pet__preview" width={22 * 5} height={17 * 5} role="img" aria-label="Aperçu de ton animal" />;
}

/** The office pet: its kind, a cat's pattern or a dog's breed, then one colour (shown as it is now) and a cat's eyes. */
export function PetPicker({ pet, onPet }: { pet: PetChoice; onPet: (pet: PetChoice) => void }) {
  const pickKind = (kind: PetChoice['kind']) =>
    onPet(kind === 'cat' ? { kind, variant: 'plain' } : kind === 'dog' ? { kind, variant: 'labrador' } : { kind } as PetChoice);
  const paint = (part: keyof PetColors, colour: string) => { if (pet.kind !== 'none') onPet({ ...pet, colors: { ...pet.colors, [part]: colour } }); };
  return (
    <div className="cp-pet">
      <div className="cp-pet__fields">
        <label className="cp-onboarding__field">
          <span>Ton animal au bureau</span>
          <select value={pet.kind} onChange={(e) => pickKind(e.target.value as PetChoice['kind'])}>
            {(Object.keys(PET_KINDS) as PetChoice['kind'][]).map((kind) => <option key={kind} value={kind}>{PET_KINDS[kind]}</option>)}
          </select>
        </label>
        {/* a new pattern or breed starts from its own colour */}
        {pet.kind === 'cat' && (
          <label className="cp-onboarding__field">
            <span>Son motif</span>
            <select value={pet.variant} onChange={(e) => onPet({ kind: 'cat', variant: e.target.value as CatPattern, ...(pet.colors?.eyes ? { colors: { eyes: pet.colors.eyes } } : {}) })}>
              {CAT_PATTERNS.map((pattern) => <option key={pattern} value={pattern}>{PATTERNS[pattern]}</option>)}
            </select>
          </label>
        )}
        {pet.kind === 'dog' && (
          <label className="cp-onboarding__field">
            <span>Sa race</span>
            <select value={pet.variant} onChange={(e) => onPet({ kind: 'dog', variant: e.target.value as DogBreed })}>
              {DOG_BREEDS.map((breed) => <option key={breed} value={breed}>{BREEDS[breed]}</option>)}
            </select>
          </label>
        )}
      </div>
      {pet.kind !== 'none' && <PetPreview pet={pet} />}
      {pet.kind !== 'none' && (
        <div className="cp-pet__colours">
          <ColourRow label={pet.kind === 'rocky' ? 'Sa carapace' : pet.kind === 'duck' ? 'Sa couleur' : pet.kind === 'axolotl' ? 'Sa peau' : 'Son pelage'} colours={withCurrent(FUR_COLORS, furOf(pet))} value={furOf(pet)} onPick={(colour) => paint('fur', colour)} />
          {pet.kind === 'cat' && <ColourRow label="Ses yeux" colours={PET_EYE_COLORS} value={pet.colors?.eyes ?? PET_EYE_COLORS[0]} onPick={(colour) => paint('eyes', colour)} />}
        </div>
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
          <span>Modèle par défaut</span>
          <select value={habits.model} onChange={(e) => onHabits({ ...habits, model: e.target.value })}>
            {MODELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="cp-onboarding__field">
          <span>Autorisations par défaut</span>
          <select value={habits.permissionMode} onChange={(e) => onHabits({ ...habits, permissionMode: e.target.value as Preferences['permissionMode'] })}>
            {PERMISSION_MODES.map((mode) => <option key={mode} value={mode}>{PERMISSION_MODE_LABELS[mode]}</option>)}
          </select>
        </label>
      </div>
      <label className="cp-crew__check"><input type="checkbox" checked={sound} onChange={toggleSound} /> Un son quand une session a fini ou t’attend</label>
      <label className="cp-crew__check"><input type="checkbox" checked={habits.notifications} onChange={(e) => onHabits({ ...habits, notifications: e.target.checked })} /> Une notification macOS quand Open Space n’est pas devant toi</label>
      <label className="cp-crew__check"><input type="checkbox" checked={habits.festivals} onChange={(e) => onHabits({ ...habits, festivals: e.target.checked })} /> Le bureau se décore pour les fêtes (Noël, Halloween, les anniversaires…)</label>
      <label className="cp-onboarding__field">
        <span>Un mot pour tous tes agents <small className="cp-muted">(facultatif, pour les nouvelles conversations)</small></span>
        <textarea rows={2} maxLength={600} value={habits.agentNote} onChange={(e) => onHabits({ ...habits, agentNote: e.target.value })} placeholder="Tutoie-moi. Réponds en anglais. Explique simplement…" />
      </label>
    </>
  );
}
