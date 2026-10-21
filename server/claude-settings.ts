// What Claude Code runs with when Open Space sets nothing: read from its own files (<home>/.claude/settings.json, and
// <home>/.claude.json where /config keeps a few rows), so the settings page can show "as in Claude Code (on)".
// Read only: Open Space never writes Claude Code's files.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { BUILT_IN_STYLES, parseClaudeSettings, type ClaudeDefaults, type ClaudeSettings } from '../shared/claude-settings.ts';
import { isJson, type Json } from './json.ts';

async function readJson(file: string): Promise<Json> {
  try {
    const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
    return isJson(raw) ? raw : {};
  } catch {
    return {};
  }
}

/** The user's output styles: the name in each file's front matter, else the file's name. */
async function userStyles(folder: string): Promise<string[]> {
  let files: string[];
  try { files = (await readdir(folder)).filter((file) => file.endsWith('.md')); } catch { return []; }
  return Promise.all(files.map(async (file) => {
    const text = await readFile(path.join(folder, file), 'utf8').catch(() => '');
    return /^---\n[\s\S]*?^name:\s*(.+?)\s*$/m.exec(text)?.[1]?.replace(/^["']|["']$/g, '') ?? file.slice(0, -3);
  }));
}

/** Claude Code's values, its defaults filled in where its files say nothing (as its /config shows them). */
export function effectiveSettings(settings: Json, global: Json): ClaudeSettings {
  const own = parseClaudeSettings(settings);
  const kept = parseClaudeSettings(global);
  return {
    ...own,
    alwaysThinkingEnabled: own.alwaysThinkingEnabled !== false,
    autoCompactEnabled: kept.autoCompactEnabled ?? own.autoCompactEnabled ?? true,
    autoContinueAtUsageLimit: own.autoContinueAtUsageLimit ?? true,
    enableWorkflows: settings.disableWorkflows === true ? false : own.enableWorkflows ?? true,
    workflowKeywordTriggerEnabled: own.workflowKeywordTriggerEnabled ?? true,
    enableArtifact: settings.disableArtifact === true ? false : own.enableArtifact ?? true,
    useAutoModeDuringPlan: own.useAutoModeDuringPlan ?? true,
    outputStyle: own.outputStyle ?? 'default',
    workflowSizeGuideline: own.workflowSizeGuideline ?? kept.workflowSizeGuideline ?? 'medium',
  };
}

export async function readClaudeDefaults(home: string): Promise<ClaudeDefaults> {
  const folder = path.join(home, '.claude');
  const [settings, global, styles] = await Promise.all([readJson(path.join(folder, 'settings.json')), readJson(path.join(home, '.claude.json')), userStyles(path.join(folder, 'output-styles'))]);
  return { current: effectiveSettings(settings, global), outputStyles: [...new Set([...BUILT_IN_STYLES, ...styles])] };
}
