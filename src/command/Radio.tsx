// The office radio, pinned to the top left corner under the header: live lo-fi web radios, played straight by the
// browser (the server stays offline). It starts on a click, as browsers refuse sound before one; the station and
// the volume are remembered.
import { useEffect, useRef, useState } from 'react';
import { readPreference, writePreference } from '../lib/preferences.ts';
import { NextIcon, PauseIcon, PlayIcon } from './Icons.tsx';

/** Direct MP3 streams, checked on 2026-10-16 (their names come from the streams' own ICY headers). */
const STATIONS = [
  { name: 'Lofi Hip Hop Radio', url: 'https://stream.zeno.fm/0r0xa792kwzuv' },
  { name: 'I♥Chillhop', url: 'https://streams.ilovemusic.de/iloveradio17.mp3' },
  { name: 'laut.fm Lofi', url: 'https://stream.laut.fm/lofi' },
] as const;

type Status = 'off' | 'loading' | 'on' | 'failed';

export function Radio() {
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
  return (
    <section className="cp-radio" aria-label="Radio" data-playing={status === 'on'}>
      <button type="button" className="cp-icon-button" data-variant="outlined" aria-label={playing ? 'Couper la radio' : 'Écouter la radio'} onClick={toggle}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="cp-radio__bars" aria-hidden="true"><span /><span /><span /></span>
      <span className="cp-radio__now">
        <span className="cp-radio__label" aria-live="polite">{status === 'loading' ? 'Connexion…' : status === 'failed' ? 'Radio injoignable' : status === 'on' ? 'En direct' : 'Radio'}</span>
        <span className="cp-radio__title">{STATIONS[station].name}</span>
      </span>
      <button type="button" className="cp-icon-button" aria-label="Radio suivante" title="Radio suivante" onClick={nextStation}><NextIcon /></button>
      <label className="cp-radio__volume">
        <span className="cp-sr-only">Volume</span>
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
      </label>
    </section>
  );
}
