// The office radio, pinned to the top left corner under the header. Its own source: live lo-fi web radios, played
// straight by the browser (the server stays offline); it starts on a click, as browsers refuse sound before one, and
// the station and the volume are remembered. It can instead drive Music or Spotify (server/music.ts): the
// sound then comes from the app, the radio is its remote. The source chosen is remembered too.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MusicAction, MusicApp } from '../../shared/music.ts';
import { t } from '../i18n/index.ts';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { useSessions } from '../state/sessions.ts';
import { ChevronDownIcon, LibraryIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from './Icons.tsx';
import { Marquee } from './Marquee.tsx';
import { useDismiss } from './useDismiss.ts';
import { IS_WINDOWS } from '../lib/platform.ts';

/** Direct MP3 streams, checked on 2026-10-16 (their names come from the streams' own ICY headers). */
const STATIONS = [
  { name: 'Lofi Hip Hop Radio', url: 'https://stream.zeno.fm/0r0xa792kwzuv' },
  { name: 'I♥Chillhop', url: 'https://streams.ilovemusic.de/iloveradio17.mp3' },
  { name: 'laut.fm Lofi', url: 'https://stream.laut.fm/lofi' },
] as const;

/** How often the remote asks the app what it plays (only while the tab is visible). */
const POLL_MS = 2000;

type Source = 'radio' | MusicApp;
type Status = 'off' | 'loading' | 'on' | 'failed';

export function Radio() {
  const apps = useSessions((s) => s.musicApps);
  const [chosen, setChosen] = useState<string>(() => readPreference('radio-source', 'radio'));
  const source: Source = apps.find((app) => app === chosen) ?? 'radio';
  const choose = (next: Source) => { setChosen(next); writePreference('radio-source', next); };
  const picker = (label: string) => <SourcePicker source={source} apps={apps} label={label} onChoose={choose} />;
  return source === 'radio' ? <Stations picker={picker} /> : <Remote key={source} app={source} picker={picker} />;
}

/** The radio's small label, which opens the list of sources when the computer has a music app. */
function SourcePicker({ source, apps, label, onChoose }: { source: Source; apps: readonly MusicApp[]; label: string; onChoose: (source: Source) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  const words = t.common.radio;
  if (!apps.length) return <span className="cp-radio__label" aria-live="polite">{label}</span>;
  return (
    <span className="cp-radio__source" ref={box}>
      <button type="button" className="cp-radio__pick" aria-expanded={open} aria-controls="radio-sources" title={words.source} onClick={() => setOpen(!open)}>
        <span className="cp-radio__label" aria-live="polite">{label}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <span className="cp-radio__menu" id="radio-sources" role="group" aria-label={words.source}>
          {(['radio', ...apps] as const).map((option) => (
            <button key={option} type="button" aria-pressed={option === source} onClick={() => { onChoose(option); close(); }}>{words.sources[option]}</button>
          ))}
        </span>
      )}
    </span>
  );
}

