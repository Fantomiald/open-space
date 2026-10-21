import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { costOf, modelName } from './usage.ts';

const MILLION = { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };

describe('usage prices', () => {
  it('prices each kind of token at the model\'s list price', () => {
    assert.equal(costOf('claude-opus-5-5', { ...MILLION, input: 1_000_000 }), 4);
    assert.equal(costOf('claude-opus-5-5', { ...MILLION, cacheWrite1h: 1_000_000 }), 8);
    assert.equal(costOf('claude-opus-5-5', { ...MILLION, cacheWrite5m: 1_000_000 }), 5);
    assert.equal(costOf('claude-opus-5-5', { ...MILLION, input: 1_000_000 }, true), 8, 'fast mode doubles');
    assert.equal(costOf('claude-opus-5', { ...MILLION, input: 1_000_000 }), 5, 'longer prefixes win');
    assert.equal(costOf('claude-unknown-9', { ...MILLION, input: 1_000_000 }), 0);
  });

  it('names models the way people say them', () => {
    assert.equal(modelName('claude-opus-5-5'), 'Opus 5.5');
    assert.equal(modelName('claude-haiku-4-5-20251001'), 'Haiku 4.5');
    assert.equal(modelName('claude-3-5-sonnet-20241022'), 'Sonnet 3.5');
    assert.equal(modelName('gpt-x'), 'gpt-x');
  });
});
