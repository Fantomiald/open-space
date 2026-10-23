// The music apps of the user's Mac, driven by AppleScript (osascript) for the office radio: what plays, play/pause,
// next, previous, volume; for Music also the playlists and a search of the library (AppleScript sees only the
// library, not Apple Music's catalogue). Windows uses SMTC for playback and metadata (windows-music.ts).
// An app that is not open is never launched just to be asked what it plays; an action (play...) opens it.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MusicAction, MusicApp, MusicTrack, NowPlaying } from '../shared/music.ts';
import { windowsMusicApps, windowsNowPlaying } from './windows-music.ts';

const PLACES: Readonly<Record<MusicApp, readonly string[]>> = {
  music: ['/System/Applications/Music.app'],
  spotify: ['/Applications/Spotify.app', path.join(os.homedir(), 'Applications', 'Spotify.app')],
};
const NAMES: Readonly<Record<MusicApp, string>> = { music: 'Music', spotify: 'Spotify' };
const FIELD = '\u001f', RECORD = '\u001e';
const MAX_TRACKS = 25;

export async function installedMusicApps(): Promise<MusicApp[]> {
  if (process.platform === 'win32') return windowsMusicApps();
  if (process.platform !== 'darwin') return [];
  return (Object.keys(PLACES) as MusicApp[]).filter((app) => PLACES[app].some((place) => existsSync(place)));
}

class Denied extends Error {}

/** Runs AppleScript lines inside `on run argv`: what comes from the page reaches the script as argv, never as code. */
function run(lines: readonly string[], argv: readonly string[] = []): Promise<string> {
  const script = ['on run argv', `set FS to character id 31`, `set RS to character id 30`, ...lines, 'end run'];
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', [...script.flatMap((line) => ['-e', line]), ...argv], { timeout: 5000 }, (error, stdout, stderr) => {
      // -1743: the user (or macOS) refused Open Space control of the app
      if (error) reject(/-1743/.test(stderr) ? new Denied() : new Error(stderr.trim() || error.message));
      else resolve(stdout.replace(/\n$/, ''));
    });
  });
}

const number = (text: string | undefined) => Number((text ?? '').replace(',', '.')) || 0;

/** The state, then the track's fields; Spotify gives its durations in milliseconds and its own cover's address. */
const NOW_PLAYING: Readonly<Record<MusicApp, readonly string[]>> = {
  music: [
    'if not (application "Music" is running) then return "closed"',
    'tell application "Music"',
    '  set s to player state as string',
    '  if s is "stopped" then return s & FS & (sound volume as string)',
    '  set t to current track',
    '  set i to ""',
    '  try',
    '    set i to persistent ID of t',
    '  end try',
    '  return s & FS & (sound volume as string) & FS & (player position as string) & FS & i & FS & name of t & FS & artist of t & FS & album of t & FS & (duration of t as string) & FS & (count of artworks of t)',
    'end tell',
  ],
  spotify: [
    'if not (application "Spotify" is running) then return "closed"',
    'tell application "Spotify"',
    '  set s to player state as string',
    '  if s is "stopped" then return s & FS & (sound volume as string)',
    '  set t to current track',
    '  return s & FS & (sound volume as string) & FS & (player position as string) & FS & id of t & FS & name of t & FS & artist of t & FS & album of t & FS & ((duration of t) / 1000 as string) & FS & artwork url of t',
    'end tell',
  ],
};

let artworkFolder: Promise<string> | null = null;
const artworks = new Map<string, string | null>();

/** Music's cover of the current track, as a small JPEG data: image (the raw one is often a megabyte of PNG). */
async function musicArtwork(trackId: string): Promise<string | null> {
  if (artworks.has(trackId)) return artworks.get(trackId)!;
  artworkFolder ??= mkdtemp(path.join(os.tmpdir(), 'open-space-music-'));
  const folder = await artworkFolder;
  const raw = path.join(folder, 'raw'), small = path.join(folder, 'small.jpg');
  let artwork: string | null = null;
  try {
    await run([
      'tell application "Music" to set d to raw data of artwork 1 of current track',
      'set f to open for access (POSIX file (item 1 of argv)) with write permission',
      'set eof f to 0',
      'write d to f',
      'close access f',
    ], [raw]);
    await new Promise<void>((resolve, reject) => execFile('/usr/bin/sips', ['-s', 'format', 'jpeg', '-Z', '192', raw, '--out', small], { timeout: 5000 }, (error) => (error ? reject(error) : resolve())));
    artwork = `data:image/jpeg;base64,${(await readFile(small)).toString('base64')}`;
  } catch { /* no cover then */ }
  await Promise.all([rm(raw, { force: true }), rm(small, { force: true })]);
  if (artworks.size > 50) artworks.clear();
  artworks.set(trackId, artwork);
  return artwork;
}

