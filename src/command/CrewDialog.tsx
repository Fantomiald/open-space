import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CLOTH_COLORS, DEFAULT_LOOK, FANCY_SKINS, GLASSES_COLORS, HAIR_COLORS, SKIN_TONES } from '../design/people-palette.ts';
import { BEARD_STYLES, BOTTOMS, EYES, HAIR_STYLES, HATS, SHOES, TOPS, type Look } from '../../shared/look.ts';
import type { CrewMember } from '../../shared/protocol.ts';
import { HAT_ROWS, chibiHead, chibiSprite } from '../room/chibi.ts';
import type { Pose } from '../room/sprites.ts';
import { useSessions } from '../state/sessions.ts';
import { Modal } from './Modal.tsx';
import { PetPicker } from './PreferenceFields.tsx';

const LABELS = {
  eyes: { round: 'Ronds', wide: 'Grands', sleepy: 'Mi-clos', lashes: 'Avec cils', happy: 'Rieurs' },
  hair: {
    none: 'Rasé', buzz: 'Très courts', short: 'Courts', sidePart: 'Raie sur le côté', curly: 'Bouclés', quiff: 'Houppette', spiky: 'En pics', mohawk: 'Crête',
    afro: 'Afro', pigtails: 'Couettes', bob: 'Carré', ponytail: 'Queue de cheval', bun: 'Chignon', braids: 'Tresses', long: 'Longs', bangs: 'Longs à frange',
  },
  beard: { none: 'Aucune', stubble: 'De trois jours', mustache: 'Moustache', short: 'Courte', chinstrap: 'Collier', full: 'Pleine', long: 'Longue', handlebar: 'Moustache en guidon', goatee: 'Bouc' },
  top: {
    tshirt: 'T-shirt', tank: 'Débardeur', vneck: 'Col V', polo: 'Polo', shirt: 'Chemise', hoodie: 'Sweat à capuche', sweater: 'Pull col roulé', jacket: 'Veste ouverte',
    suit: 'Costume', threePiece: 'Trois-pièces', tracksuit: 'Survêtement', dress: 'Robe', blanket: 'Couverture', none: 'Torse nu',
  },
  bottom: { pants: 'Pantalon', shorts: 'Short', skirt: 'Jupe', tracksuit: 'Survêtement' },
  shoes: { shoes: 'Chaussures', sneakers: 'Baskets', boots: 'Bottes', heels: 'Talons', sandals: 'Sandales', flipflops: 'Tongs', barefoot: 'Pieds nus' },
  hat: {
    none: 'Aucun', cap: 'Casquette', beanie: 'Bonnet', beret: 'Béret', tophat: 'Haut-de-forme', party: 'Chapeau pointu', gold: 'Chapeau doré',
    santa: 'Bonnet de Noël', crown: 'Couronne', bunny: 'Oreilles de lapin',
  },
} as const;

/** The hats that take a colour of one's choice. */
const COLOURED_HATS: ReadonlySet<Look['hat']> = new Set(['cap', 'beanie', 'beret', 'tophat', 'party']);

const TABS = ['Visage', 'Cheveux', 'Barbe', 'Tête', 'Haut', 'Bas', 'Chaussures'] as const;
type Tab = (typeof TABS)[number];

/** The four directions of the room, turned one after the other by the preview's arrows. */
const DIRECTIONS: Pose['direction'][] = ['down-right', 'down-left', 'up-left', 'up-right'];

type Draft = { previousName: string | null; name: string; look: Look; self: boolean; birthday: string };
const draftOf = (member: CrewMember): Draft => ({ previousName: member.name, name: member.name, look: member.look ?? DEFAULT_LOOK, self: member.self === true, birthday: member.birthday ?? '' });
const NEW_MEMBER: Draft = { previousName: null, name: '', look: DEFAULT_LOOK, self: false, birthday: '' };
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

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
    <Modal title="Ton équipe" onClose={close} wide>
      <div className="cp-segmented cp-crew__sections" role="tablist" aria-label="Équipe">
        <button type="button" role="tab" aria-selected={section === 'people'} onClick={() => setSection('people')}>Personnes</button>
        <button type="button" role="tab" aria-selected={section === 'pet'} onClick={() => setSection('pet')}>Animal</button>
      </div>
      {section === 'people' ? <PeopleTab close={close} /> : <PetTab close={close} />}
    </Modal>
  );
}

/** The office pet, saved with the settings (Preferences.pet). */
function PetTab({ close }: { close: () => void }) {
  const saved = useSessions((s) => s.preferences.pet);
  const setPreferences = useSessions((s) => s.setPreferences);
  const toast = useSessions((s) => s.toast);
  const [pet, setPet] = useState(saved);
  const save = () => {
    if (!setPreferences({ pet })) { toast('error', 'Pas de connexion au serveur, réessaie.'); return; }
    toast('info', 'Ton animal est enregistré.');
  };
  return (
    <>
      <div className="cp-onboarding__page"><PetPicker pet={pet} onPet={setPet} /></div>
      <div className="cp-form__actions">
        <button type="button" className="cp-button" onClick={close}>Fermer</button>
        <button type="button" className="cp-button" data-variant="primary" onClick={save}>Enregistrer</button>
      </div>
    </>
  );
}

