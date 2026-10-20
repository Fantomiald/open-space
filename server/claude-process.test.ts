import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildClaudeArgs, identityPrompt, parseCatalog, renameNote } from './claude-process.ts';
import { setServerLanguage } from './i18n/index.ts';

describe('buildClaudeArgs', () => {
  const base = { sessionId: '11111111-2222-3333-4444-555555555555', resume: false, model: '', permissionMode: 'auto' as const, name: 'Iris' };

  it('starts a new session with --session-id, asking for permissions through stdio', () => {
    const args = buildClaudeArgs(base);
    assert.deepEqual(args, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--forward-subagent-text', '--permission-prompt-tool', 'stdio', '--permission-mode', 'auto', '--session-id', base.sessionId, '--name', 'Iris', '--append-system-prompt', identityPrompt('Iris')]);
    assert.match(identityPrompt('Iris'), /« Iris »/);
    assert.match(identityPrompt('Iris'), /sois concis/);
    assert.match(identityPrompt('Iris', 'Max', 'tutoie-moi'), /Open Space de Max[\s\S]*Ce que Max demande à tous ses agents : tutoie-moi$/);
    assert.ok(!identityPrompt('Iris', 'Max').includes('demande à tous'));
    const untrusted = buildClaudeArgs({ ...base, untrusted: true });
    assert.equal(untrusted[untrusted.indexOf('--setting-sources') + 1], 'user', 'a folder not trusted: its settings stay out');
    const reading = buildClaudeArgs({ ...base, addDirs: ['/data/uploads'] });
    assert.equal(reading[reading.indexOf('--add-dir') + 1], '/data/uploads', 'the files the user sends are readable');
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
      ],
    });
    assert.deepEqual(catalog.commands, [
      { name: 'impeccable:impeccable', description: 'Design work', argumentHint: '[shape · polish] [target]', aliases: ['impeccable'] },
      { name: 'compact', description: 'Free up context' },
    ]);
    assert.deepEqual(catalog.models, [
      { value: 'default', label: 'Default (recommended)', description: 'Opus 5.5', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { value: 'haiku', label: 'Haiku 5.5', efforts: [] },
    ]);
  });

  it('passes the effort at launch', () => {
    const args = buildClaudeArgs({ sessionId: 'id', resume: true, model: 'opus', effort: 'high', permissionMode: 'auto', name: 'Ana' });
    assert.deepEqual(args.slice(args.indexOf('--effort'), args.indexOf('--effort') + 2), ['--effort', 'high']);
  });

  it('passes ultracode as a setting, next to the effort', () => {
    const args = buildClaudeArgs({ sessionId: 'id', resume: true, model: 'opus', effort: 'high', ultracode: true, permissionMode: 'auto', name: 'Ana' });
    assert.deepEqual(args.slice(args.indexOf('--settings'), args.indexOf('--settings') + 2), ['--settings', '{"ultracode":true}']);
    assert.ok(args.includes('--effort'));
    assert.ok(!buildClaudeArgs({ sessionId: 'id', resume: true, model: 'opus', permissionMode: 'auto', name: 'Ana' }).includes('--settings'));
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
