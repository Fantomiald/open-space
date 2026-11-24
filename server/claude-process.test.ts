import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { PM_TOOL_NAMES } from '../shared/pm.ts';
import { NO_RESTRICT } from '../shared/triggers.ts';
import { buildClaudeArgs, claudeCommand, identityPrompt, parseAccount, parseCatalog, placeNote, renameNote, restrictionSettings } from './claude-process.ts';
import { setServerLanguage, st } from './i18n/index.ts';

it('passes npm Claude arguments directly to Node without shell interpretation on Windows', () => {
  const args = ['--settings', JSON.stringify({ text: 'spaces & %PATH% "quotes"' })];
  const file = path.resolve('test prefix', 'claude.cmd');
  const [command, passed] = claudeCommand(file, args);
  if (process.platform !== 'win32') { assert.deepEqual([command, passed], [file, args]); return; }
  assert.equal(command, 'node.exe');
  assert.deepEqual(passed, [path.join(path.dirname(file), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'), ...args]);
});

describe('buildClaudeArgs', () => {
  const base = { sessionId: '11111111-2222-3333-4444-555555555555', resume: false, model: '', permissionMode: 'auto' as const, name: 'Iris' };

  it('starts a new session with --session-id, asking for permissions through stdio', () => {
    const args = buildClaudeArgs(base);
    assert.deepEqual(args, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--forward-subagent-text', '--permission-prompt-tool', 'stdio', '--permission-mode', 'auto', '--session-id', base.sessionId, '--name', 'Iris', '--append-system-prompt', identityPrompt('Iris')]);
    assert.match(identityPrompt('Iris'), /« Iris »/);
    assert.doesNotMatch(identityPrompt('Iris'), /finish_run/);
    assert.match(identityPrompt('Iris', '', '', undefined, false, false, false, true), /rename_session[\s\S]*finish_run/, 'a trigger\'s run names itself and says when it is done');
    assert.doesNotMatch(identityPrompt('Iris'), /set_pending/);
    assert.match(identityPrompt('Iris', '', '', undefined, false, false, false, false, true), /set_pending/, 'a session with the open-space tools says what is left pending');
    const withTools = buildClaudeArgs({ ...base, openSpaceMcp: '{}' });
    assert.match(withTools[withTools.indexOf('--append-system-prompt') + 1], /set_pending/);
    assert.match(identityPrompt('Iris'), /sois concis/);
    assert.match(identityPrompt('Iris', 'Max', 'tutoie-moi'), /Open Space de Max[\s\S]*Ce que Max demande à tous ses agents : tutoie-moi$/);
    assert.ok(!identityPrompt('Iris', 'Max').includes('demande à tous'));
  });

  it('gives the open-space MCP server after the browser\'s, and the role with --agent', () => {
    const browser = JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } });
    const openSpace = JSON.stringify({ mcpServers: { 'open-space': { type: 'http', url: 'http://127.0.0.1:1/mcp/s/k' } } });
    const args = buildClaudeArgs({ ...base, mcpConfig: browser, openSpaceMcp: openSpace, agent: 'security-reviewer' });
    const at = args.indexOf('--mcp-config');
    assert.deepEqual(args.slice(at, at + 3), ['--mcp-config', browser, openSpace]);
    assert.equal(args[args.indexOf('--agent') + 1], 'security-reviewer');
    const allowed = buildClaudeArgs({ ...base, allowedTools: ['Edit', 'Bash(git push *)'] });
    assert.equal(allowed[allowed.indexOf('--allowedTools') + 1], 'Edit,Bash(git push *)');
    assert.equal(args[args.indexOf('--allowedTools') + 1], 'mcp__open-space__set_pending', 'a session with the open-space server says what is left pending without a prompt');
    assert.ok(!buildClaudeArgs(base).includes('--allowedTools'));
    const run = buildClaudeArgs({ ...base, allowedTools: ['Edit'], run: true });
    assert.equal(run[run.indexOf('--allowedTools') + 1], 'Edit,mcp__open-space__rename_session,mcp__open-space__finish_run,mcp__open-space__set_pending');
    // the open-space server alone does not tell the session it has a browser
    const alone = buildClaudeArgs({ ...base, openSpaceMcp: openSpace });
    assert.equal(alone[alone.indexOf('--append-system-prompt') + 1], identityPrompt('Iris', '', '', undefined, false, false, false, false, true));
    // switch_browser always waits for the user's yes, even in auto mode or allowed by the trigger
    assert.deepEqual(JSON.parse(alone[alone.indexOf('--settings') + 1]).permissions, { ask: ['mcp__open-space__switch_browser'] });
    assert.ok(!buildClaudeArgs(base).includes('--settings'), 'no open-space server, no rule');
  });

  describe('a project manager', () => {
    const openSpace = JSON.stringify({ mcpServers: { 'open-space': { type: 'http', url: 'http://127.0.0.1:1/mcp/s/k' } } });
    const allowedOf = (args: string[]) => (args.includes('--allowedTools') ? args[args.indexOf('--allowedTools') + 1].split(',') : []);
    const promptOf = (args: string[]) => args[args.indexOf('--append-system-prompt') + 1];

    it('runs its pm_* tools without a permission prompt, besides set_pending', () => {
      const allowed = allowedOf(buildClaudeArgs({ ...base, openSpaceMcp: openSpace, pm: true }));
      for (const tool of [...PM_TOOL_NAMES, 'set_pending']) assert.ok(allowed.includes(`mcp__open-space__${tool}`), tool);
      assert.ok(!allowedOf(buildClaudeArgs({ ...base, openSpaceMcp: openSpace })).some((tool) => tool.includes('__pm_')), 'an ordinary session has none of them');
      assert.ok(allowed.includes('mcp__open-space__rename_session'), 'it renames itself first');
    });

    it('is never one when it is a trigger run', () => {
      const args = buildClaudeArgs({ ...base, openSpaceMcp: openSpace, pm: true, run: true });
      assert.deepEqual(allowedOf(args), allowedOf(buildClaudeArgs({ ...base, openSpaceMcp: openSpace, run: true })));
      assert.ok(!promptOf(args).includes(st.prompt.pm('')));
    });

    it('is given its playbook with its identity, and only a PM is', () => {
      assert.ok(promptOf(buildClaudeArgs({ ...base, openSpaceMcp: openSpace, pm: true })).includes(st.prompt.pm('')));
      assert.ok(!promptOf(buildClaudeArgs({ ...base, openSpaceMcp: openSpace })).includes(st.prompt.pm('')));
    });

    it('gets neither tools nor playbook in a folder without the open-space server (not trusted)', () => {
      const args = buildClaudeArgs({ ...base, pm: true });
      assert.ok(!allowedOf(args).some((tool) => tool.includes('__pm_')));
      assert.ok(!promptOf(args).includes(st.prompt.pm('')));
    });

    it('is only told of tools it has, in both languages', () => {
      try {
        for (const language of ['fr', 'en'] as const) {
          setServerLanguage(language);
          const named = st.prompt.pm('').match(/\bpm_\w+/g) ?? [];
          assert.ok(named.length > 0);
          for (const tool of named) assert.ok((PM_TOOL_NAMES as readonly string[]).includes(tool), `${language}: ${tool}`);
        }
      } finally {
        setServerLanguage('fr');
      }
    });
  });

  it('tells a session with the shared browser what it is for, and only then', () => {
    const withShared = identityPrompt('Iris', 'Max', '', undefined, true, true);
    assert.match(withShared, /shared-browser/);
    assert.match(withShared, /mot de passe/);
    assert.doesNotMatch(identityPrompt('Iris', 'Max', '', undefined, true), /shared-browser/);
    const config = JSON.stringify({ mcpServers: { playwright: { command: 'npx' }, 'shared-browser': { command: 'npx' } } });
    const args = buildClaudeArgs({ sessionId: 's1', resume: false, model: '', permissionMode: 'auto', name: 'Iris', mcpConfig: config });
    assert.match(args[args.indexOf('--append-system-prompt') + 1], /shared-browser/);
    const untrusted = buildClaudeArgs({ ...base, untrusted: true });
    assert.equal(untrusted[untrusted.indexOf('--setting-sources') + 1], 'user', 'a folder not trusted: its settings stay out');
    const reading = buildClaudeArgs({ ...base, addDirs: ['/data/uploads'] });
    assert.equal(reading[reading.indexOf('--add-dir') + 1], '/data/uploads', 'the files the user sends are readable');
  });

  it('lets a session drive the user’s own Chrome through Claude in Chrome, and tells it what for', () => {
    const args = buildClaudeArgs({ ...base, chrome: true });
    assert.ok(args.includes('--chrome'));
    const prompt = args[args.indexOf('--append-system-prompt') + 1];
    assert.match(prompt, /claude-in-chrome/);
    assert.match(prompt, /mot de passe/);
    assert.doesNotMatch(prompt, /shared-browser/);
    assert.ok(!buildClaudeArgs(base).includes('--chrome'));
    assert.doesNotMatch(identityPrompt('Iris', 'Max'), /claude-in-chrome/);
  });

  it('asks Claude Code for the next message it predicts, only when the user wants suggestions', () => {
    assert.ok(buildClaudeArgs({ ...base, promptSuggestions: true }).includes('--prompt-suggestions'));
    assert.ok(!buildClaudeArgs(base).includes('--prompt-suggestions'));
  });

  it('passes the session permission mode', () => {
    const args = buildClaudeArgs({ ...base, permissionMode: 'manual' });
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'manual');
  });

  it('resumes with --resume, never both flags', () => {
    const args = buildClaudeArgs({ ...base, resume: true });
    assert.ok(args.includes('--resume') && !args.includes('--session-id'));
    assert.equal(args[args.indexOf('--resume') + 1], base.sessionId);
    // the name was recorded with the conversation; a resume keeps it as is
    assert.ok(!args.includes('--append-system-prompt'));
    assert.equal(args[args.indexOf('--name') + 1], 'Iris', 'other sessions still find it by its name');
  });

  it('adds the model only when asked, and never --tools, --restricted or the unsafe permission flags', () => {
    assert.ok(!buildClaudeArgs(base).includes('--model'));
    const args = buildClaudeArgs({ ...base, model: 'haiku' });
    assert.equal(args[args.indexOf('--model') + 1], 'haiku');
    for (const forbidden of ['--tools', '--restricted', '--dangerously-skip-permissions', '--allowedTools', '--permission-prompts']) assert.ok(!args.includes(forbidden));
  });
});

