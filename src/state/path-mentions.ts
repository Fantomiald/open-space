// The files and folders "@" offers in a message field (shared/file-mentions.ts), asked of the server as the user types
// (see usePathMentions): only the answer to the latest question is kept, with the folder it was asked for.
import { create } from 'zustand';
import type { PathEntry } from '../../shared/file-mentions.ts';
import type { ClientMessage } from '../../shared/protocol.ts';

/** Where "@" looks: a session's folder (its own, the server knows it), or the launcher's folder before its session exists. */
export type PathScope = { sessionId: string } | { cwd: string };

export const scopeKey = (scope: PathScope) => ('sessionId' in scope ? `session:${scope.sessionId}` : `folder:${scope.cwd}`);

/** The latest question sent: an answer to an older one, overtaken by what was typed since, is dropped. */
let asked = { id: 0, scope: '' };

interface PathAnswers { latest: { scope: string; query: string; paths: PathEntry[] } | null }

export const usePathAnswers = create<PathAnswers>(() => ({ latest: null }));

export function askPaths(send: (message: ClientMessage) => boolean, scope: PathScope, query: string): void {
  asked = { id: asked.id + 1, scope: scopeKey(scope) };
  send({ t: 'findPaths', id: asked.id, query, ...scope });
}

/** The server's answer (the 'paths' message), kept when it is for the latest question. */
export function heardPaths(id: number, query: string, paths: PathEntry[]): void {
  if (id === asked.id) usePathAnswers.setState({ latest: { scope: asked.scope, query, paths } });
}
