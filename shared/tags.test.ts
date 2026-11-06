import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_TAG, MAX_TAGS, parseTags, roomTags, storedTags, withTags, withoutTag } from './tags.ts';

describe('the tags of a session', () => {
  it('reads several tags separated by commas, trimmed, without doubles whatever their case', () => {
    assert.deepEqual(parseTags(' Pro , PDF,,pro, Facturation '), ['Pro', 'PDF', 'Facturation']);
    assert.deepEqual(parseTags('   '), []);
  });

  it('keeps tags short and few', () => {
    assert.equal(parseTags('x'.repeat(40))[0].length, MAX_TAG);
    assert.deepEqual(parseTags('a, b, c, d, e, f, g'), ['a', 'b', 'c', 'd', 'e'].slice(0, MAX_TAGS));
  });

  it('adds after the ones already there, and takes one away whatever its case', () => {
    assert.deepEqual(withTags(['Pro'], 'PDF, pro'), ['Pro', 'PDF']);
    assert.deepEqual(withTags(['a', 'b', 'c', 'd', 'e'], 'f'), ['a', 'b', 'c', 'd', 'e'], 'full: nothing more goes in');
    assert.deepEqual(withoutTag(['Pro', 'PDF'], 'pdf'), ['Pro']);
  });

  it('reads the tags stored by this version, or the single tag of an older one', () => {
    assert.deepEqual(storedTags({ tags: ['Pro', 'PDF', 3] }), ['Pro', 'PDF']);
    assert.deepEqual(storedTags({ tag: 'front' }), ['front'], 'a session saved with one tag keeps it');
    assert.deepEqual(storedTags({ tags: ['Pro'], tag: 'old' }), ['Pro']);
    assert.deepEqual(storedTags({}), []);
  });

  it('shows two tags on a name tag of the room, then how many more', () => {
    assert.deepEqual(roomTags(['Pro', 'PDF', 'Facturation', 'Urgent']), { shown: ['Pro', 'PDF'], more: 2 });
    assert.deepEqual(roomTags(['Pro']), { shown: ['Pro'], more: 0 });
  });
});
