// The Claude Code conversations already on disk for a folder (those started in a terminal, for instance), to reopen
// one in Open Space with --resume. Claude Code keeps each one as
// ~/.claude/projects/<the folder, every character but letters and digits turned into "-">/<session id>.jsonl.
// That format is Claude Code's own and undocumented: only a few fields are read, from the start of a file (its title
// and first message) and from its end (the last exchanges), and anything unexpected is skipped.
import { createReadStream, readFileSync } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Conversation } from '../shared/protocol.ts';
import { foldQuery, matchesAll, snippetOf } from '../shared/search.ts';
import { asArray, asJson, asNumber, asString, isJson } from './json.ts';
import type { AgentLaunch } from './normalizer.ts';

export const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Enough of a file's start to find its title and first message, and of its end to find the last exchanges. */
const HEAD_BYTES = 192 * 1024;
const TAIL_BYTES = 768 * 1024;
const LIST_LIMIT = 40;
const TEXT_MAX = 2000;

export const projectFolder = (cwd: string, home = os.homedir()) => path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));

/**
 * How a sub-agent of a conversation was launched, from the record Claude Code keeps next to its transcript
 * (<conversation>/subagents/agent-<agentId>.meta.json: { agentType, description, toolUseId, … }, checked with 2.1.303).
 * Read synchronously: the stream waits for it, and the file is a few hundred bytes.
 */
export function agentLaunch(cwd: string, conversationId: string, agentId: string, home = os.homedir()): AgentLaunch | null {
  if (!/^\w+$/.test(agentId)) return null;
  try {
    const meta = asJson(JSON.parse(readFileSync(path.join(projectFolder(cwd, home), conversationId, 'subagents', `agent-${agentId}.meta.json`), 'utf8')));
    const call = asString(meta.toolUseId);
    return call ? { call, type: asString(meta.agentType) } : null;
  } catch {
    return null;
  }
}

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
function userText(record: Record<string, unknown>, max = TEXT_MAX): string | null {
  if (record.type !== 'user' || record.isMeta === true || !isJson(record.message)) return null;
  const content = record.message.content;
  const text = typeof content === 'string' ? content
    : asArray(content).flatMap((part) => (isJson(part) && part.type === 'text' ? [asString(part.text)] : [])).join('\n');
  const clean = text.trim();
  return clean && !clean.startsWith('<') ? clean.slice(0, max) : null;
}

function assistantText(record: Record<string, unknown>, max = TEXT_MAX): string | null {
  if (record.type !== 'assistant' || !isJson(record.message)) return null;
  const text = asArray(record.message.content).flatMap((part) => (isJson(part) && part.type === 'text' ? [asString(part.text)] : [])).join('\n').trim();
  return text ? text.slice(0, max) : null;
}

