import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isInside, personSlug, workSlug, worktreeNames } from './worktrees.ts';

test('the work slug keeps the first three useful words, in ASCII', () => {
  assert.equal(workSlug('Ajoute Apple Pay au checkout, avec le bouton natif sur iOS'), 'apple-pay-checkout');
  assert.equal(workSlug('Corrige la création des reçus'), 'creation-recus');
  assert.equal(workSlug('Please fix the dark mode toggle'), 'dark-mode-toggle');
  assert.equal(workSlug('   '), '');
  assert.equal(workSlug('le la les'), '');
  assert.equal(workSlug('Ajoute dans src/checkout.js une fonction applyDiscount(total, percent)'), 'checkout-applydiscount');
  assert.equal(workSlug('Corrige le bouton sur iOS.'), 'bouton-ios');
});

test('the work slug stays within 24 characters, cut between words', () => {
  assert.equal(workSlug('internationalisation authentification paiement'), 'internationalisation');
  assert.equal(workSlug('anticonstitutionnellement et plus'), 'anticonstitutionnellemen');
  assert.ok(workSlug('apple pay checkout encore plus de mots').length <= 24);
});

test('a first name goes into the branch without accents', () => {
  assert.equal(personSlug('Zoé'), 'zoe');
  assert.equal(personSlug('Jean Marc'), 'jean-marc');
  assert.equal(personSlug('***'), 'agent');
});

test('the branch and the folder share one stem, with a suffix when taken', () => {
  assert.deepEqual(worktreeNames('Lina', 'apple pay'), { branch: 'os/lina-apple-pay', folder: 'os-lina-apple-pay' });
  assert.deepEqual(worktreeNames('Lina', ''), { branch: 'os/lina', folder: 'os-lina' });
  assert.deepEqual(worktreeNames('Lina', 'apple pay', 2), { branch: 'os/lina-apple-pay-2', folder: 'os-lina-apple-pay-2' });
});

test('a folder is inside a root, not beside it', () => {
  assert.ok(isInside('/a/garden', '/a/garden'));
  assert.ok(isInside('/a/garden/mobile', '/a/garden'));
  assert.ok(!isInside('/a/garden-web', '/a/garden'));
});
