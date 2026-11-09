// The agent a messenger's plain words go to (server/messengers.ts): a `claude -p` of its own, Haiku by default, whose
// only tools are Open Space's MCP server, reached as that bot (server/mcp.ts: it follows the sessions, writes to them,
// stops them, starts sessions and triggers, sends files to the chat, never answers a permission). It runs in a folder
// of its own under OFFICE_DIR, without the folder settings, hooks, plugins nor other MCP servers, and resumes its
// conversation from one message to the next so that "tell him" knows who.
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { claudeCommand, hiddenRules, type ClaudeBinary } from './claude-process.ts';
import { openSpaceMcpConfig, MCP_SERVER } from './mcp.ts';
import { asString, isJson } from './json.ts';
import { signalTree } from './process-tree.ts';
import { MESSENGER_MODEL } from '../shared/messengers.ts';

const TIME_LIMIT_MS = 180_000;
const MAX_MESSAGE = 8000;

const SYSTEM_PROMPT = [
  'You are the chat assistant of Open Space, an app on the user\'s computer that runs several Claude Code sessions side by side.',
  'The user writes to you from their phone (Telegram). You act through the open-space tools only:',
  '- list_sessions: who does what. Each session has a name (like JD), a folder (cwd), a state (work: at work; perm: waits for the user; wait: done with its turn), what it waits for, and lastWords, what it said last.',
  '- send_message: passes a request to a session, as if the user typed it in Open Space.',
  '- stop_session, set_remote (Remote Control: to follow and answer a session in the Claude app of the phone).',
  '- create_session: starts a session in an absolute project folder (take it from the sessions\' folders, or ask); remote: true when the user wants Remote Control or to follow it from the phone.',
  '- list_triggers, run_trigger: the automations. list_crew: the names sessions take.',
  '- send_file: sends the user a file (a screenshot, a video, a PDF) by its absolute path.',
  'You cannot answer what a session waits for (permissions, questions): the user does it with the buttons in the chat. Say so if asked.',
  'Speak of sessions by their name and their project ("JD, on pilou"). "Him", "her" or "it" is the session last talked about.',
  'Answer in the user\'s language, in one to three short sentences of plain text: no markdown, no tables. Do what is asked without asking for confirmation, unless it is unclear.',
].join('\n');

export type MessengerAgent = (bot: { id: string; model: string }, text: string, conversation: string | null) => Promise<{ text: string; conversation: string | null }>;

export function buildAgentArgs(options: { mcpUrl: string; model: string; conversation: string; resume: boolean; hidden: readonly string[]; text: string }): string[] {
  return [
    '-p', '--output-format', 'json', '--model', options.model || MESSENGER_MODEL,
    options.resume ? '--resume' : '--session-id', options.conversation,
    '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', openSpaceMcpConfig(options.mcpUrl),
    '--allowedTools', `mcp__${MCP_SERVER}`, ...(options.hidden.length ? ['--disallowedTools', hiddenRules(options.hidden).join(',')] : []),
    '--disable-slash-commands', '--append-system-prompt', SYSTEM_PROMPT,
    '--', options.text.slice(0, MAX_MESSAGE),
  ];
}

/** The answer in the output of `claude -p --output-format json`; null when the call failed. */
export function readAgentOutput(output: string): string | null {
  let result: unknown;
  try { result = JSON.parse(output); } catch { return null; }
  if (!isJson(result) || result.is_error) return null;
  return asString(result.result).trim();
}

export function createMessengerAgent(binary: ClaudeBinary, environment: NodeJS.ProcessEnv, options: { folder: string; mcpUrl: (botId: string) => string; hidden: readonly string[]; failed: string }): MessengerAgent {
  const run = (args: string[]) => new Promise<string | null>((resolve) => {
    mkdirSync(options.folder, { recursive: true, mode: 0o700 });
    const child = spawn(...claudeCommand(binary.path, args), { cwd: options.folder, env: environment, stdio: ['ignore', 'pipe', 'ignore'], detached: process.platform !== 'win32', windowsHide: true });
    let output = '';
    const limit = setTimeout(() => { signalTree(child.pid, 'SIGTERM'); resolve(null); }, TIME_LIMIT_MS);
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.on('close', () => { clearTimeout(limit); resolve(readAgentOutput(output)); });
    child.on('error', () => { clearTimeout(limit); resolve(null); });
  });
  return async (bot, text, conversation) => {
    const common = { mcpUrl: options.mcpUrl(bot.id), model: bot.model, hidden: options.hidden, text };
    if (conversation) {
      const answer = await run(buildAgentArgs({ ...common, conversation, resume: true }));
      if (answer !== null) return { text: answer, conversation };
    }
    // a first message, or a conversation that cannot be resumed any more: a new one
    const fresh = randomUUID();
    const answer = await run(buildAgentArgs({ ...common, conversation: fresh, resume: false }));
    return answer === null ? { text: options.failed, conversation } : { text: answer, conversation: fresh };
  };
}
