import { useMemo } from 'react';
import { activeProject, projectsOf } from './projects.ts';
import { useSessions } from './sessions.ts';

/** The projects of the sessions there, and the one the header's filter keeps in sight ('' = all). */
export function useProjects() {
  const sessions = useSessions((s) => s.sessions);
  const seen = useSessions((s) => s.seen);
  const picked = useSessions((s) => s.project);
  return useMemo(() => {
    const projects = projectsOf(Object.values(sessions), seen);
    return { projects, project: activeProject(projects, picked) };
  }, [sessions, seen, picked]);
}