function PeopleTab({ close }: { close: () => void }) {
  const crew = useSessions((s) => s.crew);
  const saveMember = useSessions((s) => s.saveMember);
  const removeMember = useSessions((s) => s.removeMember);
  const toast = useSessions((s) => s.toast);
  const first = crew.find((member) => member.self) ?? crew[0];
  const [draft, setDraft] = useState<Draft>(() => (first ? draftOf(first) : NEW_MEMBER));
  const [confirmRemove, setConfirmRemove] = useState(false);

  const pick = (member: Draft) => { setDraft(member); setConfirmRemove(false); };

  const save = () => {
    const name = draft.name.trim();
    if (!name) { toast('error', 'Donne un prénom.'); return; }
    if (!saveMember(draft.previousName, name, draft.look, draft.birthday || undefined)) { toast('error', 'Pas de connexion au serveur, réessaie.'); return; }
    toast('info', `${name} est enregistré.`);
    setDraft((current) => ({ ...current, previousName: name, name }));
  };

  return (
    <>
      <div className="cp-crew">
        <nav className="cp-crew__list" aria-label="Personnes">
          {crew.map((member) => (
            <button key={member.name} type="button" className="cp-crew__member" aria-current={draft.previousName === member.name} onClick={() => pick(draftOf(member))}>
              <img src={chibiHead(member.look ?? DEFAULT_LOOK)} alt="" width={27} height={27} />
              <span>{member.name}{member.self && <small className="cp-muted"> (toi)</small>}</span>
            </button>
          ))}
          <button type="button" className="cp-button" onClick={() => pick(NEW_MEMBER)}>
            Ajouter une personne
          </button>
        </nav>
        <LookEditor
          look={draft.look} onLook={(look) => setDraft((current) => ({ ...current, look }))}
          name={draft.name} onName={(name) => setDraft((current) => ({ ...current, name }))}
          birthday={draft.birthday} onBirthday={(birthday) => setDraft((current) => ({ ...current, birthday }))}
        />
      </div>

      <div className="cp-form__actions">
        {draft.previousName !== null && !draft.self && (confirmRemove
          ? <button type="button" className="cp-button" data-variant="danger" onClick={() => { removeMember(draft.previousName!); pick(first && first.name !== draft.previousName ? draftOf(first) : NEW_MEMBER); }}>Confirmer la suppression</button>
          : <button type="button" className="cp-button" onClick={() => setConfirmRemove(true)}>Supprimer</button>)}
        <button type="button" className="cp-button" onClick={close}>Fermer</button>
        <button type="button" className="cp-button" data-variant="primary" onClick={save}>Enregistrer</button>
      </div>
    </>
  );
}

/**
 * A person's look, turned around in a preview, with their first name and birthday, and the wardrobe to dress them:
 * in the crew editor and at the first start.
 */