/** The folder's conversation files, most recent first, without those already open here (`exclude`). */
async function conversationFiles(cwd: string, exclude: ReadonlySet<string>, home: string) {
  const folder = projectFolder(cwd, home);
  let names: string[];
  try { names = await readdir(folder); } catch { return []; }
  const files = await Promise.all(names
    .filter((name) => name.endsWith('.jsonl') && CONVERSATION_ID.test(name.slice(0, -6)) && !exclude.has(name.slice(0, -6)))
    .map(async (name) => ({ id: name.slice(0, -6), file: path.join(folder, name), updatedAt: (await stat(path.join(folder, name))).mtimeMs })));
  return files.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** A conversation's title and first message, from the start of its file; null for an empty one. */
async function describe(id: string, file: string, updatedAt: number): Promise<Conversation | null> {
  let aiTitle = '', customTitle = '', preview = '';
  for (const record of records(await readSlice(file, false, HEAD_BYTES))) {
    if (record.type === 'ai-title') aiTitle = asString(record.aiTitle);
    if (record.type === 'custom-title') customTitle = asString(record.customTitle);
    preview ||= userText(record) ?? '';
  }
  if (!preview && !aiTitle && !customTitle) return null;
  // a session of Open Space has its name as custom title (claude --name) and, run with -p, no title of Claude's:
  // "Margot · what it was asked"
  const about = aiTitle || preview.slice(0, 80);
  return { id, title: customTitle && about ? `${customTitle} · ${about}` : customTitle || about, preview: preview.slice(0, 200), updatedAt, ...(customTitle ? { name: customTitle } : {}) };
}

/** The folder's conversations, most recent first, without those already open here (`exclude`) and without empty ones. */
export async function listConversations(cwd: string, exclude: ReadonlySet<string>, home = os.homedir()): Promise<Conversation[]> {
  const conversations: Conversation[] = [];
  for (const { id, file, updatedAt } of (await conversationFiles(cwd, exclude, home)).slice(0, LIST_LIMIT)) {
    try {
      const conversation = await describe(id, file, updatedAt);
      if (conversation) conversations.push(conversation);
    } catch { /* unreadable: skipped */ }
  }
  return conversations;
}

const ACCENTED: Record<string, string> = { a: 'àâäáãå', c: 'ç', e: 'éèêë', i: 'îïíì', n: 'ñ', o: 'ôöóòõ', u: 'ùûüú' };
const asBytes = (text: string) => Buffer.from(text, 'utf8').toString('latin1').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * A regular expression for each word of the query, to run on a file read as latin1: three times faster than decoding
 * it as UTF-8, so a character beyond ASCII is matched by its UTF-8 bytes. Any case, and a plain letter also matches its
 * accented forms ("deploiement" finds "Déploiement"). It can match a little more than the words: what it finds is checked again.
 */
function bytePatterns(query: string): RegExp[] {
  return foldQuery(query).split(/\s+/).filter(Boolean).map((word) => new RegExp([...word].map((character) => {
    const accented = ACCENTED[character];
    if (!accented) return asBytes(character);
    // every accented form is two bytes starting with 0xC3: one class for the second byte, faster than an alternation
    const seconds = [...accented, ...accented.toUpperCase()].map((form) => Buffer.from(form, 'utf8').toString('latin1')[1]).join('');
    return `(?:${character}|\xC3[${seconds}])`;
  }).join(''), 'i'));
}

/**
 * The lines of a file that match every pattern, read in pieces: a file can be larger than the longest string Node
 * allows (550 MB seen), and a piece without the first word is passed over without being split.
 */
async function matchingLines(file: string, patterns: RegExp[]): Promise<string[]> {
  const lines: string[] = [];
  let rest = '';
  for await (const piece of createReadStream(file, { encoding: 'latin1', highWaterMark: 16 * 1024 * 1024 })) {
    const text = rest + piece;
    const cut = text.lastIndexOf('\n');
    rest = text.slice(cut + 1);
    const whole = text.slice(0, cut + 1);
    if (patterns[0].test(whole)) lines.push(...whole.split('\n').filter((line) => patterns.every((pattern) => pattern.test(line))));
  }
  if (patterns.every((pattern) => pattern.test(rest))) lines.push(rest);
  return lines.map((line) => Buffer.from(line, 'latin1').toString('utf8'));
}

/**
 * The folder's conversations with a message (the user's or Claude's) that holds every word of `query`, most recent
 * first, each with its latest such message.
 */
export async function searchConversations(cwd: string, query: string, exclude: ReadonlySet<string>, home = os.homedir()): Promise<Conversation[]> {
  const patterns = bytePatterns(query);
  if (!patterns.length) return [];
  const conversations: Conversation[] = [];
  for (const { id, file, updatedAt } of await conversationFiles(cwd, exclude, home)) {
    if (conversations.length >= LIST_LIMIT) break;
    try {
      let found = '';
      for (const record of records((await matchingLines(file, patterns)).join('\n'))) {
        const said = userText(record, Infinity) ?? assistantText(record, Infinity);
        if (said && matchesAll(said, query)) found = said;
      }
      const match = found && snippetOf(found, query);
      const conversation = match && await describe(id, file, updatedAt);
      if (conversation) conversations.push({ ...conversation, match });
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

/** The name a session of Open Space last gave the conversation (its custom title, claude --name), or null. */
export async function lastName(cwd: string, id: string, home = os.homedir()): Promise<string | null> {
  if (!CONVERSATION_ID.test(id)) return null;
  const file = path.join(projectFolder(cwd, home), `${id}.jsonl`);
  try {
    for (const fromEnd of [true, false]) {
      const titles = records(await readSlice(file, fromEnd, fromEnd ? TAIL_BYTES : HEAD_BYTES)).flatMap((record) => (record.type === 'custom-title' && asString(record.customTitle) ? [asString(record.customTitle)] : []));
      if (titles.length) return titles.at(-1) ?? null;
    }
    return null;
  } catch {
    return null;
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
