// A tag for a new session, from its first message (Preferences.autoTag): one or two words, asked of Haiku in a
// `claude -p` of its own, outside any folder so that no settings, hooks, plugins or MCP servers are loaded. Checked
// with 2.1.309: about 4 s and less than a cent per tag, through the user's own Claude Code login.
import { spawn } from 'node:child_process';
import os from 'node:os';
import { claudeCommand, type ClaudeBinary } from './claude-process.ts';
import { signalTree } from './process-tree.ts';
import { asString, isJson } from './json.ts';

/** The tag for a first message, or null when it has no subject yet or the call failed. */
export type Tagger = (message: string) => Promise<string | null>;

const TIME_LIMIT_MS = 30_000;
/** Enough of a long message to tell what it is about. */
const MAX_MESSAGE = 2000;
const MAX_TAG = 24;
/** What the model answers for a message without a subject (a greeting). */
const NO_TAG = '-';

const SYSTEM_PROMPT = 'Give a short tag naming what a request is about, like a label on a folder. Answer only the tag: one word if it ' +
  'can be said in one, two at most, lowercase, no punctuation, in the request\'s language. Name the thing worked on, not the action: ' +
  '"refonte du paywall de Lilies" gives "paywall", "fix the login crash on Android" gives "login". If the request has no subject ' +
  `yet (a greeting, "are you there?"), answer ${NO_TAG}`;

export function buildTagArgs(message: string): string[] {
  return [
    '-p', '--no-session-persistence', '--model', 'haiku', '--output-format', 'json',
    '--setting-sources', 'project', '--strict-mcp-config', '--disable-slash-commands', '--system-prompt', SYSTEM_PROMPT,
    '--', `Request:\n${message.slice(0, MAX_MESSAGE)}`,
  ];
}

/** The model's answer as a tag: two words at most, without quotes or punctuation; null for none. */
export function cleanTag(answer: string): string | null {
  const words = answer.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((word) => word && word !== NO_TAG);
  const tag = words.slice(0, 2).join(' ').slice(0, MAX_TAG).trim();
  return tag || null;
}

/** The answer in the output of `claude -p --output-format json`. */
export function readTagOutput(output: string): string | null {
  let result: unknown;
  try { result = JSON.parse(output); } catch { return null; }
  if (!isJson(result) || result.is_error) return null;
  return cleanTag(asString(result.result));
}

export function createTagger(binary: ClaudeBinary, environment: NodeJS.ProcessEnv): Tagger {
  return (message) => new Promise((resolve) => {
    const child = spawn(...claudeCommand(binary.path, buildTagArgs(message)), { cwd: os.tmpdir(), env: environment, stdio: ['ignore', 'pipe', 'ignore'], detached: process.platform !== 'win32', windowsHide: true });
    let output = '';
    const limit = setTimeout(() => { signalTree(child.pid, 'SIGTERM'); resolve(null); }, TIME_LIMIT_MS);
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.on('close', () => { clearTimeout(limit); resolve(readTagOutput(output)); });
    child.on('error', () => { clearTimeout(limit); resolve(null); });
  });
}
