// What the session thread shows of a tool call or a permission request (a path, a command, a query),
// plus the first names given to sub-agents and small text helpers.

/** First names for sub-agents (never the same twice in a session). */
export const SUBAGENT_NAMES = ['Bob', 'Lulu', 'Gaston', 'Nina', 'Momo', 'Kiki', 'Fifi', 'Riri', 'Loulou', 'Zazie', 'Titi', 'Coco'];

export const cut = (s: unknown, n = 60) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
/** Like `cut`, but keeps the end of the text (where a message usually lands: the conclusion, the question). */
export const tail = (s: unknown, n = 60) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `…${t.slice(t.length - n + 1)}` : t;
};

/** The action part of an MCP tool name: mcp__claude_ai_Gmail__search_threads -> "search threads" */
const mcpAction = (tool: string) => (tool.split('__')[2] ?? '').replace(/[_-]+/g, ' ');

/** The detail of a tool call shown in the thread. Never throws on odd input. */
export function actDetail(tool: string, input: Record<string, unknown> | undefined): string {
  const i = input ?? {};
  switch (tool) {
    case 'WebSearch': case 'ToolSearch': return String(i.query ?? '');
    case 'WebFetch': return String(i.url ?? '');
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': return String(i.file_path ?? '');
    case 'NotebookEdit': return String(i.notebook_path ?? '');
    case 'Glob': return String(i.pattern ?? '');
    case 'Grep': return `${i.pattern ?? ''}${i.path ? ` dans ${i.path}` : ''}`;
    case 'LS': return String(i.path ?? '');
    case 'Bash': return String(i.command ?? '');
    case 'Skill': return String(i.args ?? '');
  }
  return tool.startsWith('mcp__') ? mcpAction(tool) : '';
}

/** Replaces the session folder path with "." wherever it appears in full. */
export function relToFolder(text: string, folder: string): string {
  if (!folder) return text;
  const esc = folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`${esc}(?=$|[/"'\\s])`, 'g'), '.').replace(/(^|[\s"'])\.\//g, '$1');
}

/** The command made easier to read: the session folder becomes "." and a leading `cd <folder> &&` is dropped. */
export function readableCommand(cmd: unknown, folder: string): string {
  return relToFolder(String(cmd ?? ''), folder).trim().replace(/^cd\s+(?:"\."|'\.'|\.)\s*&&\s*/, '');
}

const DETAIL_MAX = 1500;

/** What a permission request is about, in full: the command, the path, the URL, or the tool input. */
export function permissionDetail(tool: string, input: Record<string, unknown> | undefined, folder: string): string {
  const i = input ?? {};
  if (tool === 'Bash') return readableCommand(i.command, folder);
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') return String(i.file_path ?? i.notebook_path ?? '');
  if (tool === 'WebFetch') return String(i.url ?? '');
  const detail = relToFolder(JSON.stringify(i, null, 2), folder);
  return detail.length > DETAIL_MAX ? `${detail.slice(0, DETAIL_MAX - 1)}…` : detail;
}
