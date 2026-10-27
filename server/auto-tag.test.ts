import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTagArgs, cleanTag, readTagOutput } from './auto-tag.ts';

describe('automatic tag', () => {
  it('keeps two words at most, without quotes, punctuation or capitals', () => {
    assert.equal(cleanTag('Paywall'), 'paywall');
    assert.equal(cleanTag('"Session renommée."'), 'session renommée');
    assert.equal(cleanTag('dark mode for the blog'), 'dark mode');
    assert.equal(cleanTag('auto-tag'), 'auto-tag');
    assert.equal(cleanTag('-'), null);
    assert.equal(cleanTag('  '), null);
  });

  it('reads the answer of claude -p, and nothing from an error', () => {
    assert.equal(readTagOutput(JSON.stringify({ type: 'result', is_error: false, result: 'listagents' })), 'listagents');
    assert.equal(readTagOutput(JSON.stringify({ type: 'result', is_error: true, result: 'Not logged in' })), null);
    assert.equal(readTagOutput('not json'), null);
  });

  it('asks Haiku without the folder\'s settings, MCP servers nor commands, the message after "--"', () => {
    const args = buildTagArgs('--help me with the paywall');
    assert.deepEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2), ['--model', 'haiku']);
    for (const flag of ['--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands']) assert.ok(args.includes(flag));
    assert.ok(!args.includes('--tools'));
    assert.equal(args.at(-2), '--');
    assert.equal(args.at(-1), 'Request:\n--help me with the paywall');
  });
});
