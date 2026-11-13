import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionInfo } from '../../shared/protocol.ts';
import { pendingRows } from './pending.ts';

const session = (id: string, extra: Partial<SessionInfo> = {}) => ({ id, name: id, cwd: `/work/${id}`, state: 'wait', turns: 1, permissions: [], subagents: [], createdAt: 0, ...extra }) as unknown as SessionInfo;

test('lists what each session leaves pending, the oldest first, what git says after what it said', () => {
  const rows = pendingRows([
    session('margot', { pending: [{ id: 'a', text: 'PR à ouvrir', since: 300 }], git: { dirty: 3, unpushed: 2, noUpstream: false, branch: 'main' } }),
    session('theo', { pending: [{ id: 'b', text: 'Clé Stripe à fournir', since: 100 }, { id: 'c', text: 'Migration à lancer', since: 200 }] }),
    session('lea', { git: { dirty: 0, unpushed: 1, noUpstream: true, branch: 'feature' } }),
  ]);
  assert.deepEqual(rows.map((row) => [row.session.id, row.text, row.since, row.declared]), [
    ['theo', 'Clé Stripe à fournir', 100, true],
    ['theo', 'Migration à lancer', 200, true],
    ['margot', 'PR à ouvrir', 300, true],
    ['margot', '3 fichiers pas commités', null, false],
    ['margot', '2 commits pas poussés', null, false],
    ['lea', 'branche jamais poussée', null, false],
  ]);
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
});

test('says what git says of a folder once, under the first session open in it', () => {
  const git = { dirty: 3, unpushed: 0, noUpstream: false, branch: 'main' };
  const rows = pendingRows([
    session('margot', { cwd: '/work/shop', git, pending: [{ id: 'a', text: 'PR à ouvrir', since: 100 }] }),
    session('theo', { cwd: '/work/shop', git }),
    session('lea', { cwd: '/work/shop', git }),
  ]);
  assert.deepEqual(rows.map((row) => [row.session.id, row.text]), [['margot', 'PR à ouvrir'], ['margot', '3 fichiers pas commités']]);
});

test('leaves out closed sessions and those with nothing pending, and says one file in the singular', () => {
  const rows = pendingRows([
    session('gone', { state: 'closed', pending: [{ id: 'a', text: 'Pas poussé', since: 1 }] }),
    session('clean'),
    session('one', { git: { dirty: 1, unpushed: 0, noUpstream: false, branch: 'main' } }),
  ]);
  assert.deepEqual(rows.map((row) => row.text), ['1 fichier pas commité']);
});
