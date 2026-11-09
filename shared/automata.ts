// The external runs: headless `claude -p` that another program of the user's launches on its own (launchd, cron, a
// script), outside Open Space. Open Space only watches them, read-only, from the folder named in the settings
// (Preferences.automataFolder), through a small generic contract (AutomatonRun). See server/automata.ts.
// The sessions Open Space starts itself from a trigger (shared/triggers.ts) are ordinary sessions, not these.
import { isFullPath } from './paths.ts';

/** The setting as typed: a full path (or from the home, "~/…") to a folder, or nothing (the feature is off). */
export const isAutomataFolder = (folder: string) => folder.trim() === '' || isFullPath(folder.trim());

/** Where a run is: as its file says, or `interrupted` when it says running but its process is gone. */
export const RUN_STATUSES = ['running', 'done', 'failed', 'interrupted'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * A run of another program (<folder>/runs/<id>.json, or <folder>/state/runs/<id>.json): a `claude -p` it launched with
 * `--session-id`, so that its transcript can be read. Times in ms; `endedAt` null while it runs. `role` (a name of
 * .claude/agents) and `task` (a few words) are optional.
 */
export interface AutomatonRun {
  id: string;
  sessionId: string;
  cwd: string;
  status: RunStatus;
  pid: number | null;
  startedAt: number;
  endedAt: number | null;
  role: string;
  task: string;
}

/** A role of Claude Code (.claude/agents/<name>.md, its frontmatter): what it is for, and its model when it says. */
export interface AgentRole {
  name: string;
  description: string;
  model: string;
}

/** A sub-agent at work in a run: the id of the Agent call that launched it, its role, its task. */
export interface AutomatonAgent {
  id: string;
  role: string;
  task: string;
}

/**
 * What the page is told: `folder` says whether the external runs are off (no folder set), the folder missing (or
 * unreadable), or watched. `running`: the runs at work, oldest first; `recent`: the ended ones, newest first.
 */
export interface AutomataState {
  folder: 'off' | 'missing' | 'ok';
  running: AutomatonRun[];
  recent: AutomatonRun[];
  /** the roles of <folder>/.claude/agents */
  roles: AgentRole[];
  /** the sub-agents at work, by the run that launched them (read from its transcript) */
  agents: Record<string, AutomatonAgent[]>;
}

export const NO_AUTOMATA: AutomataState = { folder: 'off', running: [], recent: [], roles: [], agents: {} };

/** A run's id as its program names its file: letters, digits, ".", "_", "-", nothing that leaves the folder. */
export const RUN_ID = /^[\w][\w.-]{0,127}$/;

/** The id the room and the page give an automaton, apart from the sessions'. */
export const automatonPersonId = (runId: string) => `automaton:${runId}`;
/** A run's sub-agent in the room: a person of its own, apart from the run's. */
export const automatonAgentPersonId = (runId: string, agentId: string) => `automaton:${runId}/${agentId}`;
export const runOfPerson = (personId: string): string | null => (personId.startsWith('automaton:') ? personId.slice('automaton:'.length) : null);

/** A role's name as people read it: "code-reviewer" -> "Code reviewer". */
export function roleLabel(role: string): string {
  const words = role.trim().replace(/[-_]+/g, ' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '?';
}
