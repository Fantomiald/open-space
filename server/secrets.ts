// The keys the user gives a session (shared/secrets.ts): kept in memory only, never logged nor sent to the page, and
// used by the agent through `os-secret`, a script Open Space writes and puts first in the sessions' PATH. The script
// talks to /secrets/<session>/<key>/<action> (key = HMAC of the secret, given in the session's environment only).
import { createHmac } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isSecretName, MAX_SECRET_LENGTH, MAX_SECRETS, SECRET_TTL_MS, type SecretEntry } from '../shared/secrets.ts';
import { resolveAllowedDirectory } from './paths.ts';

export const secretsKey = (secret: string, sessionId: string) => createHmac('sha256', secret).update(`secrets:${sessionId}`).digest('hex').slice(0, 32);

interface Kept { value: string; at: number }

/** The keys of every session, by name. `onChange`: a session's names changed (given, forgotten, expired). */
export class SecretStore {
  private kept = new Map<string, Map<string, Kept>>();
  private onChange: (sessionId: string) => void;
  private now: () => number;

  constructor(onChange: (sessionId: string) => void, now: () => number = Date.now) {
    this.onChange = onChange;
    this.now = now;
  }

  /** Keeps the valid entries (a later one wins over an earlier one of the same name); returns the names kept. */
  set(sessionId: string, entries: readonly SecretEntry[]): string[] {
    const keys = this.kept.get(sessionId) ?? new Map<string, Kept>();
    const kept: string[] = [];
    for (const { name, value } of entries) {
      if (!isSecretName(name) || !value || value.length > MAX_SECRET_LENGTH) continue;
      if (!keys.has(name) && keys.size >= MAX_SECRETS) continue;
      keys.set(name, { value, at: this.now() });
      if (!kept.includes(name)) kept.push(name);
    }
    if (kept.length) { this.kept.set(sessionId, keys); this.onChange(sessionId); }
    return kept;
  }

  get(sessionId: string, name: string): string | null {
    const found = this.kept.get(sessionId)?.get(name);
    return found && this.now() - found.at < SECRET_TTL_MS ? found.value : null;
  }

  names(sessionId: string): string[] {
    const keys = this.kept.get(sessionId);
    return keys ? [...keys].filter(([, { at }]) => this.now() - at < SECRET_TTL_MS).map(([name]) => name).sort() : [];
  }

  /** Forgets one key, or all the keys of the session. */
  drop(sessionId: string, name?: string) {
    const keys = this.kept.get(sessionId);
    if (!keys) return;
    if (name === undefined) this.kept.delete(sessionId);
    else if (!keys.delete(name)) return;
    else if (!keys.size) this.kept.delete(sessionId);
    this.onChange(sessionId);
  }

  /** Forgets the keys given more than SECRET_TTL_MS ago. */
  sweep() {
    for (const [sessionId, keys] of this.kept) {
      const before = keys.size;
      for (const [name, { at }] of keys) if (this.now() - at >= SECRET_TTL_MS) keys.delete(name);
      if (!keys.size) this.kept.delete(sessionId);
      if (keys.size !== before) this.onChange(sessionId);
    }
  }
}

