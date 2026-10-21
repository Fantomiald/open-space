import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { changedSettings, parseClaudeSettings } from '../shared/claude-settings.ts';
import { effectiveSettings, readClaudeDefaults } from './claude-settings.ts';

describe('Claude Code settings', () => {
  const folders: string[] = [];
  after(() => Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true }))));

  it('keeps what is valid: booleans, known choices, a style or language name', () => {
    assert.deepEqual(parseClaudeSettings({ autoCompactEnabled: 'no', language: 'français', outputStyle: 'rm -rf /', crossSessionInbound: 'maybe' }), { language: 'français' });
    assert.deepEqual(parseClaudeSettings(null), {});
  });

  it('fills in Claude Code’s defaults, ~/.claude.json winning for auto-compact as in its /config', () => {
    assert.deepEqual(effectiveSettings({}, {}), {
      alwaysThinkingEnabled: true, autoCompactEnabled: true, autoContinueAtUsageLimit: true, enableWorkflows: true, workflowKeywordTriggerEnabled: true,
      enableArtifact: true, useAutoModeDuringPlan: true, outputStyle: 'default', workflowSizeGuideline: 'medium',
    });
    const found = effectiveSettings({ autoCompactEnabled: true, disableWorkflows: true, outputStyle: 'Concis', language: 'french' }, { autoCompactEnabled: false, workflowSizeGuideline: 'small' });
    assert.equal(found.autoCompactEnabled, false);
    assert.equal(found.enableWorkflows, false);
    assert.equal(found.workflowSizeGuideline, 'small');
    assert.equal(found.language, 'french');
  });

  it('reads the files and lists the built-in styles with the user’s', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'claude-settings-'));
    folders.push(home);
    await mkdir(path.join(home, '.claude', 'output-styles'), { recursive: true });
    await writeFile(path.join(home, '.claude', 'settings.json'), JSON.stringify({ outputStyle: 'Concis', alwaysThinkingEnabled: false }));
    await writeFile(path.join(home, '.claude', 'output-styles', 'concis.md'), '---\nname: Concis\ndescription: short\n---\nBe brief.');
    await writeFile(path.join(home, '.claude', 'output-styles', 'plain.md'), 'No front matter.');
    const defaults = await readClaudeDefaults(home);
    assert.equal(defaults.current.outputStyle, 'Concis');
    assert.equal(defaults.current.alwaysThinkingEnabled, false);
    assert.deepEqual(defaults.outputStyles.toSorted(), ['Concis', 'Explanatory', 'Learning', 'default', 'plain']);
    assert.deepEqual((await readClaudeDefaults(path.join(home, 'missing'))).current.outputStyle, 'default', 'no Claude Code files: its defaults');
  });

  it('tells a running session only what changed, null for a key given back to Claude Code', () => {
    assert.deepEqual(changedSettings({ outputStyle: 'Concis', enableArtifact: false }, { outputStyle: 'Concis', alwaysThinkingEnabled: false }), { enableArtifact: null, alwaysThinkingEnabled: false });
    assert.deepEqual(changedSettings({}, {}), {});
  });
});
