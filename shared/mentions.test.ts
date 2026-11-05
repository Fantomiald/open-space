import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findMentions, isNamedBy, mentionAt, mentionNames } from './mentions.ts';

describe('mentions', () => {
  const names = ['PL', 'Ana', 'Ana Lou', 'Zoé'];

  it('finds the sessions named by "@", the longest name first, in any case', () => {
    assert.deepEqual(findMentions('va demander à @pl comment elle a fait', names), [{ start: 14, end: 17, name: 'PL' }]);
    assert.deepEqual(findMentions('@Ana Lou et @Ana, puis @zoé.', names).map((mention) => mention.name), ['Ana Lou', 'Ana', 'Zoé']);
  });

  it('skips an email, a name that goes on, and a name no session has', () => {
    assert.deepEqual(findMentions('écris à pl@example.com, @Anabelle ou @Bob', names), []);
  });

  it('reads the "@" being typed under the caret', () => {
    assert.deepEqual(mentionAt('va voir @Li', 11), { start: 8, typed: 'Li' });
    assert.deepEqual(mentionAt('@', 1), { start: 0, typed: '' });
    assert.equal(mentionAt('pl@exa', 6), null);
    assert.equal(mentionAt('@Li puis', 8), null);
  });

  it('names a session by any of its tags too', () => {
    const iris = { name: 'Iris', tags: ['dark mode', 'Pro'] };
    const names = mentionNames([iris, { name: 'PL' }]);
    assert.deepEqual(names, ['Iris', 'dark mode', 'Pro', 'PL']);
    assert.deepEqual(findMentions('demande à @dark mode, @pro et @pl', names).map((mention) => mention.name), ['dark mode', 'Pro', 'PL']);
    assert.ok(isNamedBy('Dark Mode', iris));
    assert.ok(isNamedBy('pro', iris));
    assert.ok(isNamedBy('iris', iris));
    assert.ok(!isNamedBy('PL', iris));
  });
});