export function LookEditor({ look, onLook, name, onName, birthday, onBirthday }: {
  look: Look; onLook: (look: Look) => void; name: string; onName: (name: string) => void; birthday: string; onBirthday: (birthday: string) => void;
}) {
  const [direction, setDirection] = useState(0);
  const [tab, setTab] = useState<Tab>('Visage');
  const change = (part: Partial<Look>) => onLook({ ...look, ...part });
  const [month = '', day = ''] = birthday.split('-');
  const setBirthday = (nextMonth: string, nextDay: string) => onBirthday(nextMonth && nextDay ? `${nextMonth}-${nextDay}` : '');
  return (
    <>

        <div className="cp-crew__stage">
          <Preview look={look} direction={DIRECTIONS[direction]} label={`Aperçu de ${name || 'la personne'}`} />
          <div className="cp-crew__turn">
            <button type="button" className="cp-button" aria-label="Tourner vers la gauche" onClick={() => setDirection((value) => (value + 3) % 4)}>←</button>
            <button type="button" className="cp-button" aria-label="Tourner vers la droite" onClick={() => setDirection((value) => (value + 1) % 4)}>→</button>
          </div>
          <label className="cp-crew__name">
            <span>Prénom</span>
            <input value={name} maxLength={40} onChange={(e) => onName(e.target.value)} placeholder="Marius" />
          </label>
          <div className="cp-crew__name" role="group" aria-label="Anniversaire">
            <span>Anniversaire <small className="cp-muted">(facultatif)</small></span>
            <div className="cp-crew__birthday">
              <select aria-label="Jour" value={day} onChange={(e) => setBirthday(month || '01', e.target.value)}>
                <option value="">Jour</option>
                {Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, '0')).map((value) => <option key={value} value={value}>{Number(value)}</option>)}
              </select>
              <select aria-label="Mois" value={month} onChange={(e) => setBirthday(e.target.value, day || '01')}>
                <option value="">Mois</option>
                {MONTHS.map((label, index) => { const value = String(index + 1).padStart(2, '0'); return <option key={value} value={value}>{label}</option>; })}
              </select>
            </div>
          </div>
        </div>

        <div className="cp-crew__wardrobe">
          <div className="cp-crew__tabs" role="tablist" aria-label="Parties">
            {TABS.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>{name}</button>)}
          </div>
          <div className="cp-crew__panel" role="tabpanel" aria-label={tab}>
            {tab === 'Visage' && (
              <>
                <Swatches label="Peau" colours={[...SKIN_TONES, ...FANCY_SKINS]} value={look.skin} onPick={(skin) => change({ skin })} />
                <Choices label="Yeux" options={EYES} labels={LABELS.eyes} value={look.eyes} onPick={(eyes) => change({ eyes })} />
                <Choices
                  label="Lunettes" options={['none', 'on', 'sun'] as const} labels={{ none: 'Aucunes', on: 'Lunettes', sun: 'Lunettes de soleil' }}
                  value={look.sunglasses ? 'sun' : look.glasses ? 'on' : 'none'}
                  onPick={(value) => change({ sunglasses: value === 'sun', glasses: value === 'on' ? look.glasses ?? GLASSES_COLORS[0] : null })}
                />
                {look.glasses && !look.sunglasses && <Swatches label="Monture" colours={GLASSES_COLORS} value={look.glasses} onPick={(glasses) => change({ glasses })} />}
                <label className="cp-crew__check"><input type="checkbox" checked={look.watch} onChange={(e) => change({ watch: e.target.checked })} /> Montre</label>
              </>
            )}
            {tab === 'Cheveux' && (
              <>
                <Choices label="Coiffure" options={HAIR_STYLES} labels={LABELS.hair} value={look.hair} onPick={(hair) => change({ hair })} />
                {look.hair !== 'none' && <Swatches label="Couleur" colours={HAIR_COLORS} value={look.hairColor} onPick={(hairColor) => change({ hairColor })} />}
              </>
            )}
            {tab === 'Barbe' && (
              <>
                <Choices label="Barbe" options={BEARD_STYLES} labels={LABELS.beard} value={look.beard} onPick={(beard) => change({ beard })} />
                {look.beard !== 'none' && <Swatches label="Couleur" colours={HAIR_COLORS} value={look.beardColor} onPick={(beardColor) => change({ beardColor })} />}
              </>
            )}
            {tab === 'Tête' && (
              <>
                <Choices label="Chapeau" options={HATS} labels={LABELS.hat} value={look.hat} onPick={(hat) => change({ hat })} />
                {COLOURED_HATS.has(look.hat) && <Swatches label="Couleur" colours={CLOTH_COLORS} value={look.hatColor} onPick={(hatColor) => change({ hatColor })} />}
                <label className="cp-crew__check"><input type="checkbox" checked={look.headphones} onChange={(e) => change({ headphones: e.target.checked })} /> Casque audio</label>
                <p className="cp-muted">Pendant les fêtes, leur chapeau (bonnet de Noël, oreilles de lapin…) passe par-dessus le tien.</p>
              </>
            )}
            {tab === 'Haut' && (
              <>
                <Choices label="Haut" options={TOPS} labels={LABELS.top} value={look.top} onPick={(top) => change({ top })} />
                {look.top !== 'none' && <Swatches label="Couleur" colours={CLOTH_COLORS} value={look.topColor} onPick={(topColor) => change({ topColor })} />}
                {(look.top === 'threePiece' || look.top === 'tracksuit' || look.top === 'jacket') && (
                  <Swatches label={{ threePiece: 'Cravate', tracksuit: 'Bandes', jacket: 'Dessous' }[look.top]} colours={CLOTH_COLORS} value={look.accentColor} onPick={(accentColor) => change({ accentColor })} />
                )}
              </>
            )}
            {tab === 'Bas' && (
              look.top === 'blanket' ? <p className="cp-muted">La couverture cache le bas et les chaussures.</p>
                : look.top === 'dress' ? <p className="cp-muted">La robe tient lieu de bas.</p> : (
                <>
                  <Choices label="Bas" options={BOTTOMS} labels={LABELS.bottom} value={look.bottom} onPick={(bottom) => change({ bottom })} />
                  <Swatches label="Couleur" colours={CLOTH_COLORS} value={look.bottomColor} onPick={(bottomColor) => change({ bottomColor })} />
                </>
              )
            )}
            {tab === 'Chaussures' && (
              look.top === 'blanket' ? <p className="cp-muted">La couverture cache le bas et les chaussures.</p> : (
                <>
                  <Choices label="Chaussures" options={SHOES} labels={LABELS.shoes} value={look.shoes} onPick={(shoes) => change({ shoes })} />
                  <Swatches label="Couleur" colours={CLOTH_COLORS} value={look.shoesColor} onPick={(shoesColor) => change({ shoesColor })} />
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
