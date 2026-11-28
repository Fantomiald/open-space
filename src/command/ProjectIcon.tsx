// A project's mark in the sessions' panel, and the dialog that chooses it (Preferences.projectIcons, shared/project-icons.ts):
// a Lucide icon in one of the colours, an emoji, initials, or a picture (its folder's own, found by the server, or a file
// picked here, shrunk to 64 px and stored by the server, the preferences naming it). A project without a choice shows its
// folder's picture, else a folder.
import { useEffect, useId, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { isEmoji, monoLetters, PROJECT_COLORS, withProjectIcon, type ProjectColor, type ProjectIcon } from '../../shared/project-icons.ts';
import { t } from '../i18n/index.ts';
import { projectPicture } from '../lib/images.ts';
import { upload } from '../lib/upload.ts';
import { initialsOf, PROJECT_EMOJI, searchIcons } from '../state/project-icons.ts';
import { useSessions } from '../state/sessions.ts';
import { Glyph, loadAllIcons, PROJECT_ICONS, ProjectFolderIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';

/** The address of a project's own picture (server/project-icon.ts): 404 when it has none. */
const pictureOf = (folder: string) => `/project-icon?folder=${encodeURIComponent(folder)}`;
/** The address of a picture picked for a project, stored by the server. */
const storedPictureOf = (id: string) => `/project-icon?id=${encodeURIComponent(id)}`;
/** The folders found without a picture, when: not asked again for a minute (the project may add one meanwhile). */
const pictureless = new Map<string, number>();
const ASK_AGAIN_MS = 60_000;
/** How long until the folder's picture is asked for again; 0: now. */
const waitFor = (folder: string) => Math.max(0, (pictureless.get(folder) ?? -Infinity) + ASK_AGAIN_MS - Date.now());

type AllIcons = Readonly<Record<string, LucideIcon>>;

/** Every Lucide icon, once `wanted`: null while it loads, 'failed' when it could not. */
function useAllIcons(wanted: boolean): AllIcons | null | 'failed' {
  const [all, setAll] = useState<AllIcons | null | 'failed'>(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    loadAllIcons().then((found) => { if (live) setAll(found); }, () => { if (live) setAll('failed'); });
    return () => { live = false; };
  }, [wanted]);
  return all;
}

/** A Lucide icon by name: one of the panel's at once, any other once the whole set is loaded (a folder meanwhile, or if it is gone). */
function NamedGlyph({ name }: { name: string }) {
  const own = PROJECT_ICONS[name];
  const all = useAllIcons(!own);
  const shape = own ?? (all && all !== 'failed' ? all[name] : undefined);
  return shape ? <Glyph shape={shape} /> : <ProjectFolderIcon />;
}

/** The folder's own picture, else a folder. */
function FolderPicture({ folder }: { folder: string }) {
  const [missing, setMissing] = useState(() => waitFor(folder) > 0);
  useEffect(() => {
    if (!missing) return;
    const again = setTimeout(() => setMissing(false), waitFor(folder));
    return () => clearTimeout(again);
  }, [missing, folder]);
  if (missing) return <span className="cp-project-mark" data-kind="folder"><ProjectFolderIcon /></span>;
  return (
    <span className="cp-project-mark" data-kind="image">
      <img src={pictureOf(folder)} alt="" onError={() => { pictureless.set(folder, Date.now()); setMissing(true); }} />
    </span>
  );
}

/** How an icon looks; null: the automatic one (the folder's picture). */
export function IconView({ icon, folder }: { icon: ProjectIcon | null; folder: string }) {
  switch (icon?.kind) {
    case 'icon': return <span className="cp-project-mark" data-kind="icon" data-project-color={icon.color}><NamedGlyph name={icon.name} /></span>;
    case 'emoji': return <span className="cp-project-mark" data-kind="emoji">{icon.value}</span>;
    case 'mono': return <span className="cp-project-mark" data-kind="mono" data-project-color={icon.color}>{icon.letters}</span>;
    case 'image': return <span className="cp-project-mark" data-kind="image"><img src={storedPictureOf(icon.id)} alt="" /></span>;
    default: return <FolderPicture key={folder} folder={folder} />;
  }
}

/** A project's mark, as the user chose it. */
export function ProjectMark({ folder }: { folder: string }) {
  const icon = useSessions((s) => s.preferences.projectIcons?.[folder] ?? null);
  return <IconView icon={icon} folder={folder} />;
}

const TABS = ['icons', 'emoji', 'mono', 'image'] as const;
type Tab = (typeof TABS)[number];
const tabOf = (icon: ProjectIcon | null): Tab => (icon?.kind === 'icon' ? 'icons' : icon?.kind === 'emoji' ? 'emoji' : icon?.kind === 'mono' ? 'mono' : 'image');

/** The colours, as dots to pick one. */
function ColorDots({ color, onPick }: { color: ProjectColor; onPick: (color: ProjectColor) => void }) {
  const words = t.session.projectIcon;
  return (
    <div className="cp-project-icon__colors" role="radiogroup" aria-label={words.color}>
      {PROJECT_COLORS.map((each) => (
        <button
          key={each} type="button" role="radio" className="cp-project-icon__dot" data-project-color={each} aria-checked={each === color}
          aria-label={words.colors[each]} title={words.colors[each]} onClick={() => onPick(each)}
        />
      ))}
    </div>
  );
}

/**
 * "Choose the project's icon": four tabs, each with its own pick; Save keeps the pick of the tab in sight (the Image
 * tab's automatic one included), Reset goes back to the automatic one at once.
 */
export function ProjectIconDialog({ folder, name, onClose }: { folder: string; name: string; onClose: () => void }) {
  const icons = useSessions((s) => s.preferences.projectIcons);
  const setPreferences = useSessions((s) => s.setPreferences);
  const saved = icons?.[folder] ?? null;
  const words = t.session.projectIcon;
  const [tab, setTab] = useState<Tab>(tabOf(saved));
  const [color, setColor] = useState<ProjectColor>(saved && 'color' in saved ? saved.color : 'blue');
  const [iconName, setIconName] = useState(saved?.kind === 'icon' ? saved.name : '');
  const [emoji, setEmoji] = useState(saved?.kind === 'emoji' ? saved.value : '');
  const [pasted, setPasted] = useState('');
  const [letters, setLetters] = useState(saved?.kind === 'mono' ? saved.letters : initialsOf(name));
  // the id of the picture picked (stored by the server as soon as it is picked)
  const [image, setImage] = useState(saved?.kind === 'image' ? saved.id : '');
  const [imageFailed, setImageFailed] = useState(false);
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  const all = useAllIcons(searching);
  const loaded = all && all !== 'failed' ? all : null;
  const file = useRef<HTMLInputElement>(null);
  const tabsId = useId();

  // what Save keeps: the pick of the tab in sight (undefined: nothing picked there yet; null: the automatic one)
  const chosen: ProjectIcon | null | undefined = tab === 'icons' ? (iconName ? { kind: 'icon', name: iconName, color } : undefined)
    : tab === 'emoji' ? (emoji ? { kind: 'emoji', value: emoji } : undefined)
      : tab === 'mono' ? (letters ? { kind: 'mono', letters, color } : undefined)
        : image ? { kind: 'image', id: image } : null;
  const save = (icon: ProjectIcon | null) => { setPreferences({ projectIcons: withProjectIcon(icons, folder, icon) }); onClose(); };

  const found = searching && loaded ? searchIcons(Object.keys(loaded), query) : [];
  const names = searching ? found : Object.keys(PROJECT_ICONS);
  const pick = async (picked: File | undefined) => {
    if (!picked) return;
    const picture = await projectPicture(picked);
    const id = picture ? await upload('/project-icon', picture).catch(() => null) : null;
    setImageFailed(!id);
    if (id) setImage(id);
  };

  return (
    <Modal title={words.title} onClose={onClose}>
      <p className="cp-muted">{words.text(name)}</p>
      <div className="cp-segmented cp-project-icon__tabs" role="tablist" aria-label={words.title}>
        {TABS.map((each) => (
          <button key={each} type="button" role="tab" id={`${tabsId}-${each}`} aria-selected={tab === each} aria-controls={`${tabsId}-panel`} onClick={() => setTab(each)}>
            {words.tabs[each]}
          </button>
        ))}
      </div>
      <div className="cp-project-icon__panel" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
        {tab === 'icons' && (
          <>
            <ColorDots color={color} onPick={setColor} />
            <input type="search" value={query} placeholder={words.search} aria-label={words.search} onChange={(event) => setQuery(event.target.value)} />
            {searching && all === null && <p className="cp-muted">{words.loading}</p>}
            {searching && all === 'failed' && <p className="cp-muted">{words.loadFailed}</p>}
            {searching && loaded && found.length === 0 && <p className="cp-muted">{words.noMatch}</p>}
            <div className="cp-project-icon__grid" role="group" aria-label={words.icons} data-project-color={color}>
              {names.map((each) => {
                const shape = PROJECT_ICONS[each] ?? loaded?.[each];
                return shape && (
                  <button key={each} type="button" className="cp-project-icon__cell" aria-pressed={iconName === each} aria-label={each} title={each} onClick={() => setIconName(each)}>
                    <Glyph shape={shape} />
                  </button>
                );
              })}
            </div>
          </>
        )}
        {tab === 'emoji' && (
          <>
            <div className="cp-project-icon__grid" role="group" aria-label={words.emoji}>
              {PROJECT_EMOJI.map((each) => (
                <button key={each} type="button" className="cp-project-icon__cell" data-kind="emoji" aria-pressed={emoji === each} aria-label={each} onClick={() => setEmoji(each)}>{each}</button>
              ))}
            </div>
            <label className="cp-project-icon__field">
              <span className="cp-muted">{words.paste}</span>
              <input
                value={pasted} placeholder={words.pastePlaceholder} maxLength={16}
                onChange={(event) => { const typed = event.target.value.trim(); setPasted(event.target.value); if (isEmoji(typed)) setEmoji(typed); }}
              />
            </label>
            {pasted.trim() !== '' && !isEmoji(pasted.trim()) && <p className="cp-muted">{words.notEmoji}</p>}
          </>
        )}
        {tab === 'mono' && (
          <>
            <ColorDots color={color} onPick={setColor} />
            <div className="cp-project-icon__mono">
              <span className="cp-project-icon__preview"><IconView icon={{ kind: 'mono', letters: letters || '?', color }} folder={folder} /></span>
              <label className="cp-project-icon__field">
                <span className="cp-muted">{words.letters}</span>
                <input value={letters} maxLength={8} onChange={(event) => setLetters(monoLetters(event.target.value))} />
                <span className="cp-muted">{words.lettersHint}</span>
              </label>
            </div>
          </>
        )}
        {tab === 'image' && (
          <>
            <div className="cp-project-icon__mono">
              <span className="cp-project-icon__preview"><IconView icon={image ? { kind: 'image', id: image } : null} folder={folder} /></span>
              <p className="cp-muted">{image ? words.picked : <><strong>{words.auto}</strong> : {words.autoText}</>}</p>
            </div>
            <div className="cp-project-icon__row">
              <button type="button" className="cp-button" onClick={() => file.current?.click()}>{words.pick}</button>
              {image && <button type="button" className="cp-button" data-variant="quiet" onClick={() => setImage('')}>{words.unpick}</button>}
            </div>
            <input ref={file} type="file" accept="image/*" hidden onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ''; }} />
            {imageFailed && <p className="cp-muted">{words.pickFailed}</p>}
          </>
        )}
      </div>
      <div className="cp-form__actions cp-project-icon__foot">
        <button type="button" className="cp-button" data-variant="quiet" disabled={!saved} onClick={() => save(null)}>{words.reset}</button>
        <button type="button" className="cp-button" onClick={onClose}>{words.cancel}</button>
        <button type="button" className="cp-button" data-variant="primary" data-autofocus disabled={chosen === undefined} onClick={() => { if (chosen !== undefined) save(chosen); }}>
          {words.save}
        </button>
      </div>
    </Modal>
  );
}
