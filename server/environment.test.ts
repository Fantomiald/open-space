import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildClaudeEnvironment, parsePassthrough, withoutNpmEntries } from './environment.ts';

describe('buildClaudeEnvironment', () => {
  const source = {
    PATH: '/usr/bin', HOME: '/home/user', LANG: 'fr_FR.UTF-8', TERM: 'xterm',
    ANTHROPIC_API_KEY: 'sk-key', ANTHROPIC_AUTH_TOKEN: 'token', AWS_SECRET_ACCESS_KEY: 'aws', GITHUB_TOKEN: 'gh', SSH_AUTH_SOCK: '/tmp/agent',
    CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
  };

  it('keeps the basics, the ssh agent socket and the subscription token, drops everything else, turns the Artifact tools on', () => {
    const env = buildClaudeEnvironment(source);
    assert.deepEqual(env, { CLAUDE_CODE_ARTIFACT: '1', PATH: '/usr/bin', HOME: '/home/user', LANG: 'fr_FR.UTF-8', TERM: 'xterm', SSH_AUTH_SOCK: '/tmp/agent', CLAUDE_CODE_OAUTH_TOKEN: 'oauth' });
    assert.equal(buildClaudeEnvironment({ CLAUDE_CODE_ARTIFACT: '0' }).CLAUDE_CODE_ARTIFACT, '1', 'whatever the shell has');
  });

  it('lets explicit passthrough names through', () => {
    const env = buildClaudeEnvironment(source, ['GITHUB_TOKEN']);
    assert.equal(env.GITHUB_TOKEN, 'gh');
    assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  });

  it('removes the PATH entries npm adds when it runs the bridge', () => {
    const npmPath = [
      '/Users/me/code/office/node_modules/.bin', '/Users/me/code/node_modules/.bin', '/node_modules/.bin',
      '/Users/me/.nvm/versions/node/v22/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin',
      '/Users/me/.nvm/versions/node/v22/bin', '/opt/homebrew/bin', '/usr/bin',
    ].join(path.delimiter);
    assert.equal(buildClaudeEnvironment({ PATH: npmPath }).PATH, ['/Users/me/.nvm/versions/node/v22/bin', '/opt/homebrew/bin', '/usr/bin'].join(path.delimiter));
  });

  it('never lets API keys through, even when asked', () => {
    assert.deepEqual(parsePassthrough('SSH_AUTH_SOCK, ANTHROPIC_API_KEY ,bad name,GH_TOKEN'), ['SSH_AUTH_SOCK', 'GH_TOKEN']);
    assert.deepEqual(parsePassthrough(undefined), []);
  });

  it('preserves Windows drive letters and filters npm directories with either separator', () => {
    assert.equal(withoutNpmEntries('C:\\code\\node_modules\\.bin;C:\\Program Files\\nodejs;C:/code/node_modules/.bin;C:\\Windows', ';'), 'C:\\Program Files\\nodejs;C:\\Windows');
    if (process.platform !== 'win32') return;
    const env = buildClaudeEnvironment({ Path: 'C:\\Windows', SYSTEMROOT: 'C:\\Windows', USERPROFILE: 'C:\\Users\\Test', TEMP: 'C:\\Temp', SECRET: 'private', CLAUDE_CODE_GIT_BASH_PATH: 'C:\\Git\\bin\\bash.exe' });
    assert.equal(env.PATH, 'C:\\Windows');
    assert.equal(env.SystemRoot, 'C:\\Windows');
    assert.equal(env.USERPROFILE, 'C:\\Users\\Test');
    assert.equal(env.TEMP, 'C:\\Temp');
    assert.equal(env.CLAUDE_CODE_GIT_BASH_PATH, 'C:\\Git\\bin\\bash.exe');
    assert.equal(env.SECRET, undefined);
  });
});
