// The environment handed to `claude` (and therefore to every command its Bash tool runs).
// Allow-list only: a secret exported in the shell that started the bridge must not reach the agents.
// API keys are deliberately absent so the CLI always uses the logged-in subscription.
import path from 'node:path';

const ALLOWED_NAMES = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TZ',
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT',
  'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432',
  'CLAUDE_CODE_GIT_BASH_PATH',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM',
  // ssh and git over ssh through the user's agent (the socket path, not a key)
  'SSH_AUTH_SOCK',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME',
  // subscription authentication and Claude Code configuration location
  'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN',
  // network setup (corporate proxies, custom certificate authorities)
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE',
] as const;

/** Extra variable names the user explicitly lets through (OFFICE_ENV_PASSTHROUGH="GH_TOKEN,AWS_PROFILE"). */
export function parsePassthrough(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((name) => name.trim()).filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !name.startsWith('ANTHROPIC_'));
}

/**
 * `npm start` puts the bridge's own tools first in PATH: <dir>/node_modules/.bin for the project and every parent folder,
 * plus npm's node-gyp-bin. Handed to the agents, they would make a bare `tsc` or `vite` in another project run this one's copy.
 */
export function withoutNpmEntries(searchPath: string, delimiter = path.delimiter): string {
  return searchPath.split(delimiter).filter((entry) => entry && !/[\\/]node_modules[\\/]\.bin[\\/]?$/i.test(entry) && !/[\\/]node-gyp-bin[\\/]?$/i.test(entry)).join(delimiter);
}

/**
 * Set for every session whatever the shell has. CLAUDE_CODE_ARTIFACT: `claude -p` leaves out the Artifact tools
 * (Artifact, ArtifactComments, ArtifactData) unless it is 1; undocumented, checked on 2.1.301 (28 tools without it,
 * the same plus those 3 with it), so Anthropic may rename or drop it.
 */
const FIXED: Readonly<Record<string, string>> = { CLAUDE_CODE_ARTIFACT: '1' };

export function buildClaudeEnvironment(source: NodeJS.ProcessEnv, passthrough: readonly string[] = []): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...FIXED };
  for (const name of [...ALLOWED_NAMES, ...passthrough]) {
    const key = process.platform === 'win32' ? Object.keys(source).find((key) => key.toLowerCase() === name.toLowerCase()) : name;
    const value = key === undefined ? undefined : source[key];
    if (value !== undefined) result[name] = value;
  }
  if (result.PATH !== undefined) result.PATH = withoutNpmEntries(result.PATH);
  return result;
}
