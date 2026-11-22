// The keys the user gives a session (shared/secrets.ts), never logged nor sent to the page, and used by the agent through
// `os-secret`, a script Open Space writes and puts first in the sessions' PATH. The script talks to
// /secrets/<session>/<key>/<action> (key = HMAC of the secret, given in the session's environment only). A key given
// for this session only stays in memory; one kept for a project or every session lives in the vault (server/vault.ts)
// and reaches a session only once handed to it: with the user's consent, or without asking in a project they allowed.
import { execFile } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isSecretName, MAX_SECRET_LENGTH, MAX_SECRETS, SECRET_TTL_MS, type KeysCard, type PasteScope, type SecretEntry, type StoredOffer } from '../shared/secrets.ts';
import { resolveAllowedDirectory } from './paths.ts';
import type { Vault } from './vault.ts';

export const secretsKey = (secret: string, sessionId: string) => createHmac('sha256', secret).update(`secrets:${sessionId}`).digest('hex').slice(0, 32);

interface Kept { value: string; at: number }

/**
 * Where a session stands for the vault, read whenever a key is used (its folder changes with its worktree): its name,
 * its project (worktrees.ts projectOf), whether it is a trigger's run (never handed keys of the vault but its trigger's)
 * and whether its folder is not trusted (never handed one without asking).
 */
export interface KeyPlace { name: string; project: string; trigger: boolean; untrusted: boolean }

/** What the user answered in a box: the keys of the vault they hand over, and whether their project may have them without asking from now on. */
export interface KeyConsent { stored: readonly string[]; always: boolean }

/**
 * The keys of every session, by name: those given to it alone (in memory, SECRET_TTL_MS at most) and those of the vault
 * handed to it (`granted`: by name, the vault's entry it was handed, whose value is read at each use, so a key replaced
 * in the settings is replaced everywhere; consent to one entry never opens another of the same name). A key given to
 * the session wins over the vault's. `onChange`: a session's names changed.
 */
export class SecretStore {
  private kept = new Map<string, Map<string, Kept>>();
  private granted = new Map<string, Map<string, string>>();
  private onChange: (sessionId: string) => void;
  private now: () => number;
  private vault: Vault | null;
  private place: (sessionId: string) => KeyPlace | null;

  constructor(onChange: (sessionId: string) => void, now: () => number = Date.now, options: { vault?: Vault | null; place?: (sessionId: string) => KeyPlace | null } = {}) {
    this.onChange = onChange;
    this.now = now;
    this.vault = options.vault ?? null;
    this.place = options.place ?? (() => null);
  }

  placeOf(sessionId: string) { return this.place(sessionId); }

  /** Whether keys can be kept beyond a session (there is a vault). */
  get lasting() { return this.vault !== null; }

  /** Keeps the valid entries for this session only (a later one wins over an earlier one of the same name); returns the names kept. */
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

  /**
   * Keys the user gave in a box or the session's menu, each where they chose (`scope`; this session when there is no
   * vault, or for a trigger's run), and the keys of the vault they handed over. A key saved from a session counts as
   * allowed in its project, unless its folder is not trusted. Returns the names now held.
   */
  give(sessionId: string, entries: readonly SecretEntry[], consent: KeyConsent = { stored: [], always: false }): string[] {
    const place = this.place(sessionId);
    const vault = place && !place.trigger ? this.vault : null;
    const kept: string[] = [];
    const own: SecretEntry[] = [];
    for (const entry of entries) {
      const scope = entry.scope ?? 'session';
      if (!vault || !place || scope === 'session') { own.push(entry); continue; }
      const id = vault.set(entry.name, scope === 'project' ? { kind: 'project', path: place.project } : { kind: 'all' }, entry.value);
      if (!id) continue;
      if (!place.untrusted) vault.allow(id, place.project);
      // the session's own copy would hide the key just saved
      this.kept.get(sessionId)?.delete(entry.name);
      this.grantOne(sessionId, entry.name, id);
      kept.push(entry.name);
    }
    kept.push(...this.set(sessionId, own));
    for (const name of consent.stored) {
      const found = this.offered(sessionId, name);
      if (!found) continue;
      if (consent.always && place && !place.untrusted) this.vault?.allow(found.id, place.project);
      this.grantOne(sessionId, name, found.id);
      kept.push(name);
    }
    if (kept.length) this.onChange(sessionId);
    return [...new Set(kept)];
  }

  /** Hands keys of the vault to a session: the entries it would be offered under these names (its project allowed them). */
  grant(sessionId: string, names: readonly string[]) {
    let granted = false;
    for (const name of names) {
      const found = this.offered(sessionId, name);
      if (found) { this.grantOne(sessionId, name, found.id); granted = true; }
    }
    if (granted) this.onChange(sessionId);
  }

