import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { hiddenRules } from './claude-process.ts';
import { parseClientMessage } from './messages.ts';
import { TriggerKeys } from './trigger-keys.ts';

let base: string;
before(() => { base = mkdtempSync(path.join(os.tmpdir(), 'office-trigger-keys-')); });
after(() => rmSync(base, { recursive: true, force: true }));

describe('the keys a trigger hands its runs', () => {
  it('keeps them in a file only the user reads, and gives back their names for the page', () => {
    const file = path.join(base, 'keys.json');
    const keys = new TriggerKeys(file);
    assert.deepEqual(keys.set('t1', [{ name: 'TOKEN', value: 'one' }, { name: 'bad name', value: 'x' }, { name: 'EMPTY', value: '' }, { name: 'TOKEN', value: 'two' }]), ['TOKEN']);
    keys.set('t1', [{ name: 'API_KEY', value: 'abc' }]);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(keys.all(), { t1: ['API_KEY', 'TOKEN'] });
    const again = new TriggerKeys(file);
    assert.deepEqual(again.entries('t1'), [{ name: 'TOKEN', value: 'two' }, { name: 'API_KEY', value: 'abc' }]);
    again.drop('t1', 'TOKEN');
    assert.deepEqual(again.names('t1'), ['API_KEY']);
    again.drop('t1');
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {});
  });

  it('starts empty from a missing or broken file', () => {
    assert.deepEqual(new TriggerKeys(path.join(base, 'none.json')).all(), {});
  });

  it('keeps the sessions’ file tools off Open Space’s key files', () => {
    assert.deepEqual(hiddenRules(['/Users/me/.open-space/trigger-keys.json']), ['Read(//Users/me/.open-space/trigger-keys.json)', 'Edit(//Users/me/.open-space/trigger-keys.json)']);
  });

  it('takes valid keys from the page only', () => {
    assert.deepEqual(parseClientMessage({ t: 'triggerKeys', id: 'abc12345', entries: [{ name: 'TOKEN', value: 'v' }] }), { t: 'triggerKeys', id: 'abc12345', entries: [{ name: 'TOKEN', value: 'v' }] });
    assert.equal(parseClientMessage({ t: 'triggerKeys', id: 'abc12345', entries: [{ name: 'bad name', value: 'v' }] }), null);
    assert.equal(parseClientMessage({ t: 'triggerKeys', id: 'abc12345', entries: [] }), null);
    assert.deepEqual(parseClientMessage({ t: 'forgetTriggerKey', id: 'abc12345', name: 'TOKEN' }), { t: 'forgetTriggerKey', id: 'abc12345', name: 'TOKEN' });
  });
});
