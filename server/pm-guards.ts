// What the PM api of index.ts decides before acting, kept apart to be tested without a running Open Space: who gets the
// pm_* tools, and what a PM's worker starts with. The trust of its folder stays with the start itself (startUnasked).
import { type Effort, EFFORTS, type SessionInfo, type SessionOptions } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import { MODEL_PATTERN } from './messages.ts';
import { resolveAllowedDirectory } from './paths.ts';

/**
 * The session gets the pm_* tools: a PM, never a trigger's run, nor a session of a folder not trusted (it has no
 * open-space MCP server), and only while the setting is on.
 */
export function actsAsPm(session: SessionInfo | undefined, enabled: boolean): boolean {
  return !!session?.pm && !session.trigger && !session.untrusted && enabled;
}

/** What pm_worker_start asks for. */
export interface WorkerAsk { brief: string; cwd?: string; model?: string; effort?: string; isolate?: boolean }

/**
 * The options a worker of `lead` starts with: in the PM's permission mode, never another; in the PM's folder (its main
 * checkout when it works on a branch) or the one asked, inside the allowed roots; on the model and effort asked, else the
 * settings'; its brief followed by the worker's rules. Throws when the PM is gone, the folder not allowed or the model
 * not a model's name.
 */
export function workerOptions(lead: SessionInfo | undefined, pm: string, ask: WorkerAsk, settings: { roots: readonly string[]; model: string; effort: Effort | '' }): SessionOptions {
  if (!lead) throw new Error(st.triggers.mcp.noSession(pm));
  const folder = resolveAllowedDirectory(ask.cwd ?? lead.worktree?.home ?? lead.cwd, settings.roots);
  if (!folder) throw new Error(st.sessions.outsideRoots);
  if (ask.model && !MODEL_PATTERN.test(ask.model)) throw new Error(st.triggers.errors.model);
  const model = ask.model || settings.model;
  const effort = EFFORTS.find((one) => one === ask.effort) ?? (settings.effort || undefined);
  return {
    cwd: folder, text: `${ask.brief}${st.pm.briefFooter(lead.name)}`, permissionMode: lead.permissionMode,
    ...(model ? { model } : {}), ...(effort ? { effort } : {}), ...(ask.isolate ? { isolate: {} } : {}),
  };
}
