// The keys the user hands a session through Open Space (a token, an API key) without the agent ever reading them:
// the agent only knows their names and uses them through the `os-secret` command (see server/secrets.ts).

/** A name usable as an environment variable: what the agent and `.env` files call the key. */
export const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;
export const isSecretName = (name: string) => SECRET_NAME.test(name);

/** How long a key given to one session only is kept in memory (it also goes when the session is switched off or Open Space stops). */
export const SECRET_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_SECRET_LENGTH = 20_000;
export const MAX_SECRETS = 50;

/**
 * Where a pasted key is kept: for this session only (in memory, as before the vault), for its project (the main checkout
 * of its git repository) or for every session. The last two live in the vault (server/vault.ts), when there is one.
 */
export const PASTE_SCOPES = ['session', 'project', 'all'] as const;
export type PasteScope = (typeof PASTE_SCOPES)[number];
export const isPasteScope = (value: unknown): value is PasteScope => PASTE_SCOPES.some((scope) => scope === value);

/** `scope`: where to keep it, this session only when absent. */
export interface SecretEntry { name: string; value: string; scope?: PasteScope }

/** A key of the vault offered to a session that does not hold it yet, and where it is kept. */
export interface StoredOffer { name: string; scope: 'project' | 'all' }

/**
 * What an `os-secret ask` box shows besides the names to paste (PermissionPrompt.secrets). `stored`: keys of the vault it
 * may hand over; `again`: the agent says the saved key it was given does not work any more, `scopes` then says where each
 * one is kept now (the field replaces it there); `canAlways`: "always for this project" is offered (never to a session of
 * a folder not trusted); `canSave`: the project and every-session scopes are offered (not to a trigger's run);
 * `project`: the project's folder, for the hint.
 */
export interface KeysCard {
  stored: StoredOffer[];
  again?: true;
  scopes?: Record<string, PasteScope>;
  canAlways?: true;
  canSave?: true;
  project?: string;
}

/** Where a key of the vault is kept: its scope, and whose it is for a project, a trigger or a mod. */
export type VaultScope = { kind: 'project'; path: string } | { kind: 'all' } | { kind: 'trigger'; id: string } | { kind: 'mod'; id: string };

/** A key of the vault as the page sees it (never its value): Settings > Keys. `owner`: the project's folder, the trigger's or the mod's id. */
export interface StoredKey {
  id: string;
  name: string;
  scope: VaultScope['kind'];
  owner?: string;
  /** the projects whose sessions used it */
  usedIn: string[];
  lastUsed?: { at: number; by: string };
}

/** How the saved keys are kept: by the macOS Keychain, Windows (for the user's account), a Linux keyring, or not at all (memory only). */
export type KeysStorage = 'keychain' | 'windows' | 'linux' | 'memory';
/**
 * `trashedMods`: the mods in the Trash whose variables are still kept, by id, with their name. `unreachable`: the names of
 * the triggers' and mods' keys in the app's vault, when this server runs without the app and cannot read them.
 */
export interface KeysState {
  storage: KeysStorage;
  keys: StoredKey[];
  trashedMods?: Record<string, string>;
  unreachable?: { triggers: Record<string, string[]>; mods: Record<string, string[]> };
}

/**
 * A value pasted whole: several lines that are not all `NAME=value` (a .p8 or .pem key) stay one value. Lines read as a
 * `.env` block only when every one of them is a `NAME=value` line.
 */
export const isMultiline = (text: string) => /\r?\n./.test(text.trim());

/**
 * `NAME=value` lines pasted at once (a block copied from a `.env`, `export NAME=value` too): the entries they hold, or
 * null when the text is not such a block (a lone value). Quotes around a value are taken off, comments and blanks skipped.
 */
export function parseEnvBlock(text: string): SecretEntry[] | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  if (!lines.length) return null;
  const entries: SecretEntry[] = [];
  for (const line of lines) {
    const found = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!found?.[1] || !isSecretName(found[1])) return null;
    const raw = found[2] ?? '';
    const quoted = /^(["'])(.*)\1$/.exec(raw);
    entries.push({ name: found[1], value: quoted ? (quoted[2] ?? '') : raw });
  }
  return entries;
}