  /** Among `names`, the keys the session does not hold yet: those of the vault it gets without asking, those to offer, those nobody has. */
  offer(sessionId: string, names: readonly string[]): { silent: string[]; stored: StoredOffer[]; missing: string[] } {
    const held = this.names(sessionId);
    const place = this.place(sessionId);
    const silent: string[] = [];
    const stored: StoredOffer[] = [];
    const missing: string[] = [];
    for (const name of names) {
      if (held.includes(name)) continue;
      const found = this.offered(sessionId, name);
      if (!found) missing.push(name);
      else if (found.allowed && !place?.untrusted) silent.push(name);
      else stored.push({ name, scope: found.scope });
    }
    return { silent, stored, missing };
  }

  /** The value of a key for a session, or null. `use`: the agent uses it now (written down as the key's last use). */
  get(sessionId: string, name: string, use = false): string | null {
    const own = this.kept.get(sessionId)?.get(name);
    if (own && this.now() - own.at < SECRET_TTL_MS) return own.value;
    const found = this.stored(sessionId, name);
    const place = this.place(sessionId);
    if (found && use && place) this.vault?.touch(found.id, place.name, place.project);
    return found?.value ?? null;
  }

  /** Where a key the session holds is kept: given to it alone, or in the vault (for its project, or every session). */
  scopeOf(sessionId: string, name: string): PasteScope | null {
    const own = this.kept.get(sessionId)?.get(name);
    if (own && this.now() - own.at < SECRET_TTL_MS) return 'session';
    return this.stored(sessionId, name)?.scope ?? null;
  }

  /** Every key the session holds. */
  names(sessionId: string): string[] {
    return [...new Set([...this.given(sessionId), ...this.inherited(sessionId)])].sort();
  }

  /** The keys given to the session alone. */
  given(sessionId: string): string[] {
    const keys = this.kept.get(sessionId);
    return keys ? [...keys].filter(([, { at }]) => this.now() - at < SECRET_TTL_MS).map(([name]) => name).sort() : [];
  }

  /** The keys of the vault handed to the session (its project's or every session's), but those it holds a copy of its own. */
  inherited(sessionId: string): string[] {
    const own = this.given(sessionId);
    return [...(this.granted.get(sessionId)?.keys() ?? [])].filter((name) => !own.includes(name) && this.stored(sessionId, name)).sort();
  }

  /** Forgets one key, or all the keys of the session: its own copy and what it was handed, never the vault's entry. */
  drop(sessionId: string, name?: string) {
    const keys = this.kept.get(sessionId);
    const granted = this.granted.get(sessionId);
    if (name === undefined) {
      if (!keys && !granted) return;
      this.kept.delete(sessionId);
      this.granted.delete(sessionId);
    } else {
      const dropped = [keys?.delete(name), granted?.delete(name)].some(Boolean);
      if (!dropped) return;
      if (keys && !keys.size) this.kept.delete(sessionId);
      if (granted && !granted.size) this.granted.delete(sessionId);
    }
    this.onChange(sessionId);
  }

  /** Forgets the keys given more than SECRET_TTL_MS ago (those of the vault do not expire). */
  sweep() {
    for (const [sessionId, keys] of this.kept) {
      const before = keys.size;
      for (const [name, { at }] of keys) if (this.now() - at >= SECRET_TTL_MS) keys.delete(name);
      if (!keys.size) this.kept.delete(sessionId);
      if (keys.size !== before) this.onChange(sessionId);
    }
  }

  /** A key of the vault changed (replaced, removed): the sessions it was handed to are told. */
  vaultChanged() {
    for (const sessionId of this.granted.keys()) this.onChange(sessionId);
  }

  private grantOne(sessionId: string, name: string, id: string) {
    const names = this.granted.get(sessionId) ?? new Map<string, string>();
    names.set(name, id);
    this.granted.set(sessionId, names);
  }

  /** The vault's key a session would be offered under `name`: its project's, else every session's (none for a trigger's run). */
  private offered(sessionId: string, name: string) {
    const place = this.place(sessionId);
    return place && !place.trigger ? (this.vault?.lookup(name, place.project) ?? null) : null;
  }

