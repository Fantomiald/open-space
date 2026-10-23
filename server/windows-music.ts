import { existsSync } from 'node:fs';
import path from 'node:path';
import type { MusicAction, MusicApp, NowPlaying } from '../shared/music.ts';
import { windowsScript } from './windows.ts';

// Windows 10 1809+: SMTC exposes playback and metadata, but no volume or library API.
// https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession
const MEDIA = `
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
  $propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\u00601' } | Select-Object -First 1
  function Await-Media($operation, $type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
    if (-not $task.Wait(5000)) { throw 'Windows media request timed out' }
    return $task.Result
  }
  $manager = Await-Media ($managerType::RequestAsync()) $managerType
`;

export async function windowsMusicApps(): Promise<MusicApp[]> {
  const found = new Set<MusicApp>();
  const folders = [process.env.APPDATA, process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter((folder): folder is string => !!folder);
  if (folders.some((folder) => [path.join(folder, 'Spotify', 'Spotify.exe'), path.join(folder, 'Programs', 'Spotify', 'Spotify.exe')].some(existsSync))) found.add('spotify');
  try {
    const packages = await windowsScript("Get-AppxPackage | Where-Object { $_.Name -match 'Spotify|AppleMusic' } | Select-Object -ExpandProperty Name", {}, 15_000);
    if (/Spotify/i.test(packages)) found.add('spotify');
    if (/AppleMusic/i.test(packages)) found.add('music');
  } catch { /* classic installs can still be found above */ }
  try {
    const sessions = await windowsMediaSessions();
    if (sessions.some((id) => /Spotify/i.test(id))) found.add('spotify');
    if (sessions.some((id) => /Apple.*Music/i.test(id))) found.add('music');
  } catch { /* older Windows or media access refused */ }
  return [...found];
}

/** Read-only: also finds portable players that have registered a media session. */
export async function windowsMediaSessions(): Promise<string[]> {
  const output = await windowsScript(`${MEDIA}ConvertTo-Json -Compress -InputObject @($manager.GetSessions() | ForEach-Object { $_.SourceAppUserModelId })`, {}, 12_000);
  return JSON.parse(output);
}

const noControls = { toggle: false, next: false, previous: false, volume: false, library: false };
export const emptyWindowsMusic = (app: MusicApp): NowPlaying => ({ app, state: 'closed', track: null, position: 0, volume: 0, artwork: null, controls: { ...noControls } });

/** The selected application's own SMTC session, never system-wide media key injection. */
export async function windowsNowPlaying(app: MusicApp, action?: MusicAction, run = windowsScript): Promise<NowPlaying> {
  const empty = emptyWindowsMusic(app);
  if (action && !['toggle', 'next', 'previous'].includes(action.kind)) return windowsNowPlaying(app, undefined, run);
  try {
    const output = await run(`${MEDIA}
      $pattern = if ($env:OPEN_SPACE_MEDIA_APP -eq 'spotify') { 'Spotify' } else { 'Apple.*Music' }
      $session = $manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match $pattern } | Select-Object -First 1
      if (-not $session) { return }
      $accepted = $true
      switch ($env:OPEN_SPACE_MEDIA_ACTION) {
        'toggle' { $accepted = Await-Media ($session.TryTogglePlayPauseAsync()) ([bool]) }
        'next' { $accepted = Await-Media ($session.TrySkipNextAsync()) ([bool]) }
        'previous' { $accepted = Await-Media ($session.TrySkipPreviousAsync()) ([bool]) }
      }
      if (-not $accepted) { throw 'The music app refused this playback command' }
      $media = Await-Media ($session.TryGetMediaPropertiesAsync()) $propertiesType
      $playback = $session.GetPlaybackInfo()
      $timeline = $session.GetTimelineProperties()
      $controls = $playback.Controls
      @{
        state = $playback.PlaybackStatus.ToString().ToLowerInvariant()
        title = $media.Title; artist = $media.Artist; album = $media.AlbumTitle
        duration = [Math]::Max(0, ($timeline.EndTime - $timeline.StartTime).TotalSeconds)
        position = [Math]::Max(0, ($timeline.Position - $timeline.StartTime).TotalSeconds)
        controls = @{ toggle = $controls.IsPlayPauseToggleEnabled; next = $controls.IsNextEnabled; previous = $controls.IsPreviousEnabled; volume = $false; library = $false }
      } | ConvertTo-Json -Compress
    `, { OPEN_SPACE_MEDIA_APP: app, OPEN_SPACE_MEDIA_ACTION: action?.kind ?? '' }, 12_000);
    if (!output) return empty;
    const value = JSON.parse(output);
    const title = typeof value.title === 'string' ? value.title : '';
    const artist = typeof value.artist === 'string' ? value.artist : '';
    return {
      ...empty, state: value.state === 'playing' || value.state === 'paused' ? value.state : 'stopped',
      position: Number(value.position) || 0,
      track: title || artist ? { id: `${title}\u0000${artist}`, title, artist, album: value.album ?? '', duration: Number(value.duration) || 0 } : null,
      controls: { ...noControls, toggle: value.controls?.toggle === true, next: value.controls?.next === true, previous: value.controls?.previous === true },
    };
  } catch { return { ...empty, state: 'denied' }; }
}
