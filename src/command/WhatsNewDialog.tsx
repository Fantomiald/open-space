import { useState, type ComponentType } from 'react';
import { t } from '../i18n/index.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { useSessions } from '../state/sessions.ts';
import { releaseToShow, type Release } from '../state/whats-new.ts';
import { AutomatonIcon, CloseIcon, DashboardIcon, ExternalLinkIcon, KeyIcon, SparklesIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { REPOSITORY } from './SettingsDialog.tsx';
import { type Art, ShowcaseArt } from './ShowcaseArt.tsx';
import { SLIDES, Tour } from './Tour.tsx';

/** The last version the news were closed on, in this browser: the next start shows only what came after. */
export const SEEN_KEY = 'whats-new';
export const markNewsSeen = () => writePreference(SEEN_KEY, __APP_VERSION__);

type Action = 'automata' | 'mods' | 'settings' | 'tour' | 'dashboards';
interface Item { id: string; icon: ComponentType; action?: Action }

/** Each release's drawing and its points, in the order told; their words are in i18n (`showcase.whatsNew.releases`). */
const LOOKS: Record<Release, { art: Art; items: readonly Item[] }> = {
  '1.35': {
    art: 'mods',
    items: [
      { id: 'news', icon: SparklesIcon, action: 'dashboards' }, { id: 'bar', icon: DashboardIcon }, { id: 'automata', icon: AutomatonIcon, action: 'automata' }, { id: 'keys', icon: KeyIcon },
    ],
  },
};

function act(action: Action) {
  const store = useSessions.getState();
  if (action === 'automata') store.openAutomata(true);
  else if (action === 'mods') store.openModsPanel(true);
  else if (action === 'tour') store.openShowcase('tour');
  else if (action === 'dashboards') store.setView('dashboards');
  else store.openSettings(true, 'sessions', 'autoTag');
}

/** A release: its drawing, its title, and what changed, each point with the button that leads to it when there is one. */
function ReleaseNews({ release, onAction }: { release: Release; onAction: (action: Action) => void }) {
  const self = useSessions((s) => s.crew.find((member) => member.self)?.look ?? undefined);
  const words = t.showcase.whatsNew;
  const news = words.releases[release];
  const items = news.items as Record<string, { title: string; text: string }>;
  // the people to thank, when a release came from their pull requests
  const thanks = (news as { thanks?: string }).thanks;
  const look = LOOKS[release];
  return (
    <article className="cp-news__release" aria-labelledby={`news-${release}`}>
      <ShowcaseArt art={look.art} look={self} />
      <div className="cp-news__body">
        <p className="cp-news__version">{words.version(release)}</p>
        <h3 id={`news-${release}`}>{news.title}</h3>
        <ul className="cp-news__items">
          {look.items.map(({ id, icon: Icon, action }) => (
            <li key={id}>
              <span className="cp-news__icon"><Icon /></span>
              <div>
                <strong>{items[id].title}</strong>
                <p>{items[id].text}</p>
                {action && <button type="button" className="cp-news__action" onClick={() => onAction(action)}>{words.actions[action]}</button>}
              </div>
            </li>
          ))}
        </ul>
        {thanks && <p className="cp-news__thanks">{thanks}</p>}
      </div>
    </article>
  );
}

function NewsDialog({ release, onClose }: { release: Release; onClose: () => void }) {
  const words = t.showcase.whatsNew;
  return (
    <Modal title={words.title} onClose={onClose} look="showcase">
      <div className="cp-news">
        <header className="cp-news__head">
          <p className="cp-news__kicker"><SparklesIcon />{words.kicker(__APP_VERSION__)}</p>
          <h2>{words.title}</h2>
          <p className="cp-muted">{words.intro}</p>
          <button type="button" className="cp-icon-button cp-news__close" aria-label={words.close} title={words.close} onClick={onClose}><CloseIcon /></button>
        </header>
        <div className="cp-news__list">
          <ReleaseNews release={release} onAction={(action) => { onClose(); act(action); }} />
        </div>
        <footer className="cp-news__foot">
          <a className="cp-button" href={`${REPOSITORY}/releases`} target="_blank" rel="noreferrer">{words.allNotes} <ExternalLinkIcon /></a>
          <button type="button" className="cp-button" data-variant="primary" data-autofocus onClick={onClose}>{words.close}</button>
        </footer>
      </div>
    </Modal>
  );
}

/** The onboarding's tour, again: its own buttons, as the onboarding's are gone. */
function TourDialog({ onClose }: { onClose: () => void }) {
  const words = t.showcase.tour;
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const look = useSessions((s) => s.crew.find((member) => member.self)?.look ?? undefined);
  return (
    <Modal title={words.label} onClose={onClose} look="showcase">
      <div className="cp-news" data-tour="true">
        <button type="button" className="cp-icon-button cp-news__close" aria-label={t.settings.close} title={t.settings.close} onClick={onClose}><CloseIcon /></button>
        <Tour index={index} onIndex={setIndex} look={look} inDialog />
        <footer className="cp-news__foot">
          {index > 0 && <button type="button" className="cp-button" onClick={() => setIndex(index - 1)}>{words.previous}</button>}
          <button type="button" className="cp-button" data-variant="primary" data-autofocus onClick={() => (last ? onClose() : setIndex(index + 1))}>{last ? words.done : words.next}</button>
        </footer>
      </div>
    </Modal>
  );
}

/**
 * The latest release's news, once per new version (closing it marks it seen); and, asked for from the settings, those
 * news again or the tour. Mounted once the user is known and onboarded (App.tsx).
 */
export function WhatsNew() {
  const showcase = useSessions((s) => s.showcase);
  const openShowcase = useSessions((s) => s.openShowcase);
  const [unseen, setUnseen] = useState(() => releaseToShow(__APP_VERSION__, readPreference<string | null>(SEEN_KEY, null)) as Release | null);
  const latest = releaseToShow(__APP_VERSION__, null) as Release | null;
  const close = () => { markNewsSeen(); setUnseen(null); openShowcase(null); };
  if (showcase === 'tour') return <TourDialog onClose={() => openShowcase(null)} />;
  const release = showcase === 'whatsNew' ? latest : unseen;
  return release ? <NewsDialog release={release} onClose={close} /> : null;
}
