// What git says a session leaves behind in its folder: files not committed,
// commits not pushed. Read-only, never prompts, never takes a lock.

import { execFile } from 'node:child_process';
import type { GitPending } from '../shared/protocol.ts';

function git(cwd: string, ...args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-c', 'core.quotepath=off', '-c', 'core.fsmonitor=false', ...args],
      { cwd, timeout: 10_000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' } },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
}

const count = (output: string | null): number => Number.parseInt(output?.trim() ?? '', 10) || 0;

/** Commits on HEAD that no other local branch nor any remote branch holds. */
async function commitsOnlyHere(cwd: string, branch: string): Promise<number> {
  return count(await git(cwd, 'rev-list', '--count', 'HEAD', '--not', `--exclude=${branch}`, '--branches', '--remotes'));
}

/**
 * What the repository at `cwd` holds that is not yet safe elsewhere,
 * or null when it is not a repository or nothing is pending.
 */
export async function readGitPending(cwd: string): Promise<GitPending | null> {
  const status = await git(cwd, 'status', '--porcelain', '--ignore-submodules=all');
  if (status === null) return null;
  const dirty = status.split('\n').filter((line) => line.trim() !== '').length;
  const branch = (await git(cwd, 'symbolic-ref', '--short', '-q', 'HEAD'))?.trim() ?? '';
  const detached = branch === '';
  const upstream = detached ? null : await git(cwd, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
  const noUpstream = !detached && upstream === null;
  const unpushed = detached ? 0 : noUpstream ? await commitsOnlyHere(cwd, branch) : count(await git(cwd, 'rev-list', '--count', '@{u}..HEAD'));
  if (dirty === 0 && unpushed === 0) return null;
  return { dirty, unpushed, noUpstream: noUpstream && unpushed > 0, branch: detached ? '' : branch };
}
