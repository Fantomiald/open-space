// What Claude Desktop keeps of its Code sessions, for a conversation of its that Open Space reopens: the branch the
// session started from, to merge back into. Desktop writes one record per session in its own data folder
// (claude-code-sessions/<account>/<org>/local_<id>.json: { cliSessionId, sourceBranch, branch, cwd, … }, checked with
// the Windows app in November 2026). That format is Desktop's own and undocumented: anything unexpected gives nothing,
// and Open Space falls back to the main checkout's branch.
import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { asString, isJson } from './json.ts';

/** Claude Desktop's data folder on this system. */
export function desktopDataFolder(home = os.homedir(), platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return path.join(home, 'AppData', 'Roaming', 'Claude');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Claude');
  return path.join(home, '.config', 'Claude');
}

/** The records' files, two folders down (account, organisation). */
async function recordFiles(root: string): Promise<string[]> {
  const below = async (folder: string) => (await readdir(folder, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory()).map((entry) => path.join(folder, entry.name));
  const files: string[] = [];
  for (const account of await below(root)) {
    for (const org of await below(account)) {
      for (const name of await readdir(org).catch(() => [] as string[])) {
        if (name.startsWith('local_') && name.endsWith('.json')) files.push(path.join(org, name));
      }
    }
  }
  return files;
}

/** The branch the Claude Desktop session of a conversation started from, or '' when none says so. */
export async function desktopSourceBranch(conversationId: string, home = os.homedir(), platform: NodeJS.Platform = process.platform): Promise<string> {
  for (const file of await recordFiles(path.join(desktopDataFolder(home, platform), 'claude-code-sessions'))) {
    try {
      const text = await readFile(file, 'utf8');
      // most records are someone else's: no need to parse them
      if (!text.includes(conversationId)) continue;
      const record: unknown = JSON.parse(text);
      if (isJson(record) && record.cliSessionId === conversationId) return asString(record.sourceBranch);
    } catch { /* unreadable: skipped */ }
  }
  return '';
}

/** What each record said last time it was read, by file: read again only when the file changed (Desktop keeps hundreds). */
const archivedRecords = new Map<string, { changed: number; archived: string }>();

/** The conversations whose Claude Desktop session is archived (records with isArchived: true), by conversation id. */
export async function desktopArchived(home = os.homedir(), platform: NodeJS.Platform = process.platform): Promise<Set<string>> {
  const archived = new Set<string>();
  for (const file of await recordFiles(path.join(desktopDataFolder(home, platform), 'claude-code-sessions'))) {
    try {
      const changed = (await stat(file)).mtimeMs;
      let known = archivedRecords.get(file);
      if (known?.changed !== changed) {
        const record: unknown = JSON.parse(await readFile(file, 'utf8'));
        known = { changed, archived: isJson(record) && record.isArchived === true ? asString(record.cliSessionId) : '' };
        archivedRecords.set(file, known);
      }
      if (known.archived) archived.add(known.archived);
    } catch { /* unreadable: skipped */ }
  }
  return archived;
}
