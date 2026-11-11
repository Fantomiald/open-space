import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { RELEASES, releaseToShow } from './whats-new.ts';

const releases = ['1.31', '1.30', '1.29', '1.28', '1.27'];

describe('the "What\'s new" window', () => {
  it('tells the latest release up to the version running to someone who never saw it', () => {
    assert.equal(releaseToShow('1.30.1', null, releases), '1.30');
    assert.equal(releaseToShow('1.31.0', null, releases), '1.31');
  });

  it('tells only the latest release, even after several updates', () => {
    assert.equal(releaseToShow('1.31.0', '1.30.1', releases), '1.31');
    assert.equal(releaseToShow('1.31.2', '1.20.0', releases), '1.31');
  });

  it('stays closed on a patch of a release already seen, or on an older version', () => {
    assert.equal(releaseToShow('1.30.2', '1.30.0', releases), null);
    assert.equal(releaseToShow('1.29.0', '1.30.1', releases), null);
  });

  // the guard of a release (CLAUDE.md, « Sortir une version »): a new minor without its news would show nothing
  it('has the news of the version being released', () => {
    const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
    const [major, minor] = version.split('.').map(Number);
    const [newsMajor, newsMinor] = RELEASES[0].split('.').map(Number);
    assert.ok(major < newsMajor || (major === newsMajor && minor <= newsMinor),
      `Open Space ${version} has no news: write its release in src/state/whats-new.ts, i18n showcase.whatsNew and WhatsNewDialog.tsx`);
  });

  it('compares the numbers, not the text', () => {
    assert.equal(releaseToShow('1.10.0', '1.9.0', ['1.10', '1.9']), '1.10');
  });

  it('tells nothing for a version it cannot read, and the latest release for a seen version it cannot read', () => {
    assert.equal(releaseToShow('dev', null, releases), null);
    assert.equal(releaseToShow('1.30.0', 'x', releases), '1.30');
  });
});
