// The keys the user hands a session through Open Space (a token, an API key) without the agent ever reading them:
// the agent only knows their names and uses them through the `os-secret` command (see server/secrets.ts).

/** A name usable as an environment variable: what the agent and `.env` files call the key. */
export const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;
export const isSecretName = (name: string) => SECRET_NAME.test(name);

/** How long a key is kept in memory after it was given (it also goes when the session is switched off or Open Space stops). */
export const SECRET_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_SECRET_LENGTH = 20_000;
export const MAX_SECRETS = 50;

export interface SecretEntry { name: string; value: string }

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
