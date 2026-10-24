import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closeWindowsMusic, windowsMediaSessions, windowsNowPlaying } from './windows-music.ts';

test('Windows media exposes only the controls that the selected application supports', async () => {
  let selected: Record<string, string> | undefined;
  const run = async (_script: string, values?: Record<string, string>) => {
    selected = values;
    return JSON.stringify({ state: 'playing', title: 'Été', artist: 'Artist', album: 'Album', duration: 180, position: 42, controls: { toggle: true, next: false, previous: true, volume: true, library: true } });
  };
  const now = await windowsNowPlaying('spotify', { kind: 'next' }, run);
  assert.deepEqual(selected, { OPEN_SPACE_MEDIA_APP: 'spotify', OPEN_SPACE_MEDIA_ACTION: 'next' });
  assert.equal(now.state, 'playing');
  assert.equal(now.track?.title, 'Été');
  assert.equal(now.position, 42);
  assert.deepEqual(now.controls, { toggle: true, next: false, previous: true, volume: false, library: false });
  await windowsNowPlaying('music', { kind: 'volume', volume: 100 }, run);
  assert.deepEqual(selected, { OPEN_SPACE_MEDIA_APP: 'music', OPEN_SPACE_MEDIA_ACTION: '' }, 'unsupported actions never affect system volume or other players');
  assert.equal((await windowsNowPlaying('spotify', undefined, async () => '')).state, 'closed');
  assert.equal((await windowsNowPlaying('spotify', undefined, async () => { throw new Error('denied'); })).state, 'denied');
});

test('native Windows bridge shares reads and represents missing sessions as closed', { skip: process.platform !== 'win32' || process.env.OPEN_SPACE_TEST_WINDOWS_MEDIA !== '1' }, async () => {
  try {
    const sessions = await windowsMediaSessions();
    for (const app of ['spotify', 'music'] as const) {
      const first = windowsNowPlaying(app);
      assert.equal(windowsNowPlaying(app), first, 'concurrent polls reuse the pending read');
      const result = await first;
      assert.notEqual(result.state, 'denied');
      if (!sessions.some((id) => (app === 'spotify' ? /Spotify/i : /Apple.*Music/i).test(id))) {
        assert.equal(result.state, 'closed');
        assert.equal(result.track, null);
      }
    }
  } finally { closeWindowsMusic(); }
});