function Stations({ picker }: { picker: (label: string) => ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [station, setStation] = useState(() => Math.min(readPreference('radio-station', 0), STATIONS.length - 1));
  const [volume, setVolume] = useState(() => readPreference('radio-volume', 0.5));
  const [status, setStatus] = useState<Status>('off');

  useEffect(() => {
    const player = new Audio();
    player.preload = 'none';
    player.addEventListener('playing', () => setStatus('on'));
    player.addEventListener('waiting', () => setStatus('loading'));
    player.addEventListener('error', () => setStatus((current) => (current === 'off' ? 'off' : 'failed')));
    audio.current = player;
    return () => { player.pause(); player.removeAttribute('src'); audio.current = null; };
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
    writePreference('radio-volume', volume);
  }, [volume]);

  /** A live stream is never resumed where it stopped: playing always reconnects to now. */
  const listen = (index: number) => {
    const player = audio.current;
    if (!player) return;
    player.src = STATIONS[index].url;
    setStatus('loading');
    void player.play().catch(() => setStatus('failed'));
  };

  const toggle = () => {
    const player = audio.current;
    if (!player) return;
    if (status === 'on' || status === 'loading') { player.pause(); player.removeAttribute('src'); player.load(); setStatus('off'); return; }
    listen(station);
  };

  const nextStation = () => {
    const next = (station + 1) % STATIONS.length;
    setStation(next);
    writePreference('radio-station', next);
    if (status !== 'off') listen(next);
  };

  const playing = status === 'on' || status === 'loading';
  const words = t.common.radio;
  return (
    <section className="cp-radio" aria-label={words.label} data-playing={status === 'on'}>
      <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={playing ? words.stop : words.listen} onClick={toggle}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="cp-radio__bars" aria-hidden="true"><span /><span /><span /></span>
      <span className="cp-radio__now">
        {picker(status === 'loading' ? words.connecting : status === 'failed' ? words.unreachable : status === 'on' ? words.live : words.label)}
        <Marquee className="cp-radio__title">{STATIONS[station].name}</Marquee>
      </span>
      <button type="button" className="cp-icon-button" aria-label={words.next} title={words.next} onClick={nextStation}><NextIcon /></button>
      <label className="cp-radio__volume">
        <span className="cp-sr-only">{words.volume}</span>
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
      </label>
    </section>
  );
}

/** The remote of a music app: what it plays, play/pause, previous, next, its volume, and Music's library. */
function Remote({ app, picker }: { app: MusicApp; picker: (label: string) => ReactNode }) {
  const send = useSessions((s) => s.send);
  const now = useSessions((s) => (s.nowPlaying?.app === app ? s.nowPlaying : null));
  /** the volume being set, shown until the app reports it */
  const [volume, setVolume] = useState<number | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    const ask = () => { if (!document.hidden) send({ t: 'music', app }); };
    ask();
    const poll = window.setInterval(ask, POLL_MS);
    document.addEventListener('visibilitychange', ask);
    return () => { window.clearInterval(poll); document.removeEventListener('visibilitychange', ask); };
  }, [app, send]);
  useEffect(() => { if (volume !== null && now?.volume === volume) setVolume(null); }, [now, volume]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const act = (action: MusicAction) => send({ t: 'music', app, action });
  const changeVolume = (value: number) => {
    setVolume(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => act({ kind: 'volume', volume: value }), 150);
  };

  const words = t.common.radio;
  const name = words.sources[app];
  const state = now?.state;
  const track = now?.track ?? null;
  const title = state === 'denied' ? words.denied : state === 'closed' ? (IS_WINDOWS ? words.closedWindows(name) : words.closed(name)) : track ? [track.title, track.artist].filter(Boolean).join(' · ') : now ? words.nothing : '';
  return (
    <section className="cp-radio" aria-label={name} data-playing={state === 'playing'} title={state === 'denied' ? (IS_WINDOWS ? words.deniedWindows(name) : words.deniedHelp(name)) : undefined}>
      <button
        type="button" className="cp-icon-button" data-variant="outlined" aria-label={state === 'playing' ? words.pauseTrack : words.playTrack}
        disabled={state === 'denied' || now?.controls?.toggle === false} onClick={() => act({ kind: 'toggle' })}
      >
        {state === 'playing' ? <PauseIcon /> : <PlayIcon />}
      </button>
      {now?.artwork ? <img className="cp-radio__art" src={now.artwork} alt="" /> : <span className="cp-radio__bars" aria-hidden="true"><span /><span /><span /></span>}
      <span className="cp-radio__now">
        {picker(state === 'paused' ? `${name} · ${words.paused}` : name)}
        <Marquee className="cp-radio__title" live>{title}</Marquee>
      </span>
      <button type="button" className="cp-icon-button cp-radio__previous" aria-label={words.previousTrack} title={words.previousTrack} disabled={!track || now?.controls?.previous === false} onClick={() => act({ kind: 'previous' })}><PreviousIcon /></button>
      <button type="button" className="cp-icon-button" aria-label={words.nextTrack} title={words.nextTrack} disabled={!track || now?.controls?.next === false} onClick={() => act({ kind: 'next' })}><NextIcon /></button>
      {now?.controls?.volume !== false && <label className="cp-radio__volume">
        <span className="cp-sr-only">{words.volume}</span>
        <input type="range" min={0} max={100} step={5} value={volume ?? now?.volume ?? 0} disabled={!now || state === 'closed' || state === 'denied'} onChange={(e) => changeVolume(Number(e.target.value))} />
      </label>}
      {app === 'music' && state !== 'denied' && now?.controls?.library !== false && <Library />}
    </section>
  );
}

/** Music's playlists, and a search of the library (AppleScript does not reach the rest of Apple Music). */
function Library() {
  const send = useSessions((s) => s.send);
  const library = useSessions((s) => s.musicLibrary);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  const wanted = query.trim();

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const timer = window.setTimeout(() => send({ t: 'musicLibrary', query: wanted }), wanted ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [open, wanted, send]);

  const play = (action: MusicAction) => { send({ t: 'music', app: 'music', action }); close(); };
  const found = library?.query === wanted ? library.tracks : null;
  const words = t.common.radio;
  return (
    <div className="cp-radio__library" ref={box}>
      <button type="button" className="cp-icon-button" aria-expanded={open} aria-controls="radio-library" aria-label={words.library} title={words.library} onClick={() => setOpen(!open)}>
        <LibraryIcon />
      </button>
      {open && (
        <div className="cp-radio__panel" id="radio-library" role="group" aria-label={words.library}>
          <input ref={field} type="search" value={query} placeholder={words.search} aria-label={words.search} onChange={(e) => setQuery(e.target.value)} />
          {wanted ? (
            <>
              {found && (found.length
                ? <ul className="cp-radio__list">{found.map((track) => (
                  <li key={track.id}>
                    <button type="button" onClick={() => play({ kind: 'track', id: track.id })}>
                      <span className="cp-radio__item-title">{track.title}</span><span className="cp-radio__item-artist">{track.artist}</span>
                    </button>
                  </li>
                ))}</ul>
                : <p className="cp-radio__empty">{words.noTrack}</p>)}
              <p className="cp-radio__hint">{words.libraryOnly}</p>
            </>
          ) : (
            <>
              <h3 className="cp-radio__heading">{words.playlists}</h3>
              {library && (library.playlists.length
                ? <ul className="cp-radio__list">{library.playlists.map((playlist) => (
                  <li key={playlist}><button type="button" onClick={() => play({ kind: 'playlist', name: playlist })}><span className="cp-radio__item-title">{playlist}</span></button></li>
                ))}</ul>
                : <p className="cp-radio__empty">{words.noPlaylist}</p>)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
