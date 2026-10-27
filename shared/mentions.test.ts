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

  it('names a session by its tag too', () => {
    const names = mentionNames([{ name: 'Iris', tag: 'dark mode' }, { name: 'PL' }]);
    assert.deepEqual(names, ['Iris', 'dark mode', 'PL']);
    assert.deepEqual(findMentions('demande à @dark mode et @pl', names).map((mention) => mention.name), ['dark mode', 'PL']);
    assert.ok(isNamedBy('Dark Mode', { name: 'Iris', tag: 'dark mode' }));
    assert.ok(isNamedBy('iris', { name: 'Iris', tag: 'dark mode' }));
    assert.ok(!isNamedBy('PL', { name: 'Iris', tag: 'dark mode' }));
  });
});
