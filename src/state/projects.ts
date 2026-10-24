import { folderName } from '../lib/format.ts';
import { attentionKind, type SeenSequences } from './queue.ts';
import type { SessionInfo } from '../../shared/protocol.ts';

/** A folder sessions work in, as the header's filter shows it: its name, how many sessions, whether one waits for the user. */
export interface Project { folder: string; name: string; count: number; waiting: boolean }

/** The folder a session works for: the one asked for in the main checkout when it runs on a branch of its own. */
export const projectOf = (session: SessionInfo) => session.worktree?.home ?? session.cwd;

/** Whether a session belongs to the project picked in the header ('' = all of them). */
export const inProject = (session: SessionInfo, project: string) => !project || projectOf(session) === project;

/** The projects of these sessions, by name; two folders with the same name show their parent too ("web/app", "mobile/app"). */
export function projectsOf(sessions: readonly SessionInfo[], seen: SeenSequences): Project[] {
  const byFolder = new Map<string, Project>();
  for (const session of sessions) {
    const folder = projectOf(session);
    const project = byFolder.get(folder) ?? { folder, name: folderName(folder), count: 0, waiting: false };
    project.count += 1;
    project.waiting ||= attentionKind(session, seen) !== null;
    byFolder.set(folder, project);
  }
  const projects = [...byFolder.values()];
  const shared = new Set(projects.filter((project) => projects.some((other) => other !== project && other.name === project.name)).map(({ name }) => name));
  for (const project of projects) {
    if (shared.has(project.name)) project.name = project.folder.split(/[\\/]/).filter(Boolean).slice(-2).join('/');
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

/** The project picked, while sessions of two projects or more are there; otherwise none: the filter is not shown. */
export const activeProject = (projects: readonly Project[], picked: string) => (projects.length > 1 && projects.some((project) => project.folder === picked) ? picked : '');
