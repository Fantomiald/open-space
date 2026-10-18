// The Claude Code conversations already on disk for a folder (those started in a terminal, for instance), to reopen
// one in Open Space with --resume. Claude Code keeps each one as
// ~/.claude/projects/<the folder, every character but letters and digits turned into "-">/<session id>.jsonl.
// That format is Claude Code's own and undocumented: only a few fields are read, from the start of a file (its title
// and first message) and from its end (the last exchanges), and anything unexpected is skipped.
import { open, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Conversation } from '../shared/protocol.ts';
import { asArray, asJson, asNumber, asString, isJson } from './json.ts';

export const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Enough of a file's start to find its title and first message, and of its end to find the last exchanges. */
const HEAD_BYTES = 192 * 1024;
const TAIL_BYTES = 768 * 1024;
const LIST_LIMIT = 40;
const TEXT_MAX = 2000;

export const projectFolder = (cwd: string, home = os.homedir()) => path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));

async function readSlice(file: string, fromEnd: boolean, length: number): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const start = fromEnd ? Math.max(0, size - length) : 0;
    const buffer = Buffer.alloc(Math.min(length, size));
    await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.toString('utf8').split('\n');
    // a slice cut in the middle of a record: drop the broken line at the cut
    if (fromEnd && start > 0) lines.shift();
    if (!fromEnd && start + buffer.length < size) lines.pop();
    return lines.join('\n');
  } finally {
    await handle.close();
  }
}

function records(text: string): Record<string, unknown>[] {
  return text.split('\n').flatMap((line) => {
    if (!line.trim()) return [];
    try { const value: unknown = JSON.parse(line); return isJson(value) ? [value] : []; } catch { return []; }
  });
}

/** What the user typed in a record, or null for anything else (tool results, commands, notes Claude Code adds). */
function userText(record: Record<string, unknown>): string | null {
  if (record.type !== 'user' || record.isMeta === true || !isJson(record.message)) return null;
  const content = record.message.content;
  const text = typeof content === 'string' ? content
    : asArray(content).flatMap((part) => (isJson(part) && part.type === 'text' ? [asString(part.text)] : [])).join('\n');
  const clean = text.trim();
  return clean && !clean.startsWith('<') ? clean.slice(0, TEXT_MAX) : null;
}

function assistantText(record: Record<string, unknown>): string | null {
  if (record.type !== 'assistant' || !isJson(record.message)) return null;
  const text = asArray(record.message.content).flatMap((part) => (isJson(part) && part.type === 'text' ? [asString(part.text)] : [])).join('\n').trim();
  return text ? text.slice(0, TEXT_MAX) : null;
}

/** The folder's conversations, most recent first, without those already open here (`exclude`) and without empty ones. */
export async function listConversations(cwd: string, exclude: ReadonlySet<string>, home = os.homedir()): Promise<Conversation[]> {
  const folder = projectFolder(cwd, home);
  let names: string[];
  try { names = await readdir(folder); } catch { return []; }
  const files = await Promise.all(names
    .filter((name) => name.endsWith('.jsonl') && CONVERSATION_ID.test(name.slice(0, -6)) && !exclude.has(name.slice(0, -6)))
    .map(async (name) => ({ id: name.slice(0, -6), file: path.join(folder, name), updatedAt: (await stat(path.join(folder, name))).mtimeMs })));
  files.sort((a, b) => b.updatedAt - a.updatedAt);
  const conversations: Conversation[] = [];
  for (const { id, file, updatedAt } of files.slice(0, LIST_LIMIT)) {
    try {
      let aiTitle = '', customTitle = '', preview = '';
      for (const record of records(await readSlice(file, false, HEAD_BYTES))) {
        if (record.type === 'ai-title') aiTitle = asString(record.aiTitle);
        if (record.type === 'custom-title') customTitle = asString(record.customTitle);
        preview ||= userText(record) ?? '';
      }
      if (!preview && !aiTitle && !customTitle) continue;
      // a session of Open Space has its name as custom title (claude --name) and, run with -p, no title of Claude's:
      // "Margot · what it was asked"
      const about = aiTitle || preview.slice(0, 80);
      conversations.push({ id, title: customTitle && about ? `${customTitle} · ${about}` : customTitle || about, preview: preview.slice(0, 200), updatedAt });
    } catch { /* unreadable: skipped */ }
  }
  return conversations;
}

/** The last exchanges of a conversation (what the user said, what Claude answered), oldest first. */
export async function lastExchanges(cwd: string, id: string, max = 8, home = os.homedir()): Promise<{ who: 'user' | 'assistant'; text: string }[]> {
  if (!CONVERSATION_ID.test(id)) return [];
  try {
    type Exchange = { who: 'user' | 'assistant'; text: string };
    const exchanges = records(await readSlice(path.join(projectFolder(cwd, home), `${id}.jsonl`), true, TAIL_BYTES)).flatMap((record): Exchange[] => {
      const user = userText(record);
      if (user) return [{ who: 'user', text: user }];
      const assistant = assistantText(record);
      return assistant ? [{ who: 'assistant', text: assistant }] : [];
    });
    return exchanges.slice(-max);
  } catch {
    return [];
  }
}

/**
 * How full a conversation's context was when it stopped: its last answer's usage (all it read, cached or not, and what
 * it wrote), or what a compaction after it left. With the answer's model, to find the window's size elsewhere.
 */
export async function lastContextUse(cwd: string, id: string, home = os.homedir()): Promise<{ used: number; model: string } | null> {
  if (!CONVERSATION_ID.test(id)) return null;
  try {
    let last: { used: number; model: string } | null = null;
    for (const record of records(await readSlice(path.join(projectFolder(cwd, home), `${id}.jsonl`), true, TAIL_BYTES))) {
      if (record.isSidechain === true) continue;
      if (record.type === 'assistant' && isJson(record.message) && isJson(record.message.usage)) {
        const usage = record.message.usage;
        const used = asNumber(usage.input_tokens) + asNumber(usage.cache_creation_input_tokens) + asNumber(usage.cache_read_input_tokens) + asNumber(usage.output_tokens);
        if (used > 0) last = { used, model: asString(record.message.model) };
      }
      const after = asNumber(asJson(record.compactMetadata).postTokens);
      if (record.type === 'system' && record.subtype === 'compact_boundary' && last && after > 0) last = { ...last, used: after };
    }
    return last;
  } catch {
    return null;
  }
}
