import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionInfo } from '../../shared/protocol.ts';
import { pendingEntries } from './pending.ts';

const session = (id: string, extra: Partial<SessionInfo> = {}) => ({ id, name: id, cwd: `/work/${id}`, state: 'wait', turns: 1, permissions: [], subagents: [], createdAt: 0, ...extra }) as unknown as SessionInfo;

const view = (sessions: SessionInfo[]) => pendingEntries(sessions).map((entry) => [entry.session.id, entry.items.map((item) => item.text), entry.git]);

test('lists each session with something pending, the one waiting longest first, what it said oldest first', () => {
  assert.deepEqual(view([
    session('margot', { pending: [{ id: 'a', text: 'PR à ouvrir', since: 300 }], git: { dirty: 3, unpushed: 2, noUpstream: false, branch: 'main' } }),
    session('theo', { pending: [{ id: 'c', text: 'Migration à lancer', since: 200 }, { id: 'b', text: 'Clé Stripe à fournir', since: 100 }] }),
    session('lea', { git: { dirty: 0, unpushed: 1, noUpstream: true, branch: 'feature' } }),
  ]), [
    ['theo', ['Clé Stripe à fournir', 'Migration à lancer'], null],
    ['margot', ['PR à ouvrir'], 'Commiter 3 fichiers · Pousser 2 commits'],
    ['lea', [], 'Pousser la branche'],
  ]);
});

test('says what git says of a folder once, with the first session open in it', () => {
  const git = { dirty: 3, unpushed: 0, noUpstream: false, branch: 'main' };
  assert.deepEqual(view([
    session('margot', { cwd: '/work/shop', git, pending: [{ id: 'a', text: 'PR à ouvrir', since: 100 }] }),
    session('theo', { cwd: '/work/shop', git }),
    session('lea', { cwd: '/work/shop', git }),
  ]), [['margot', ['PR à ouvrir'], 'Commiter 3 fichiers']]);
});

test('leaves out closed sessions and those with nothing pending, and says one file in the singular', () => {
  assert.deepEqual(view([
    session('gone', { state: 'closed', pending: [{ id: 'a', text: 'Pas poussé', since: 1 }] }),
    session('clean'),
    session('tidy', { git: { dirty: 0, unpushed: 0, noUpstream: false, branch: 'main' } }),
    session('one', { git: { dirty: 1, unpushed: 0, noUpstream: false, branch: 'main' } }),
  ]), [['one', [], 'Commiter 1 fichier']]);
});
