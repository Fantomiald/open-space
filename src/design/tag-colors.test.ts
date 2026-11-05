import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tagColor, tagHue } from './tag-colors.ts';

test('a tag keeps its colour, whatever its case or spaces', () => {
  assert.equal(tagHue('Pro'), tagHue('pro'));
  assert.equal(tagHue(' Pro '), tagHue('Pro'));
  assert.equal(tagColor('Pro'), tagColor('PRO'));
});

test('tags spread over the colours', () => {
  const hues = new Set(['pro', 'api', 'blog', 'docs', 'game', 'hero', 'levels', 'checkout', 'dark mode', 'backups', 'migration', 'paywall'].map(tagHue));
  assert.ok(hues.size >= 6);
});