describe('parseAccount', () => {
  it('reads who `claude auth status --json` says is signed in, and nothing else', () => {
    const status = { loggedIn: true, authMethod: 'claude.ai', email: 'ada@example.com', orgId: 'org-1', orgName: 'Example', subscriptionType: 'team', configDirectory: '/x' };
    assert.deepEqual(parseAccount(status), { loggedIn: true, email: 'ada@example.com', org: 'Example', plan: 'team', via: 'claude.ai' });
    assert.equal(parseAccount({ ...status, apiProvider: 'bedrock' })?.via, 'bedrock', 'the cloud it goes through, when not Anthropic');
  });

  it('says signed out, and null for an answer it does not know', () => {
    assert.deepEqual(parseAccount({ loggedIn: false, authMethod: 'none' }), { loggedIn: false });
    assert.equal(parseAccount({ authMethod: 'none' }), null);
    assert.equal(parseAccount('Not logged in'), null);
  });
});

describe('parseCatalog', () => {
  it('reads the commands and the models of the initialize answer (shape of Claude Code 2.1.303)', () => {
    const catalog = parseCatalog({
      commands: [
        { name: 'impeccable:impeccable', description: 'Design work', argumentHint: '[shape · polish] [target]', aliases: ['impeccable'] },
        { name: 'compact', description: 'Free up context', argumentHint: '', builtin: true },
        { description: 'no name' },
      ],
      models: [
        { value: 'default', displayName: 'Default (recommended)', description: 'Opus 5.5', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max', 'turbo'] },
        { value: 'haiku', displayName: 'Haiku 5.5', supportsEffort: false },
        { value: 'opus', displayName: 'Opus', supportsEffort: false, supportsFastMode: true },
      ],
    });
    assert.deepEqual(catalog.commands, [
      { name: 'impeccable:impeccable', description: 'Design work', argumentHint: '[shape · polish] [target]', aliases: ['impeccable'] },
      { name: 'compact', description: 'Free up context' },
    ]);
    assert.deepEqual(catalog.models, [
      { value: 'default', label: 'Default (recommended)', description: 'Opus 5.5', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { value: 'haiku', label: 'Haiku 5.5', efforts: [] },
      { value: 'opus', label: 'Opus', efforts: [], fast: true },
    ]);
  });

  it('passes the effort at launch', () => {
    const args = buildClaudeArgs({ sessionId: 'id', resume: true, model: 'opus', effort: 'high', permissionMode: 'auto', name: 'Ana' });
    assert.deepEqual(args.slice(args.indexOf('--effort'), args.indexOf('--effort') + 2), ['--effort', 'high']);
  });

  it('starts a duplicate as a fork of the conversation it comes from, under its own id', () => {
    const args = buildClaudeArgs({ sessionId: 'copy', resume: false, model: '', permissionMode: 'auto', name: 'Ana', forkOf: 'original' });
    assert.deepEqual(args.slice(args.indexOf('--resume'), args.indexOf('--resume') + 5), ['--resume', 'original', '--fork-session', '--session-id', 'copy']);
    assert.ok(!args.includes('--append-system-prompt'), 'the conversation has its prompt already; the new name is told in the next message');
  });

  it('hands the Claude Code settings chosen in Open Space over as --settings, with ultracode', () => {
    const base = { sessionId: 'id', resume: false, model: '', permissionMode: 'auto' as const, name: 'Ana' };
    const args = buildClaudeArgs({ ...base, ultracode: true, settings: { alwaysThinkingEnabled: false, outputStyle: 'Concis' } });
    assert.deepEqual(JSON.parse(args[args.indexOf('--settings') + 1]), { alwaysThinkingEnabled: false, outputStyle: 'Concis', ultracode: true });
    assert.ok(!buildClaudeArgs({ ...base, settings: {} }).includes('--settings'), 'nothing chosen: Claude Code’s own files');
  });

  it('passes fast mode as a setting: in claude -p, its own opt-in', () => {
    const args = buildClaudeArgs({ sessionId: 'id', resume: true, model: 'opus', fastMode: true, ultracode: true, permissionMode: 'auto', name: 'Ana' });
    assert.deepEqual(JSON.parse(args[args.indexOf('--settings') + 1]), { ultracode: true, fastMode: true });
  });

  it('passes ultracode as a setting, next to the effort', () => {
    const args = buildClaudeArgs({ sessionId: 'id', resume: true, model: 'opus', effort: 'high', ultracode: true, permissionMode: 'auto', name: 'Ana' });
    assert.deepEqual(args.slice(args.indexOf('--settings'), args.indexOf('--settings') + 2), ['--settings', '{"ultracode":true}']);
    assert.ok(args.includes('--effort'));
    assert.ok(!buildClaudeArgs({ sessionId: 'id', resume: true, model: 'opus', permissionMode: 'auto', name: 'Ana' }).includes('--settings'));
  });
});

describe('a trigger\'s restrictions', () => {
  const base = { sessionId: 'id', resume: false, model: '', permissionMode: 'auto' as const, name: 'Ana' };
  // a home whose Claude Code settings turn two plugins on and one off
  const home = mkdtempSync(path.join(os.tmpdir(), 'restrict-home-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(path.join(home, '.claude'));
  writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'docs@market': true, 'old@market': false, 'review@market': true }, model: 'opus' }));
  const settingsOf = (args: string[]) => JSON.parse(args[args.indexOf('--settings') + 1]);

  it('merges what they turn off into the --settings Open Space already gives, keeping its keys', () => {
    const restrict = { plugins: ['*', 'review@market', 'extra@market'], mcpServers: ['github', 'plugin:ecc:chrome-devtools'], claudeMd: ['/tmp/work/CLAUDE.md', '/tmp/notes/**'], autoMemoryOff: true };
    const args = buildClaudeArgs({ ...base, home, settings: { autoCompactEnabled: false }, fastMode: true, openSpaceMcp: '{"mcpServers":{"open-space":{}}}', restrict });
    assert.deepEqual(settingsOf(args), {
      autoCompactEnabled: false,
      enabledPlugins: { 'docs@market': false, 'review@market': false, 'extra@market': false },
      deniedMcpServers: [{ serverName: 'github' }, { serverName: 'plugin:ecc:chrome-devtools' }],
      claudeMdExcludes: ['/tmp/work/CLAUDE.md', '/tmp/notes/**'],
      autoMemoryEnabled: false,
      permissions: { ask: ['mcp__open-space__switch_browser'] },
      fastMode: true,
    });
    assert.equal(args.filter((arg) => arg === '--settings').length, 1);
  });

  it('expands "*" to the plugins the home\'s settings turn on, and never turns one on', () => {
    const all = restrictionSettings({ ...NO_RESTRICT, plugins: ['*'] }, home);
    assert.deepEqual(all, { enabledPlugins: { 'docs@market': false, 'review@market': false } }, 'one already off is left alone');
    assert.deepEqual(restrictionSettings({ ...NO_RESTRICT, plugins: ['*'] }, path.join(home, 'nobody')), {}, 'no settings file: nothing to turn off');
    assert.deepEqual(restrictionSettings({ ...NO_RESTRICT, plugins: ['solo@market'] }, path.join(home, 'nobody')), { enabledPlugins: { 'solo@market': false } }, 'named plugins need no file');
  });

  it('gives no --settings for nothing restricted, and never denies a server of the session\'s own --mcp-config', () => {
    assert.ok(!buildClaudeArgs({ ...base, home, restrict: NO_RESTRICT }).includes('--settings'));
    // the session's browser takes the name of the user's Playwright server: denying it would cut the run off its browser
    const mcpConfig = JSON.stringify({ mcpServers: { 'playwright-bridge': { command: 'npx' } } });
    const args = buildClaudeArgs({ ...base, home, mcpConfig, restrict: { ...NO_RESTRICT, mcpServers: ['playwright-bridge', 'github'] } });
    assert.deepEqual(settingsOf(args).deniedMcpServers, [{ serverName: 'github' }]);
  });
});