  /** The vault's entry the session was handed under `name`, while it still is one for its project or every session. */
  private stored(sessionId: string, name: string) {
    const id = this.granted.get(sessionId)?.get(name);
    const place = this.place(sessionId);
    return id && place && !place.trigger ? (this.vault?.handed(id, place.project) ?? null) : null;
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

/** Whether git ignores a file: null when its folder is not in a git repository (or git cannot tell). */
export function gitIgnores(file: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    execFile('git', ['-C', path.dirname(file), 'check-ignore', '-q', path.basename(file)], { timeout: 10_000, windowsHide: true }, (error) => {
      const code = error && typeof error.code === 'number' ? error.code : error ? -1 : 0;
      resolve(code === 0 ? true : code === 1 ? false : null);
    });
  });
}

/** What a session's `os-secret` asks for; `form`: its fields, `cwd` the folder the command runs in. */
export interface SecretsRequest { sessionId: string; action: string; form: URLSearchParams }
export interface SecretsReply { status: number; text: string }

export interface SecretsApiDeps {
  store: SecretStore;
  roots: () => readonly string[];
  /**
   * opens a box asking the user for the keys `names` and those of the vault in `card` (null: refused, or the session's
   * turn ended meanwhile); throws when the session cannot ask now
   */
  ask: (sessionId: string, names: string[], why: string, card: KeysCard) => Promise<string[] | null>;
  /** nobody can answer a box of this session now: a trigger's run that no chat bot follows */
  unattended?: (sessionId: string) => boolean;
  /** whether git ignores a file (null: not in a git repository) */
  ignored?: (file: string) => Promise<boolean | null>;
  /** puts a cookie in the session's own browser, or the shared one */
  setCookie: (sessionId: string, cookie: { name: string; value: string; url: string }, shared: boolean) => Promise<void>;
  /** signs the session's own browser in to a site with basic auth */
  signIn: (sessionId: string, login: { url: string; username: string; password: string }) => Promise<void>;
  /** types a value into the field that has focus in one of the session's tabs (`url`: the tab on its site), a password field unless `anyField`; answers that tab's address */
  type: (sessionId: string, input: { value: string; url: string; shared: boolean; anyField: boolean }) => Promise<string>;
}

/** The login of an `os-secret auth` key: the password alone with `user`, else "user:password" (null when it is not one). */
export function loginOf(value: string, user?: string): { username: string; password: string } | null {
  if (user) return user.includes(':') ? null : { username: user, password: value };
  const at = value.indexOf(':');
  return at < 0 ? null : { username: value.slice(0, at), password: value.slice(at + 1) };
}

