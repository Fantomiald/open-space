import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cookiesToClear, isKept, SharedTabs } from './shared-browser.ts';

describe('the tabs of the shared browser', () => {
  it('gives a tab created through an owner to that owner', () => {
    const tabs = new SharedTabs();
    const url = tabs.expect('s1');
    assert.match(url, /^about:blank#os-[0-9a-f]{16}$/);
    assert.equal(tabs.claim({ targetId: 't1', type: 'page', url }), 's1');
    assert.equal(tabs.ownerOf('t1'), 's1');
  });

  it('gives a popup to the owner of its opener', () => {
    const tabs = new SharedTabs();
    tabs.claim({ targetId: 't1', type: 'page', url: tabs.expect('s1.2') });
    assert.equal(tabs.claim({ targetId: 't2', type: 'page', url: '', openerId: 't1' }), 's1.2');
  });

  it('owns nothing else', () => {
    const tabs = new SharedTabs();
    tabs.expect('s1');
    assert.equal(tabs.claim({ targetId: 't3', type: 'page', url: 'about:blank' }), undefined);
    assert.equal(tabs.claim({ targetId: 'w', type: 'service_worker', url: 'https://x' }), undefined);
    assert.equal(tabs.ownerOf('t3'), undefined);
  });

  it('lists a session’s tabs, testers included', () => {
    const tabs = new SharedTabs();
    tabs.claim({ targetId: 'a', type: 'page', url: tabs.expect('s1') });
    tabs.claim({ targetId: 'b', type: 'page', url: tabs.expect('s1.2') });
    tabs.claim({ targetId: 'c', type: 'page', url: tabs.expect('s10') });
    assert.deepEqual(tabs.tabsOfSession('s1').sort(), ['a', 'b']);
  });

  it('forgets an owner’s tabs and the sites they visited, Google’s kept', () => {
    const tabs = new SharedTabs();
    tabs.claim({ targetId: 't1', type: 'page', url: tabs.expect('s1') });
    tabs.visit('t1', 'https://staging.kiin.ai/login');
    tabs.visit('t1', 'https://tagmanager.google.com/#/home');
    tabs.visit('t1', 'chrome://settings');
    assert.deepEqual(tabs.release('s1'), { tabs: ['t1'], hosts: ['staging.kiin.ai'] });
    assert.equal(tabs.ownerOf('t1'), undefined);
    assert.deepEqual(tabs.release('s1'), { tabs: [], hosts: [] });
  });
});

describe('the sites kept', () => {
  it('keeps Google’s sites and nothing that only looks like them', () => {
    assert.equal(isKept('google.com'), true);
    assert.equal(isKept('accounts.google.com'), true);
    assert.equal(isKept('.google.com'), true);
    assert.equal(isKept('google.com.evil.io'), false);
    assert.equal(isKept('notgoogle.com'), false);
  });

  it('clears the cookies of the sites visited, or every one but the kept at launch', () => {
    const cookie = (domain: string) => ({ name: 'n', domain, path: '/' });
    const cookies = [cookie('.kiin.ai'), cookie('staging.kiin.ai'), cookie('.google.com'), cookie('other.io')];
    assert.deepEqual(cookiesToClear(cookies, ['staging.kiin.ai']), [cookie('.kiin.ai'), cookie('staging.kiin.ai')]);
    assert.deepEqual(cookiesToClear(cookies), [cookie('.kiin.ai'), cookie('staging.kiin.ai'), cookie('other.io')]);
  });
});
