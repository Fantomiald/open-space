import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SessionInfo } from '../shared/protocol.ts';
import { notificationText } from './notifier.ts';

const session = (extra: Partial<SessionInfo>): SessionInfo => ({
  id: 's', name: 'Lina', cwd: '/w', model: '', activeModel: '', permissionMode: 'auto', state: 'wait', stateSince: 0, createdAt: 0, turns: 1,
  permissions: [], subagents: [], command: '', lastMessage: '', resumable: true, lastSeq: 1, ...extra,
});

describe('notifications', () => {
  it('says who and what, then what they said or ask, on one short line', () => {
    assert.deepEqual(notificationText(session({ lastMessage: 'Fait.\n\nLes tests passent.' }), 'finished'), { title: 'Lina a terminé', body: 'Fait. Les tests passent.' });
    const asks = session({ state: 'perm', permissions: [{ requestId: 'r', who: 'chef', tool: 'Bash', detail: 'npm test', canAlways: true }] });
    assert.equal(notificationText(asks, 'permission').body, 'npm test');
    const question = session({ state: 'perm', permissions: [{ requestId: 'r', who: 'chef', tool: 'AskUserQuestion', detail: '', canAlways: false, questions: [{ question: 'Lequel ?', header: 'Choix', multiSelect: false, options: [] }] }] });
    assert.deepEqual(notificationText(question, 'question'), { title: 'Lina te pose une question', body: 'Lequel ?' });
    assert.equal(notificationText(session({ lastMessage: 'x'.repeat(500) }), 'finished').body.length, 180);
  });
});