const isSite = (url: string) => /^https?:\/\//.test(url) && URL.canParse(url);
const SITE_WANTED = 'Give the address of the site (https://…).';
const failure = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
      const why = (form.get('why') ?? '').slice(0, 500);
      const again = form.get('again') === '1';
      const place = store.placeOf(sessionId);
      const canSave = place && !place.trigger && store.lasting ? true : undefined;
      let card: KeysCard | null = null;
      let paste: string[] = [];
      let asked: string[] = [];
      if (again) {
        // the agent says a key it was given does not work: the box replaces it where it is kept
        paste = names;
        asked = names;
        card = { stored: [], again: true, scopes: Object.fromEntries(names.map((each) => [each, store.scopeOf(sessionId, each) ?? 'session'])), ...(canSave ? { canSave } : {}), ...(place ? { project: place.project } : {}) };
      } else {
        const { silent, stored, missing } = store.offer(sessionId, names);
        store.grant(sessionId, silent);
        paste = missing;
        asked = [...stored.map((each) => each.name), ...missing];
        const canAlways = place && !place.untrusted && !missing.length ? true : undefined;
        if (stored.length || missing.length) card = { stored, ...(canAlways ? { canAlways } : {}), ...(canSave ? { canSave } : {}), ...(place ? { project: place.project } : {}) };
      }
      if (card) {
        if (deps.unattended?.(sessionId)) return { status: 409, text: `Nobody can answer now: this is an automatic run and no chat bot follows it. Missing: ${asked.join(', ')}. The user can give them to its trigger, in its settings (Keys).` };
        let given: string[] | null;
        try { given = await deps.ask(sessionId, paste, why, card); } catch (error) { return { status: 409, text: failure(error) }; }
        if (!given) return { status: 409, text: 'The user did not give the keys.' };
      }
      const now = store.names(sessionId);
      const origin = (each: string) => `${each} (${store.scopeOf(sessionId, each) === 'session' ? 'pasted' : 'saved'})`;
      return { status: 200, text: `Ready: ${names.filter((each) => now.includes(each)).map(origin).join(', ') || 'none'}. Other keys given: ${now.filter((each) => !names.includes(each)).join(', ') || 'none'}.` };
    }
    case 'value': {
      const value = store.get(sessionId, name, true);
      return value === null ? missing(name) : { status: 200, text: value };
    }
    // every key, for the filter around the session's Playwright server, which hides them in its answers (server/playwright-filter.ts)
    case 'values':
      return { status: 200, text: JSON.stringify(Object.fromEntries(store.names(sessionId).map((each) => [each, store.get(sessionId, each)]))) };
    case 'env': {
      const value = store.get(sessionId, name, true);
      if (value === null) return missing(name);
      const variable = form.get('as') || name;
      if (!isSecretName(variable)) return { status: 400, text: `${variable} is not a valid variable name.` };
      const file = envFileAt(form.get('cwd') ?? '', form.get('file') || '.env', deps.roots());
      if (!file) return { status: 400, text: 'That file is outside the folders Open Space works in, or its folder does not exist.' };
      if ((await (deps.ignored ?? gitIgnores)(file)) === false) return { status: 409, text: `${file} is not ignored by git: add it to .gitignore first (a key must never be committed), then run this again.` };
      writeEnvFile(file, variable, value);
      return { status: 200, text: `${variable} written in ${file}.` };
    }
    case 'cookie': {
      const value = store.get(sessionId, name, true);
      if (value === null) return missing(name);
      const url = form.get('url') ?? '';
      if (!isSite(url)) return { status: 400, text: SITE_WANTED };
      const cookie = form.get('as') || name;
      const shared = form.get('shared') === '1';
      try { await deps.setCookie(sessionId, { name: cookie, value, url }, shared); } catch (error) { return { status: 409, text: `Cannot set the cookie: ${failure(error)}` }; }
      return { status: 200, text: `Cookie ${cookie} set for ${url} in your ${shared ? 'shared ' : ''}browser.` };
    }
    case 'auth': {
      const value = store.get(sessionId, name, true);
      if (value === null) return missing(name);
      const url = form.get('url') ?? '';
      if (!isSite(url)) return { status: 400, text: SITE_WANTED };
      const login = loginOf(value, form.get('user') || undefined);
      if (!login) return { status: 400, text: form.get('user') ? 'A user name has no colon.' : `${name} is not a login: give it as user:password, or give the user with --user.` };
      // Chrome keeps the login until it closes: in the shared browser, it would stay after the session
      if (form.get('shared') === '1') return { status: 400, text: 'auth signs in your own browser only: the shared one would keep the login after you.' };
      try { await deps.signIn(sessionId, { url, ...login }); } catch (error) { return { status: 409, text: `Cannot sign in: ${failure(error)}` }; }
      return { status: 200, text: `Signed in to ${new URL(url).origin} in your browser: its pages send the login by themselves until that browser closes.` };
    }
    case 'type': {
      const value = store.get(sessionId, name, true);
      if (value === null) return missing(name);
      const url = form.get('url') ?? '';
      if (url && !isSite(url)) return { status: 400, text: 'Give the address of the tab (https://…), or none when you have one tab only.' };
      let tab: string;
      try { tab = await deps.type(sessionId, { value, url, shared: form.get('shared') === '1', anyField: form.get('any') === '1' }); } catch (error) { return { status: 409, text: `Cannot type it: ${failure(error)}` }; }
      return { status: 200, text: `${name} typed into the field that has focus in ${tab}.` };
    }
    case 'forget':
      if (store.get(sessionId, name) === null) return missing(name);
      // only this session's copy: a key of the vault is removed by the user alone, in the settings
      store.drop(sessionId, name);
      return { status: 200, text: `${name} forgotten by this session.` };
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
# hides, in what goes through, the values of the variables named in OS_SECRET_NAMES: a value of one line from 4
# characters, and each line of a value of several (a .p8 or .pem key) from 8 characters, but its -----BEGIN/END----- lines
mask() {
  perl -pe 'BEGIN { for my $n (split " ", $ENV{OS_SECRET_NAMES}) { my $v = $ENV{$n}; next unless defined $v; if ($v =~ /\n/) { for my $l (split /\r?\n/, $v) { $l =~ s/^\s+|\s+$//g; push @v, $l if length($l) >= 8 && $l !~ /^-----(BEGIN|END) [^-]*-----$/ } } elsif (length($v) >= 4) { push @v, $v } } @v = sort { length($b) <=> length($a) } @v } for my $v (@v) { s/\Q$v\E/[secret]/g }'
}
# the value of a key, or its error on stderr
value_of() {
  local out; out=$(call value --data-urlencode "name=$1") || return 1
  value=$(printf '%s\n' "$out" | sed '$d')
  if [ "$(printf '%s\n' "$out" | tail -n 1)" != 200 ]; then printf '%s\n' "$value" >&2; return 1; fi
}
usage() {
  cat <<'EOF'
os-secret ask NAME... [--why "what it is for"]   takes the keys the user saved, or asks for them (a box in Open Space, waits up to 10 min)
os-secret ask NAME --again --why "what failed"    the key you were given does not work: asks the user to replace it
os-secret list                                    the names of the keys given (never their values)
os-secret env NAME [FILE] [--as VAR]              writes NAME into a .env file (default .env here), replacing its line
os-secret run NAME... -- COMMAND...               runs COMMAND with the keys as environment variables, output masked
os-secret file NAME -- COMMAND...                 writes the key in a temporary file (600) whose path is in $NAME_FILE, runs COMMAND, then deletes it; output masked
os-secret cookie NAME URL [--as COOKIE]           puts the key as a cookie for URL in your Open Space browser
os-secret auth NAME URL [--user USER]             signs your Open Space browser in to the site of URL (basic auth): the key is user:password, or the password with --user
os-secret type NAME [URL] [--any-field]           types the key into the password field that has focus in your browser's tab (the one on the site of URL, needed with several tabs); --any-field: another field too
  cookie and type take --shared: your tabs of the shared browser instead of your own browser
os-secret forget NAME                             forgets a key in this session (a saved one stays saved)
keys are kept for this session, this project or every session, as the user chose: you only ever see their names
EOF
}
command=$1
[ $# -gt 0 ] && shift
case "$command" in
  ask)
    why=""; names=""; again=""
    while [ $# -gt 0 ]; do
      case "$1" in --why) why=$2; shift; shift ;; --again) again=1; shift ;; *) names="$names $1"; shift ;; esac
    done
    wait=610
    reply ask --data-urlencode "names=$names" --data-urlencode "why=$why" --data-urlencode "again=$again" ;;
  list) reply list ;;
  env)
    name=$1; [ $# -gt 0 ] && shift; file=""; as=""
    while [ $# -gt 0 ]; do
      case "$1" in --as) as=$2; shift; shift ;; *) file=$1; shift ;; esac
    done
    reply env --data-urlencode "name=$name" --data-urlencode "file=$file" --data-urlencode "as=$as" ;;
  cookie|auth|type)
    name=""; url=""; as=""; user=""; shared=""; any=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --as) as=$2; shift; shift ;;
        --user) user=$2; shift; shift ;;
        --shared) shared=1; shift ;;
        --any-field) any=1; shift ;;
        *) if [ -z "$name" ]; then name=$1; else url=$1; fi; shift ;;
      esac
    done
    reply "$command" --data-urlencode "name=$name" --data-urlencode "url=$url" --data-urlencode "as=$as" --data-urlencode "user=$user" --data-urlencode "shared=$shared" --data-urlencode "any=$any" ;;
  forget) reply forget --data-urlencode "name=$1" ;;
  run)
    # names are environment variable names (checked by Open Space), so a plain list splits safely
    names=""
    while [ $# -gt 0 ] && [ "$1" != -- ]; do names="$names $1"; shift; done
    if [ $# -eq 0 ] || [ -z "$names" ]; then usage >&2; exit 2; fi
    shift
    for name in $names; do
      value_of "$name" || exit 1
      export "$name=$value"
    done
    # whatever the command prints goes through a filter that hides the values (stderr joins stdout)
    if command -v perl >/dev/null 2>&1; then
      "$@" 2>&1 | OS_SECRET_NAMES="$names" mask
      exit "$PIPESTATUS"
    fi
    exec "$@" ;;
  file)
    name=$1; [ $# -gt 0 ] && shift
    if [ "$1" != -- ] || [ $# -lt 2 ] || [ -z "$name" ]; then usage >&2; exit 2; fi
    shift
    value_of "$name" || exit 1
    file=$(mktemp -t os-secret.XXXXXX) || exit 1
    # deleted however the command ends: an error, Ctrl-C, a stop
    trap 'rm -f "$file"' EXIT
    trap 'exit 129' HUP; trap 'exit 130' INT; trap 'exit 143' TERM
    chmod 600 "$file"
    case "$value" in *"
"*) printf '%s\n' "$value" > "$file" ;; *) printf '%s' "$value" > "$file" ;; esac
    export "$name"_FILE="$file"
    if command -v perl >/dev/null 2>&1; then
      "$@" 2>&1 | OS_SECRET_NAMES=OS_SECRET_VALUE OS_SECRET_VALUE="$value" mask
      exit "$PIPESTATUS"
    fi
    "$@" ;;
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
