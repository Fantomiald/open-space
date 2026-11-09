// Claude Code's roles (sub-agents): .claude/agents/<name>.md, a Markdown file whose frontmatter names the role and says
// what it is for. Read for the external runs' folder and for a trigger's project (a trigger may run as a role, --agent).
import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AgentRole } from '../shared/automata.ts';
import { ROLE_NAME } from '../shared/triggers.ts';

const MAX_FILE = 64 * 1024;
const MAX_ROLES = 200;

/** A frontmatter value: quotes taken off, a list ("[a, b]" or "- a" lines) joined with ", ". */
function frontValue(value: string, items: string[]): string {
  const text = value.trim();
  if (!text && items.length) return items.join(', ');
  const list = /^\[(.*)\]$/.exec(text);
  if (list) return list[1].split(',').map((item) => item.trim().replace(/^["']|["']$/g, '')).filter(Boolean).join(', ');
  return text.replace(/^"(.*)"$|^'(.*)'$/, '$1$2');
}

/** A role (<name>.md): its frontmatter, simple "key: value" lines; null without one. */
export function parseRole(text: string, fileName: string): AgentRole | null {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^﻿/, ''));
  if (!front) return null;
  const fields = new Map<string, { value: string; items: string[] }>();
  let last: { value: string; items: string[] } | null = null;
  for (const line of front[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair) { last = { value: pair[2], items: [] }; fields.set(pair[1].toLowerCase(), last); continue; }
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && last) last.items.push(item[1].trim().replace(/^["']|["']$/g, ''));
    // a folded value ("description: >" then indented lines) goes on
    else if (/^\s+\S/.test(line) && last) last.value = `${last.value.replace(/^[>|]-?$/, '')} ${line.trim()}`.trim();
  }
  const field = (key: string, max: number) => {
    const found = fields.get(key);
    return found ? frontValue(found.value, found.items).slice(0, max) : '';
  };
  return { name: field('name', 80) || fileName.replace(/\.md$/i, ''), description: field('description', 1000), model: field('model', 80) };
}

/** The roles of one .claude/agents folder, by name; none when it does not exist. */
export async function readRoles(folder: string): Promise<AgentRole[]> {
  let names: string[];
  try { names = (await readdir(folder)).filter((name) => name.endsWith('.md') && ROLE_NAME.test(name.slice(0, -3))).sort().slice(0, MAX_ROLES); } catch { return []; }
  const roles: AgentRole[] = [];
  for (const name of names) {
    try {
      const file = path.join(folder, name);
      const info = await stat(file);
      if (!info.isFile() || info.size > MAX_FILE) continue;
      const role = parseRole(await readFile(file, 'utf8'), name);
      if (role && ROLE_NAME.test(role.name)) roles.push(role);
    } catch { /* gone meanwhile */ }
  }
  return roles;
}

/** The roles a session of `cwd` can run as: the project's, then the user's (~/.claude/agents) not shadowed by them. */
export async function rolesFor(cwd: string, home = os.homedir()): Promise<AgentRole[]> {
  const own = await readRoles(path.join(cwd, '.claude', 'agents'));
  const user = await readRoles(path.join(home, '.claude', 'agents'));
  return [...own, ...user.filter((role) => !own.some((mine) => mine.name === role.name))];
}
