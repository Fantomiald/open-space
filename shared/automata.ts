// The automatons: headless `claude -p` runs that a local orchestrator of the user's launches on its own (launchd, cron…),
// outside Open Space. Open Space only watches them, read-only, from the folder named in the settings
// (Preferences.automataFolder): what runs, in which role, on which task, and what it does. See server/automata.ts.
import { isFullPath } from './paths.ts';

/** The setting as typed: a full path (or from the home, "~/…") to a folder, or nothing (the feature is off). */
export const isAutomataFolder = (folder: string) => folder.trim() === '' || isFullPath(folder.trim());

/** Where a run is: as its file says, or `interrupted` when it says running but its process is gone. */
export const RUN_STATUSES = ['running', 'done', 'failed', 'interrupted'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** A run of the orchestrator (<folder>/state/runs/<id>.json). Times in ms; `endedAt` null while it runs. */
export interface AutomatonRun {
  id: string;
  role: string;
  task: string;
  project: string;
  sessionId: string;
  cwd: string;
  startedAt: number;
  endedAt: number | null;
  status: RunStatus;
  pid: number | null;
  /** the run that started this one (a coordinator's), or null */
  parent: string | null;
}

export const TASK_STATUSES = ['todo', 'running', 'waiting', 'done', 'failed'] as const;
export type AutomatonTaskStatus = (typeof TASK_STATUSES)[number];

/** A task of the orchestrator (<folder>/state/tasks/<id>.json), when it keeps them. */
export interface AutomatonTask {
  id: string;
  title: string;
  project: string;
  status: AutomatonTaskStatus;
  /** what it may cost at most, as the orchestrator writes it */
  ceiling: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  runs: string[];
}

/** A role of the catalogue (<folder>/.claude/agents/<name>.md, its frontmatter). */
export interface AutomatonRole {
  name: string;
  description: string;
  model: string;
  tools: string;
  authority: string;
}

/** A sub-agent at work in a run (a coordinator's helper): the id of the Agent call that launched it, its role, its task. */
export interface AutomatonAgent {
  id: string;
  role: string;
  task: string;
}

/**
 * What the page is told: `folder` says whether the feature is off (no folder set), the folder missing (or unreadable),
 * or watched. `running`: the runs at work, oldest first; `recent`: the ended ones (done, failed, interrupted), newest first.
 */
export interface AutomataState {
  folder: 'off' | 'missing' | 'ok';
  running: AutomatonRun[];
  recent: AutomatonRun[];
  tasks: AutomatonTask[];
  roles: AutomatonRole[];
  /** the sub-agents at work, by the run that launched them (read from its transcript) */
  agents: Record<string, AutomatonAgent[]>;
}

export const NO_AUTOMATA: AutomataState = { folder: 'off', running: [], recent: [], tasks: [], roles: [], agents: {} };

/** A run's id as the orchestrator names its file: letters, digits, ".", "_", "-", nothing that leaves the folder. */
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
