// What a session's tool calls gave back, kept short for the thread (Preferences.detailedActions): the lines a command
// wrote, what a search found, how many lines a file read had.
import type { ToolOutput } from '../shared/protocol.ts';
import { DIFF_TOOLS } from './diffs.ts';
import { asArray, asJson, asNumber, asString, type Json } from './json.ts';

/** The lines an output keeps (the rest is counted: the thread shows the start, the session's log stays small). */
export const MAX_OUTPUT_LINES = 60;
const MAX_LINE = 300;
/** What Claude Code adds to a result for the model only ("Prefer browser_batch…"). */
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

/** The text of a tool result's content: a string, or text blocks. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return asArray(content).map(asJson).filter((block) => block.type === 'text').map((block) => asString(block.text)).join('\n');
}

/**
 * What a call of `tool` gave back (checked with 2.1.318, fixtures/actions-turn.jsonl): the lines of its result's text,
 * or for a Read only how many lines the file had (`file.numLines`), as Claude Code shows it. Null for the calls shown
 * with their diff (Edit, MultiEdit, Write) and for a result without text.
 */
export function toolOutput(tool: string, content: unknown, result: Json): ToolOutput | null {
  if (DIFF_TOOLS.has(tool)) return null;
  if (tool === 'Read') {
    const total = asNumber(asJson(result.file).numLines);
    return total ? { lines: [], total, read: true } : null;
  }
  const text = textOf(content).replace(REMINDER, '').replace(/\s+$/, '');
  if (!text.trim()) return null;
  const lines = text.split('\n');
  return { lines: lines.slice(0, MAX_OUTPUT_LINES).map((line) => line.slice(0, MAX_LINE)), total: lines.length };
}
