import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAsideArgs, readAsideLine } from './aside.ts';
import { st } from './i18n/index.ts';

describe('side questions (/btw)', () => {
  const request = { sessionId: '11111111-2222-3333-4444-555555555555', resume: true, model: 'opus', question: '-v ça marche ?' };

  it('forks the conversation without saving the fork, asks for no permission, and puts the question after "--"', () => {
    const args = buildAsideArgs(request);
    assert.deepEqual(args.slice(0, 4), ['-p', '--resume', request.sessionId, '--fork-session']);
    assert.ok(args.includes('--no-session-persistence'));
    assert.ok(!args.includes('--permission-prompt-tool'), 'what needs a permission is refused');
    assert.ok(!args.includes('--tools'));
    assert.deepEqual(args.slice(-4), ['--append-system-prompt', st.prompt.aside, '--', '-v ça marche ?']);
    assert.ok(!buildAsideArgs({ ...request, resume: false }).includes('--resume'), 'no conversation yet: a fresh one');
    assert.equal(buildAsideArgs({ ...request, untrusted: true }).at(buildAsideArgs({ ...request, untrusted: true }).indexOf('--setting-sources') + 1), 'user');
  });

  it('reads the answer as it is written, then the result', () => {
    const delta = (text: string) => ({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
    assert.deepEqual(readAsideLine(delta('Le dossier'), ''), { text: 'Le dossier' });
    assert.deepEqual(readAsideLine(delta(' a 4 entrées.'), 'Le dossier'), { text: 'Le dossier a 4 entrées.' });
    assert.deepEqual(readAsideLine({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'thinking' } } }, 'Le'), {}, 'thinking adds nothing');
    assert.deepEqual(readAsideLine({ type: 'result', subtype: 'success', is_error: false, result: 'Le dossier a 4 entrées.' }, ''), { result: { ok: true, text: 'Le dossier a 4 entrées.' } });
    assert.deepEqual(readAsideLine({ type: 'assistant' }, 'x'), {});
  });
});
