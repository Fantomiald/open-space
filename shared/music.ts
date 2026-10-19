// The music apps the office radio can drive on the user's computer (server/music.ts), besides its web radios.

export type MusicApp = 'music' | 'spotify';
export const MUSIC_APPS: readonly MusicApp[] = ['music', 'spotify'];

/**
 * What an app plays. `closed`: the app is not open (it is never launched just to be asked); `denied`: macOS refused
 * Open Space control of it (System Settings, Privacy, Automation).
 */
export type MusicState = 'closed' | 'denied' | 'stopped' | 'paused' | 'playing';

export interface MusicTrack { id: string; title: string; artist: string }

export interface NowPlaying {
  app: MusicApp;
  state: MusicState;
  track: (MusicTrack & { album: string; duration: number }) | null;
  /** seconds into the track */
  position: number;
  /** 0 to 100, the app's own volume */
  volume: number;
  /** a data: image (Music) or an https address (Spotify's own covers) */
  artwork: string | null;
}

export type MusicAction =
  | { kind: 'toggle' | 'next' | 'previous' }
  | { kind: 'volume'; volume: number }
  /** Music only: one of the user's playlists, by name, or a track of the library, by id */
  | { kind: 'playlist'; name: string }
  | { kind: 'track'; id: string };

/** Spotify's covers, the only images from outside the page shows (see PAGE_CSP in server/http.ts). */
export const SPOTIFY_ARTWORK = 'https://i.scdn.co';