/** A value as a .env line takes it: bare when it is plain, otherwise in double quotes (what dotenv and Laravel read back). */
export function envValue(value: string): string {
  return /^[\w./:@+,-]*$/.test(value) ? value : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** The text of a .env file with `name` set to `value`: its line replaced where it was (an `export` kept), else added at the end. */
export function withEnvLine(text: string, name: string, value: string): string {
  const line = new RegExp(`^(\\s*(?:export\\s+)?)${name}\\s*=.*$`, 'm');
  if (line.test(text)) return text.replace(line, (_, start: string) => `${start}${name}=${envValue(value)}`);
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${name}=${envValue(value)}\n`;
}

/**
 * Where an env file asked by the agent (relative to the folder it runs in) really is, if inside a folder the sessions may
 * work in; a link is followed and checked too. Its folder must exist.
 */
export function envFileAt(cwd: string, file: string, roots: readonly string[]): string | null {
  if (!file || file.includes('\0') || !path.isAbsolute(cwd)) return null;
  const wanted = path.resolve(cwd, file);
  const folder = resolveAllowedDirectory(path.dirname(wanted), roots);
  if (!folder) return null;
  const target = path.join(folder, path.basename(wanted));
  if (!existsSync(target)) return target;
  const real = realpathSync(target);
  if (!lstatSync(real).isFile() || !resolveAllowedDirectory(path.dirname(real), roots)) return null;
  return real;
}

export function writeEnvFile(file: string, name: string, value: string) {
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, withEnvLine(before, name, value), { mode: 0o600 });
}

/** What a session's `os-secret` asks for; `form`: its fields, `cwd` the folder the command runs in. */
export interface SecretsRequest { sessionId: string; action: string; form: URLSearchParams }
export interface SecretsReply { status: number; text: string }

export interface SecretsApiDeps {
  store: SecretStore;
  roots: () => readonly string[];
  /** asks the user for the keys missing (null: refused, or the session's turn ended meanwhile); throws when the session cannot ask now */
  ask: (sessionId: string, names: string[], why: string) => Promise<string[] | null>;
  /** puts a cookie in the session's own browser */
  setCookie: (sessionId: string, cookie: { name: string; value: string; url: string }) => Promise<void>;
}

const NAMES_SEPARATOR = /[\s,]+/;

/** The answers of /secrets/…: plain text, read by the agent (in English, like the script's own messages). */
export async function answerSecrets({ sessionId, action, form }: SecretsRequest, deps: SecretsApiDeps): Promise<SecretsReply> {
  const { store } = deps;
  const name = form.get('name') ?? '';
  const missing = (key: string) => ({ status: 404, text: `No key named ${key}: ask the user for it with \`os-secret ask ${key}\`.` });
  switch (action) {
    case 'list': {
      const names = store.names(sessionId);
      return { status: 200, text: names.length ? names.join('\n') : 'No key yet.' };
    }
    case 'ask': {
      const names = [...new Set((form.get('names') ?? '').split(NAMES_SEPARATOR).filter(Boolean))];
      if (!names.length || !names.every(isSecretName)) return { status: 400, text: 'Give the names of the keys, as environment variables (GEMINI_API_KEY).' };
      const held = store.names(sessionId);
      const asked = names.filter((each) => !held.includes(each));
      if (asked.length) {
        let given: string[] | null;
        try { given = await deps.ask(sessionId, asked, (form.get('why') ?? '').slice(0, 500)); } catch (error) { return { status: 409, text: String(error instanceof Error ? error.message : error) }; }
        if (!given) return { status: 409, text: 'The user did not give the keys.' };
      }
      const now = store.names(sessionId);
      return { status: 200, text: `Ready: ${names.filter((each) => now.includes(each)).join(', ') || 'none'}. Other keys given: ${now.filter((each) => !names.includes(each)).join(', ') || 'none'}.` };
    }
    case 'value': {
      const value = store.get(sessionId, name);
      return value === null ? missing(name) : { status: 200, text: value };
    }
    case 'env': {
      const value = store.get(sessionId, name);
      if (value === null) return missing(name);
      const variable = form.get('as') || name;
      if (!isSecretName(variable)) return { status: 400, text: `${variable} is not a valid variable name.` };
      const file = envFileAt(form.get('cwd') ?? '', form.get('file') || '.env', deps.roots());
      if (!file) return { status: 400, text: 'That file is outside the folders Open Space works in, or its folder does not exist.' };
      writeEnvFile(file, variable, value);
      return { status: 200, text: `${variable} written in ${file}.` };
    }
    case 'cookie': {
      const value = store.get(sessionId, name);
      if (value === null) return missing(name);
      const url = form.get('url') ?? '';
      if (!/^https?:\/\//.test(url)) return { status: 400, text: 'Give the address of the site (https://…).' };
      const cookie = form.get('as') || name;
      try { await deps.setCookie(sessionId, { name: cookie, value, url }); } catch (error) { return { status: 409, text: `Cannot set the cookie: ${error instanceof Error ? error.message : String(error)}` }; }
      return { status: 200, text: `Cookie ${cookie} set for ${url} in your browser.` };
    }
    case 'forget':
      if (store.get(sessionId, name) === null) return missing(name);
      store.drop(sessionId, name);
      return { status: 200, text: `${name} forgotten.` };
    default:
      return { status: 404, text: 'Unknown action.' };
  }
}

