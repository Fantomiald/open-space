import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { DEFAULT_LOOK } from '../src/design/people-palette.ts';
import { parseLook } from '../shared/look.ts';
import { Crew } from './crew.ts';

const folder = mkdtempSync(path.join(os.tmpdir(), 'office-crew-'));
after(() => rmSync(folder, { recursive: true, force: true }));

describe('crew', () => {
  it('names a new session after someone of the crew without one, at random, and nobody once all are taken', async () => {
    const file = path.join(folder, 'crew.json');
    writeFileSync(file, JSON.stringify({ members: [{ name: 'Max', look: null, self: true }, { name: 'Lina', look: null }, { name: 'Tom', look: null }, { name: 'Zoé', look: null }] }));
    const crew = new Crew(file);
    await crew.load();
    assert.equal(crew.randomFreeName(new Set(), () => 0), 'Lina');
    assert.equal(crew.randomFreeName(new Set(), () => 0.99), 'Zoé', 'not always the first one');
    assert.equal(crew.randomFreeName(new Set(['Lina']), () => 0), 'Tom');
    assert.equal(crew.randomFreeName(new Set(['Lina', 'Tom', 'Zoé'])), undefined, 'the user is never picked');
  });

  it('starts empty, gets the avatar of the user at the first start, and keeps the birthdays', async () => {
    const file = path.join(folder, 'new-crew.json');
    const crew = new Crew(file);
    await crew.load();
    assert.deepEqual(crew.list(), []);
    assert.equal(crew.selfName, null);
    const look = parseLook({ ...DEFAULT_LOOK })!;
    await crew.setSelf('Max', look, '03-12');
    await crew.save(null, 'Lina', look, '10-20');
    await crew.save('Lina', 'Lina', look);
    const reloaded = new Crew(file);
    await reloaded.load();
    assert.equal(reloaded.selfName, 'Max');
    assert.deepEqual(reloaded.list().map(({ name, self, birthday }) => ({ name, self, birthday })), [{ name: 'Max', self: true, birthday: '03-12' }, { name: 'Lina', self: undefined, birthday: undefined }], 'a birthday left empty is removed');
    await assert.rejects(reloaded.setSelf('Lina', look), /existe déjà/);
  });
});
