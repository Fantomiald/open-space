import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import type { SessionInfo } from '../shared/protocol.ts';
import { notificationText } from './notifier.ts';

const session = (extra: Partial<SessionInfo>): SessionInfo => ({
  id: 's', name: 'Lina', cwd: '/w', model: '', activeModel: '', permissionMode: 'auto', state: 'wait', stateSince: 0, createdAt: 0, turns: 1,
  permissions: [], subagents: [], command: '', lastMessage: '', resumable: true, lastSeq: 1, ...extra,
});

describe('notifications', () => {
  it('forwards notifications to Electron on Windows as well as macOS', () => {
    const script = `process.parentPort = { postMessage: (message) => console.log(JSON.stringify(message)) }; const { notify } = await import(${JSON.stringify(new URL('./notifier.ts', import.meta.url).href)}); notify(${JSON.stringify(session({ lastMessage: 'Terminé' }))}, 'finished', () => {});`;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', windowsHide: true });
    assert.deepEqual(JSON.parse(output), { t: 'notify', title: 'Lina a terminé', body: 'Terminé', sessionId: 's' });
  });
  it('says who and what, then what they said or ask, on one short line', () => {
    assert.deepEqual(notificationText(session({ lastMessage: 'Fait.\n\nLes tests passent.' }), 'finished'), { title: 'Lina a terminé', body: 'Fait. Les tests passent.' });
    const asks = session({ state: 'perm', permissions: [{ requestId: 'r', who: 'chef', tool: 'Bash', detail: 'npm test', canAlways: true }] });
    assert.equal(notificationText(asks, 'permission').body, 'npm test');
    const question = session({ state: 'perm', permissions: [{ requestId: 'r', who: 'chef', tool: 'AskUserQuestion', detail: '', canAlways: false, questions: [{ question: 'Lequel ?', header: 'Choix', multiSelect: false, options: [] }] }] });
    assert.deepEqual(notificationText(question, 'question'), { title: 'Lina te pose une question', body: 'Lequel ?' });
    assert.equal(notificationText(session({ lastMessage: 'x'.repeat(500) }), 'finished').body.length, 180);
  });
});