describe('isolated sessions', () => {
  const worktree = { branch: 'os/lina-pay', base: 'main', root: '/w/garden/.claude/worktrees/os-lina-pay', mainRoot: '/w/garden' };
  it('tells a new conversation its branch, its folder and the main folder it must not write in', () => {
    const prompt = identityPrompt('Lina', 'Sam', '', worktree);
    assert.match(prompt, /« os\/lina-pay »/);
    assert.match(prompt, /\/w\/garden\/.claude\/worktrees\/os-lina-pay/);
    assert.match(prompt, /\/w\/garden, est celui des autres sessions : n’y écris jamais/);
    assert.match(prompt, /second Metro/);
    assert.doesNotMatch(identityPrompt('Lina', 'Sam', ''), /worktree/);
  });
  it('tells a conversation where it moved: into its worktree, or back to the main folder', () => {
    assert.match(placeNote(worktree.root, worktree), /changé de dossier[\s\S]*os\/lina-pay/);
    assert.match(placeNote('/w/garden', undefined), /dossier principal du projet, \/w\/garden/);
  });
});

describe('server language', () => {
  it('gives new agents their instructions in the language of the settings', () => {
    setServerLanguage('en');
    try {
      assert.match(identityPrompt('Iris', 'Max', 'call me Max'), /^In Max's Open Space, you are the agent "Iris"[\s\S]*be concise[\s\S]*What Max asks of all their agents: call me Max$/);
      assert.equal(renameNote('Iris'), '(Note from Open Space: your name is now "Iris". Keep this name.)\n\n');
    } finally {
      setServerLanguage('fr');
    }
    assert.match(identityPrompt('Iris'), /sois concis/);
  });
});
