import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { initialsOf, searchIcons } from './project-icons.ts';

describe('the dialog of a project’s icon', () => {
  it('finds an icon by the words of its name, those that start with them first', () => {
    const names = ['GitBranch', 'Github', 'FolderGit2', 'FolderCode', 'Code', 'CodeXml', 'Terminal'];
    assert.deepEqual(searchIcons(names, 'folder code'), ['FolderCode']);
    assert.deepEqual(searchIcons(names, 'git'), ['Github', 'GitBranch', 'FolderGit2']);
    assert.deepEqual(searchIcons(names, 'code', 2), ['Code', 'CodeXml']);
    assert.deepEqual(searchIcons(names, '  '), []);
  });

  it('starts the letters from the project’s words, else from its name', () => {
    assert.equal(initialsOf('open-space'), 'OS');
    assert.equal(initialsOf('UshyViewer'), 'UV');
    assert.equal(initialsOf('TZMasters'), 'TZ');
    assert.equal(initialsOf('droneblocker'), 'DR');
    assert.equal(initialsOf('.dotfiles'), 'DO');
  });
});
