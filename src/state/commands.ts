// Which slash commands the palette offers, in which order. Pure functions.
import type { SlashCommand } from '../../shared/protocol.ts';

/**
 * Built-in commands that make no sense when Claude Code is driven from this page (checked against the
 * commands reference, code.claude.com/docs/en/commands):
 * - clear: starts a new conversation, while Open Space keeps resuming the session's own id;
 * - color, focus: change the terminal prompt bar and view, which do not exist here;
 * - heapdump: memory diagnostics, already hidden from Claude Code's own menu.
 */
const UNUSABLE_HERE: ReadonlySet<string> = new Set(['clear', 'color', 'focus', 'heapdump']);

/** Internal commands (`__name`) and MCP prompts (`mcp__server__prompt`) are not meant to be typed. */
export const isOffered = (command: SlashCommand) => !command.name.startsWith('__') && !command.name.startsWith('mcp__') && !UNUSABLE_HERE.has(command.name);

/** A plugin's command ("plugin:command"): the user's own tools, offered before Claude Code's. */
const isPlugin = (command: SlashCommand) => command.name.includes(':');

function matches(command: SlashCommand, words: string[]) {
  const text = `${command.name} ${command.description ?? ''}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

/** The offered commands matching `query` (every word, in the name or the description), the plugins' first. */
export function findCommands(commands: readonly SlashCommand[], query: string): SlashCommand[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = commands.filter((command) => isOffered(command) && matches(command, words));
  return [...found.filter(isPlugin), ...found.filter((command) => !isPlugin(command))];
}

/** Open Space's own commands, offered with Claude Code's in a session's field. */
const OWN_COMMANDS: readonly SlashCommand[] = [
  { name: 'btw', description: 'Une question à côté : la session répond sans s’interrompre, et ça n’entre pas dans sa conversation', argumentHint: '<ta question>' },
];

/** While `text` is a command name being typed ("/ki", before any space): the commands to suggest, else none. */
export function commandSuggestions(commands: readonly SlashCommand[], text: string): SlashCommand[] {
  const typing = /^\/(\S*)$/.exec(text);
  const all = [...OWN_COMMANDS, ...commands.filter((command) => !OWN_COMMANDS.some((own) => own.name === command.name))];
  return typing ? findCommands(all, typing[1]) : [];
}

/** The question of a "/btw <question>" message (empty when there is none yet), or null for any other message. */
export function asideQuestion(text: string): string | null {
  const match = /^\/btw(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match ? (match[1] ?? '').trim() : null;
}
