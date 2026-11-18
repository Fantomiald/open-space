import assert from 'node:assert/strict';
import { test } from 'node:test';
import { darkEnoughForWhite, sessionTagHues, tagColor, tagHue } from './tag-colors.ts';

test('a tag keeps its colour, whatever its case or spaces', () => {
  assert.equal(tagHue('Pro'), tagHue('pro'));
  assert.equal(tagHue(' Pro '), tagHue('Pro'));
  assert.equal(tagColor('Pro'), tagColor('PRO'));
});

test('the tags of one session never share a colour: one falling on a colour taken takes the next free one', () => {
  assert.equal(tagHue('PDF'), tagHue('Facturation'), 'two names that fall on the same colour');
  const [pro, pdf, billing] = sessionTagHues(['Pro', 'PDF', 'Facturation']);
  assert.deepEqual([pro, pdf], [tagHue('Pro'), tagHue('PDF')], 'the first ones keep their own');
  assert.notEqual(billing, pdf);
  assert.equal(new Set(sessionTagHues(['Pro', 'PDF', 'Facturation', 'urgent', 'paywall'])).size, 5);
  assert.deepEqual(sessionTagHues(['Facturation']), [tagHue('Facturation')], 'alone, a tag has its own colour');
});

test('tags spread over the colours', () => {
  const hues = new Set(['pro', 'api', 'blog', 'docs', 'game', 'hero', 'levels', 'checkout', 'dark mode', 'backups', 'migration', 'paywall'].map(tagHue));
  assert.ok(hues.size >= 6);
});

test('a colour under white text is darkened just enough to read, its hue kept', () => {
  const lightness = (hex: string) => { const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)); return (Math.max(r, g, b) + Math.min(r, g, b)) / 2; };
  for (const name of ['Emma', 'Sofia', 'Léa', 'Tom', 'Inès']) {
    const dark = darkEnoughForWhite(tagColor(name));
    assert.ok(lightness(dark) < lightness(tagColor(name)), name);
  }
  // already dark enough: left as it is
  assert.equal(darkEnoughForWhite('#1b1b22'), '#1b1b22');
});
