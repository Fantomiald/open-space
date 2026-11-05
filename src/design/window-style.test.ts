import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shownWindowStyle } from './window-style.ts';

test('a window style is kept whatever the office theme, "match" follows the theme', () => {
  assert.equal(shownWindowStyle('terminal', 'tokyo'), 'terminal');
  assert.equal(shownWindowStyle('match', 'tokyo'), 'neon');
  assert.equal(shownWindowStyle('match', 'cellar'), 'hacker');
  assert.equal(shownWindowStyle('match', 'beach'), 'beach');
  assert.equal(shownWindowStyle('match', 'office'), 'classic');
});