/** The `os-secret` command (bash: macOS, Linux, and Git Bash under Windows, which Claude Code's Bash tool runs). */
export const SCRIPT = String.raw`#!/usr/bin/env bash
# os-secret: the keys the user gave this session in Open Space, used without ever printing them.
base=$OPEN_SPACE_SECRETS
if [ -z "$base" ]; then echo "os-secret only works in an Open Space session." >&2; exit 2; fi
wait=30
# the body, then the status on a line of its own
call() { local action=$1; shift; curl -sS --max-time "$wait" -w '\n%{http_code}' "$base/$action" --data-urlencode "cwd=$PWD" "$@"; }
# prints the body, fails unless the status is 200
reply() { local out; out=$(call "$@") || return 1; printf '%s\n' "$out" | sed '$d'; [ "$(printf '%s\n' "$out" | tail -n 1)" = 200 ]; }
usage() {
  cat <<'EOF'
os-secret ask NAME... [--why "what it is for"]   asks the user for keys (a box in Open Space, waits up to 10 min)
os-secret list                                    the names of the keys given (never their values)
os-secret env NAME [FILE] [--as VAR]              writes NAME into a .env file (default .env here), replacing its line
os-secret run NAME... -- COMMAND...               runs COMMAND with the keys as environment variables, output masked
os-secret cookie NAME URL [--as COOKIE]           puts the key as a cookie for URL in your Open Space browser
os-secret forget NAME                             forgets a key
EOF
}
command=$1
[ $# -gt 0 ] && shift
case "$command" in
  ask)
    why=""; names=""
    while [ $# -gt 0 ]; do
      case "$1" in --why) why=$2; shift; shift ;; *) names="$names $1"; shift ;; esac
    done
    wait=610
    reply ask --data-urlencode "names=$names" --data-urlencode "why=$why" ;;
  list) reply list ;;
  env)
    name=$1; [ $# -gt 0 ] && shift; file=""; as=""
    while [ $# -gt 0 ]; do
      case "$1" in --as) as=$2; shift; shift ;; *) file=$1; shift ;; esac
    done
    reply env --data-urlencode "name=$name" --data-urlencode "file=$file" --data-urlencode "as=$as" ;;
  cookie)
    name=$1; url=$2; as=""
    [ "$3" = --as ] && as=$4
    reply cookie --data-urlencode "name=$name" --data-urlencode "url=$url" --data-urlencode "as=$as" ;;
  forget) reply forget --data-urlencode "name=$1" ;;
  run)
    # names are environment variable names (checked by Open Space), so a plain list splits safely
    names=""
    while [ $# -gt 0 ] && [ "$1" != -- ]; do names="$names $1"; shift; done
    if [ $# -eq 0 ] || [ -z "$names" ]; then usage >&2; exit 2; fi
    shift
    for name in $names; do
      out=$(call value --data-urlencode "name=$name") || exit 1
      value=$(printf '%s\n' "$out" | sed '$d')
      if [ "$(printf '%s\n' "$out" | tail -n 1)" != 200 ]; then printf '%s\n' "$value" >&2; exit 1; fi
      export "$name=$value"
    done
    # whatever the command prints goes through a filter that hides the values (stderr joins stdout)
    if command -v perl >/dev/null 2>&1; then
      "$@" 2>&1 | OS_SECRET_NAMES="$names" perl -pe 'BEGIN { @v = sort { length($b) <=> length($a) } grep { length($_) >= 4 } map { $ENV{$_} } split " ", $ENV{OS_SECRET_NAMES} } for my $v (@v) { s/\Q$v\E/[secret]/g }'
      exit "$PIPESTATUS"
    fi
    exec "$@" ;;
  *) usage; [ -z "$command" ] || [ "$command" = help ] || exit 2 ;;
esac
`;

/** Writes the script under OFFICE_DIR/bin (put first in the sessions' PATH): rewritten at each start, so it follows Open Space's version. */
export function installScript(dataDir: string): string {
  const folder = path.join(dataDir, 'bin');
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'os-secret');
  writeFileSync(file, SCRIPT, { mode: 0o755 });
  chmodSync(file, 0o755);
  return folder;
}
