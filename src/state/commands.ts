// Which slash commands the palette offers, in which order. Pure functions.
import type { InspectView, SlashCommand } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';

/**
 * Built-in commands that make no sense when Claude Code is driven from this page (checked against the
 * commands reference, code.claude.com/docs/en/commands, and each one sent to claude -p 2.1.302):
 * - color, focus: change the terminal prompt bar and view, which do not exist here;
 * - heapdump: memory diagnostics, already hidden from Claude Code's own menu;
 * - fast: "not available in the Agent SDK";
 * - rename: renames Claude Code's conversation, not the session in Open Space (its own rename does both);
 * - agents, extra-usage: removed and renamed (to /usage-credits); workflow-launch-exec: internal.
 */
const UNUSABLE_HERE: ReadonlySet<string> = new Set(['color', 'focus', 'heapdump', 'fast', 'rename', 'agents', 'extra-usage', 'workflow-launch-exec']);

/** Commands Open Space answers with a view of its own in the session panel, instead of the text Claude Code gives -p. */
const NATIVE_VIEWS: Readonly<Record<string, InspectView>> = { mcp: 'mcp', context: 'context', usage: 'usage' };

/** The view a message asks for ("/mcp" alone), else null. */
export const nativeView = (text: string): InspectView | null => NATIVE_VIEWS[/^\/([\w-]+)$/.exec(text.trim())?.[1] ?? ''] ?? null;

/** The values a command takes, offered once its name is typed: without one, Claude Code only answers "Usage: …". */
const OPTIONS: Readonly<Record<string, readonly string[]>> = {
  effort: ['low', 'medium', 'high', 'xhigh', 'max', 'auto'],
  model: ['default', 'opus', 'sonnet', 'haiku', 'fable', 'opusplan', 'opus[1m]', 'sonnet[1m]', 'fable[1m]'],
  advisor: ['fable', 'opus', 'sonnet', 'off'],
  'output-style': ['default', 'Proactive', 'Concise', 'Explanatory', 'Learning'],
};

/** While `text` is a command with options and its value being typed ("/effort h"): the values to suggest, else none. */
function optionSuggestions(text: string): SlashCommand[] {
  const typing = /^\/([\w-]+) (\S*)$/.exec(text);
  const values = typing ? OPTIONS[typing[1]] : undefined;
  if (!typing || !values) return [];
  const words = t.common.commandOptions as Readonly<Record<string, Readonly<Record<string, string>> | undefined>>;
  return values.filter((value) => value.toLowerCase().startsWith(typing[2].toLowerCase()))
    .map((value) => ({ name: `${typing[1]} ${value}`, description: words[typing[1]]?.[value] }));
}

/** Internal commands (`__name`) and MCP prompts (`mcp__server__prompt`) are not meant to be typed. */
export const isOffered = (command: SlashCommand) => !command.name.startsWith('__') && !command.name.startsWith('mcp__') && !UNUSABLE_HERE.has(command.name);

/** A plugin's command ("plugin:command"): the user's own tools, offered before Claude Code's. */
const isPlugin = (command: SlashCommand) => command.name.includes(':');

function matches(command: SlashCommand, words: string[]) {
  const text = `${command.name} ${command.description ?? ''}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

/**
 * How well a command's name fits what is typed: the name itself, then a name (or a plugin command's own part, after
 * "plugin:") starting with it, then one containing it, then a match in the description only.
 */
function closeness(command: SlashCommand, word: string) {
  const name = command.name.toLowerCase();
  if (!word || name === word) return 0;
  if (name.startsWith(word) || name.split(':').pop()!.startsWith(word)) return 1;
  return name.includes(word) ? 2 : 3;
}

/** The offered commands matching `query` (every word, in the name or the description): the closest names first, the plugins' first among equals. */
export function findCommands(commands: readonly SlashCommand[], query: string): SlashCommand[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = commands.filter((command) => isOffered(command) && matches(command, words));
  const ordered = [...found.filter(isPlugin), ...found.filter((command) => !isPlugin(command))];
  return ordered.map((command, index) => ({ command, index, closeness: closeness(command, words[0] ?? '') }))
    .sort((a, b) => a.closeness - b.closeness || a.index - b.index).map(({ command }) => command);
}

/** Open Space's own commands, offered with Claude Code's in a session's field. */
const ownCommands = (): readonly SlashCommand[] => [{ name: 'btw', ...t.common.ownCommands.btw }];

/** While `text` is a command name being typed ("/ki", before any space): the commands to suggest, else none. */
export function commandSuggestions(commands: readonly SlashCommand[], text: string): SlashCommand[] {
  const typing = /^\/(\S*)$/.exec(text);
  const own = ownCommands();
  const all = [...own, ...commands.filter((command) => !own.some((ownCommand) => ownCommand.name === command.name))];
  return typing ? findCommands(all, typing[1]) : optionSuggestions(text);
}

/** The question of a "/btw <question>" message (empty when there is none yet), or null for any other message. */
export function asideQuestion(text: string): string | null {
  const match = /^\/btw(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match ? (match[1] ?? '').trim() : null;
}