export async function nowPlaying(app: MusicApp): Promise<NowPlaying> {
  if (process.platform === 'win32') return windowsNowPlaying(app);
  const empty: NowPlaying = { app, state: 'closed', track: null, position: 0, volume: 0, artwork: null };
  let output: string;
  try { output = await run(NOW_PLAYING[app]); } catch (error) { return { ...empty, state: error instanceof Denied ? 'denied' : 'closed' }; }
  const [state, volume, position, id, title, artist, album, duration, cover] = output.split(FIELD);
  if (state !== 'playing' && state !== 'paused') return { ...empty, state: state === 'stopped' ? 'stopped' : 'closed', volume: number(volume) };
  const track = { id: id || `${title}\u0000${artist}`, title: title ?? '', artist: artist ?? '', album: album ?? '', duration: number(duration) };
  const artwork = app === 'spotify' ? (cover?.startsWith('https://') ? cover : null) : number(cover) > 0 ? await musicArtwork(track.id) : null;
  return { app, state, track, position: number(position), volume: number(volume), artwork };
}

const COMMANDS = { toggle: 'playpause', next: 'next track', previous: 'previous track' } as const;

export async function controlMusic(app: MusicApp, action: MusicAction): Promise<NowPlaying> {
  if (process.platform === 'win32') return windowsNowPlaying(app, action);
  const name = NAMES[app];
  try {
    switch (action.kind) {
      case 'toggle': case 'next': case 'previous': await run([`tell application "${name}" to ${COMMANDS[action.kind]}`]); break;
      case 'volume': await run([`tell application "${name}" to set sound volume to (item 1 of argv as integer)`], [String(Math.round(action.volume))]); break;
      case 'playlist': if (app === 'music') await run(['tell application "Music" to play (first user playlist whose name is (item 1 of argv))'], [action.name]); break;
      case 'track': if (app === 'music') await run(['tell application "Music" to play (first track of library playlist 1 whose persistent ID is (item 1 of argv))'], [action.id]); break;
    }
  } catch (error) {
    if (error instanceof Denied) return { app, state: 'denied', track: null, position: 0, volume: 0, artwork: null };
  }
  return nowPlaying(app);
}

/** Music's playlists (made by the user, not the library itself), and the library's tracks that match `query` when there is one. */
export async function musicLibrary(query: string): Promise<{ playlists: string[]; tracks: MusicTrack[] }> {
  if (process.platform !== 'darwin') return { playlists: [], tracks: [] };
  try {
    const playlists = await run([
      'tell application "Music" to set l to name of (user playlists whose special kind is none)',
      "set AppleScript's text item delimiters to FS",
      'return l as string',
    ]);
    if (!query) return { playlists: playlists ? playlists.split(FIELD) : [], tracks: [] };
    const found = await run([
      'tell application "Music"',
      '  set l to search library playlist 1 for (item 1 of argv)',
      `  if (count of l) > ${MAX_TRACKS} then set l to items 1 thru ${MAX_TRACKS} of l`,
      '  set out to {}',
      '  repeat with t in l',
      '    set end of out to persistent ID of t & FS & name of t & FS & artist of t',
      '  end repeat',
      'end tell',
      "set AppleScript's text item delimiters to RS",
      'return out as string',
    ], [query]);
    const tracks = found ? found.split(RECORD).map((record) => { const [id, title, artist] = record.split(FIELD); return { id, title, artist }; }) : [];
    return { playlists: playlists ? playlists.split(FIELD) : [], tracks };
  } catch {
    return { playlists: [], tracks: [] };
  }
}
