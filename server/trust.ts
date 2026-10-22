// Folders whose own settings run code. A folder's .claude/settings*.json hooks and its .mcp.json servers start with
// the session; in a terminal Claude Code first asks whether to trust the folder, but `claude -p` skips that question
// (checked: in an unknown folder, both ran without a word). So Open Space asks instead, once per folder, and
// a folder not trusted runs without its own settings (--setting-sources user: neither its hooks nor its servers,
// checked too). Its CLAUDE.md is still read: that flag does not cover it.
// Its other settings can run code too: an env with BASH_ENV runs a script before every Bash command, a statusLine or
// a plugin runs its own (checked: BASH_ENV ran without a word). So any key outside the harmless ones counts.
import { existsSync, readFileSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FolderCode } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import { cut } from '../shared/activity.ts';
import { asArray, asJson, asString, isJson } from './json.ts';

/** Settings keys that run nothing and allow nothing (hooks are listed on their own). Claude Code already ignores the
 * permissions.allow of a folder never trusted, but not its defaultMode. */
const HARMLESS_KEYS = new Set([
  '$schema', 'hooks', 'model', 'effortLevel', 'outputStyle', 'language', 'includeCoAuthoredBy', 'includeGitInstructions', 'attribution',
  'cleanupPeriodDays', 'alwaysThinkingEnabled', 'spinnerTipsEnabled', 'respectGitignore', 'companyAnnouncements', 'disableAllHooks',
  'enableAllProjectMcpServers', 'enabledMcpjsonServers', 'disabledMcpjsonServers',
]);
const HARMLESS_PERMISSIONS = new Set(['allow', 'deny', 'ask']);

/** The settings that would run or allow something, one line each: an env variable, or another key and its value. */
function riskySettings(settings: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    if (HARMLESS_KEYS.has(key)) continue;
    if (key === 'env') {
      for (const [name, set] of Object.entries(asJson(value))) found.push(st.trust.entry(name, cut(asString(set) || JSON.stringify(set), 160)));
    } else if (key === 'permissions') {
      for (const [name, set] of Object.entries(asJson(value))) {
        if (!HARMLESS_PERMISSIONS.has(name)) found.push(st.trust.entry(`permissions.${name}`, cut(JSON.stringify(set), 160)));
      }
    } else found.push(st.trust.entry(key, cut(JSON.stringify(value), 160)));
  }
  return found;
}

const readJson = (file: string) => { try { return asJson(JSON.parse(readFileSync(file, 'utf8'))); } catch { return null; } };

/** What a folder would run of its own with a session: its hooks, its MCP servers, its other settings that run or allow code, and whether it has a CLAUDE.md. */
export function folderCode(cwd: string): FolderCode {
  const hooks: string[] = [];
  const settings: string[] = [];
  for (const name of ['settings.json', 'settings.local.json']) {
    const read = readJson(path.join(cwd, '.claude', name));
    if (!read) continue;
    settings.push(...riskySettings(read));
    for (const [event, groups] of Object.entries(asJson(read.hooks))) {
      for (const group of asArray(groups).map(asJson)) {
        for (const hook of asArray(group.hooks).map(asJson)) hooks.push(st.trust.entry(event, asString(hook.command) || asString(hook.type)));
      }
    }
  }
  const servers = asJson(readJson(path.join(cwd, '.mcp.json'))?.mcpServers);
  const mcpServers = Object.entries(servers).map(([name, server]) => {
    const { command, args, url } = asJson(server);
    return st.trust.entry(name, asString(url) || [asString(command), ...asArray(args).map((arg) => asString(arg))].join(' ').trim());
  });
  const instructions = existsSync(path.join(cwd, 'CLAUDE.md')) || existsSync(path.join(cwd, '.claude', 'CLAUDE.md'));
  return { hooks, mcpServers, settings, instructions };
}

export const runsCode = (code: FolderCode) => code.hooks.length > 0 || code.mcpServers.length > 0 || code.settings.length > 0;

/**
 * True when the user accepted this very folder in Claude Code's trust dialog (in ~/.claude.json). A trusted parent
 * does not count: a repository cloned later under it was never looked at.
 */
export function trustedInClaudeCode(cwd: string, home = os.homedir()): boolean {
  const config = readJson(path.join(home, '.claude.json'));
  return asJson(asJson(config?.projects)[cwd]).hasTrustDialogAccepted === true;
}

/** The folders the user trusted in Open Space, in OFFICE_DIR/trusted-folders.json. */
export class TrustedFolders {
  private folders = new Set<string>();
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  async load() {
    try {
      const raw: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (isJson(raw)) this.folders = new Set(asArray(raw.folders).map((folder) => asString(folder)).filter(Boolean));
    } catch { /* none yet */ }
  }

  has(cwd: string) { return this.folders.has(cwd); }

  async add(cwd: string) {
    this.folders.add(cwd);
    const temporary = `${this.file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ folders: [...this.folders].sort() }, null, 2), { mode: 0o600 });
    await rename(temporary, this.file);
  }
}
