// The picture of a session's browser in its window (BrowserView): where the pointer is on the page shown. Pure functions.
import { MODIFIERS } from '../../shared/browser.ts';
import type { SubagentInfo } from '../../shared/protocol.ts';
import type { FeedItem } from './feed.ts';

type Rect = { left: number; top: number; width: number; height: number };

/**
 * The pointer over the page, as fractions of it: the picture keeps its proportions inside its box (object-fit:
 * contain), with bands around it; null over a band or before the first picture.
 */
export function pictureFraction(box: Rect, picture: { width: number; height: number }, pointer: { x: number; y: number }): { x: number; y: number } | null {
  if (!picture.width || !picture.height) return null;
  const scale = Math.min(box.width / picture.width, box.height / picture.height);
  const width = picture.width * scale, height = picture.height * scale;
  const x = (pointer.x - box.left - (box.width - width) / 2) / width;
  const y = (pointer.y - box.top - (box.height - height) / 2) / height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

export const modifiersOf = (event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) =>
  (event.altKey ? MODIFIERS.alt : 0) | (event.ctrlKey ? MODIFIERS.ctrl : 0) | (event.metaKey ? MODIFIERS.meta : 0) | (event.shiftKey ? MODIFIERS.shift : 0);

/** A tool of the session's Playwright server (any name the user gave it): the agent is using its browser. */
export const isBrowserTool = (tool: string) => /^mcp__[^_].*__browser_/.test(tool);

/**
 * The turn under way is at work in the browser: its agent's last tool is one of Playwright's. Not only while a call
 * runs: they last a moment, and the agent thinks between them.
 */
export function drivesBrowser(items: readonly FeedItem[]): boolean {
  for (let at = items.length - 1; at >= 0; at--) {
    const item = items[at];
    if (item.kind === 'turn') return false;
    if (item.kind === 'tool' && item.agent === null) return isBrowserTool(item.tool);
  }
  return false;
}

/** The first names of the session's testers at work, by lane: the sub-agent of type browser-tester-<lane>. */
export function testersAtWork(subagents: readonly SubagentInfo[]): Record<number, string> {
  const names: Record<number, string> = {};
  for (const agent of subagents) {
    const lane = /^browser-tester-(\d+)$/.exec(agent.type)?.[1];
    if (lane) names[Number(lane)] = agent.name;
  }
  return names;
}
