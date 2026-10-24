// What the search palette (⌘K) finds, in which order. Pure functions: the palette itself is src/command/SearchPalette.tsx.
import type { SearchHit, SessionInfo, SlashCommand } from '../../shared/protocol.ts';
import { matchesAll } from '../../shared/search.ts';
import { folderName } from '../lib/format.ts';
import { findCommands } from './commands.ts';
import { shownFolder } from './worktrees.ts';
import type { SettingsSection } from './sessions.ts';

export type ResultKind = 'session' | 'message' | 'command' | 'action' | 'setting';
/** The chips over the results: everything, or one kind (the settings count as actions). */
export const FILTERS = ['all', 'session', 'message', 'command', 'action'] as const;
export type Filter = (typeof FILTERS)[number];

export type Result =
  | { kind: 'session'; key: string; session: SessionInfo }
  | { kind: 'message'; key: string; session: SessionInfo; hit: SearchHit }
  | { kind: 'command'; key: string; command: SlashCommand }
  | { kind: 'action'; key: string; action: string; label: string }
  | { kind: 'setting'; key: string; section: SettingsSection; row: string; label: string; sectionLabel: string };

export interface Action { id: string; label: string; words: string }
export interface SettingEntry { section: SettingsSection; row: string; label: string; sectionLabel: string; words: string }

/** A group of results under its heading, in the order they are shown. */
export interface Group { id: ResultKind | 'recent'; results: Result[] }

const MAX = { session: 8, message: 24, command: 6, slash: 60, action: 6, setting: 6, recent: 6 } as const;

/** The query asks for commands: it starts with "/". */
export const isCommandQuery = (query: string) => query.trimStart().startsWith('/');

const sessionText = (session: SessionInfo) => [session.name, session.tag, folderName(shownFolder(session)), session.worktree?.branch, session.command, session.lastMessage].filter(Boolean).join(' ');

/** Sessions whose name, tag, folder, last command or last words hold every word; those named so first, then the latest. */
export function findSessions(sessions: readonly SessionInfo[], query: string): SessionInfo[] {
  const named = (session: SessionInfo) => matchesAll(`${session.name} ${session.tag ?? ''}`, query);
  return sessions
    .filter((session) => matchesAll(sessionText(session), query))
    .sort((a, b) => Number(named(b)) - Number(named(a)) || b.stateSince - a.stateSince);
}

/**
 * Everything the palette shows for `query`: with nothing typed, the latest sessions and the actions; with "/", the
 * commands alone; otherwise every kind, kept to the chosen filter. `hits` are the server's matches in the threads.
 */
export function searchResults(input: {
  query: string; filter: Filter; sessions: readonly SessionInfo[]; hits: readonly SearchHit[]; commands: readonly SlashCommand[];
  actions: readonly Action[]; settings: readonly SettingEntry[];
}): Group[] {
  const { query, filter, sessions, hits, commands, actions, settings } = input;
  const typed = query.trim();
  if (isCommandQuery(typed)) {
    const name = typed.slice(1).split(/\s/)[0];
    return [{ id: 'command', results: findCommands([...commands], name).slice(0, MAX.slash).map((command) => ({ kind: 'command', key: `c:${command.name}`, command })) }];
  }
  const actionResults = (list: readonly Action[]): Result[] => list.map((action) => ({ kind: 'action', key: `a:${action.id}`, action: action.id, label: action.label }));
  if (!typed) {
    const recent = [...sessions].sort((a, b) => b.stateSince - a.stateSince).slice(0, MAX.recent);
    const groups: Group[] = [];
    if (filter === 'all' || filter === 'session') groups.push({ id: 'recent', results: recent.map((session) => ({ kind: 'session', key: `s:${session.id}`, session })) });
    if (filter === 'all' || filter === 'action') groups.push({ id: 'action', results: actionResults(actions) });
    return groups.filter((group) => group.results.length);
  }
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const all: Group[] = [
    { id: 'session', results: findSessions(sessions, typed).slice(0, MAX.session).map((session) => ({ kind: 'session', key: `s:${session.id}`, session })) },
    {
      id: 'message',
      results: hits.flatMap((hit) => {
        const session = byId.get(hit.sessionId);
        return session ? [{ kind: 'message' as const, key: `m:${hit.sessionId}:${hit.seq}`, session, hit }] : [];
      }).slice(0, MAX.message),
    },
    { id: 'command', results: findCommands([...commands], typed).slice(0, MAX.command).map((command) => ({ kind: 'command', key: `c:${command.name}`, command })) },
    { id: 'action', results: actionResults(actions.filter((action) => matchesAll(`${action.label} ${action.words}`, typed)).slice(0, MAX.action)) },
    {
      id: 'setting',
      results: settings.filter((entry) => matchesAll(`${entry.label} ${entry.sectionLabel} ${entry.words}`, typed)).slice(0, MAX.setting)
        .map((entry) => ({ kind: 'setting', key: `p:${entry.row}`, section: entry.section, row: entry.row, label: entry.label, sectionLabel: entry.sectionLabel })),
    },
  ];
  return all.filter((group) => group.results.length && (filter === 'all' || group.id === filter || (filter === 'action' && group.id === 'setting')));
}

/** How many results each chip would show, for the counts on them (nothing typed and "/" leave them out). */
export function filterCounts(groups: readonly Group[]): Record<Filter, number> {
  const count = (kinds: readonly string[]) => groups.filter((group) => kinds.includes(group.id)).reduce((sum, group) => sum + group.results.length, 0);
  return { all: count(['session', 'message', 'command', 'action', 'setting']), session: count(['session']), message: count(['message']), command: count(['command']), action: count(['action', 'setting']) };
}
