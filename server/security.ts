// Access control for the local bridge: Host/Origin allow-lists, a request-target parser that never throws,
// and the session cookie. The cookie value is a secret kept in OFFICE_DIR (0600) so it survives restarts:
// a browser is authorised once through the /pair link, then http://127.0.0.1:<port> keeps working.
// Only readOrCreateSecret touches the disk; everything else is pure and unit-tested directly.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';

export interface AccessPolicy {
  /** exact `Host` header values accepted, e.g. "127.0.0.1:4848" */
  allowedHosts: ReadonlySet<string>;
  /** exact `Origin` header values accepted for WebSocket upgrades */
  allowedOrigins: ReadonlySet<string>;
  secret: string;
}

export type AccessDecision = 'ok' | 'bad-host' | 'bad-origin' | 'bad-cookie';

export const SESSION_COOKIE = 'poste_session';
/** 400 days, the longest lifetime browsers accept */
const COOKIE_MAX_AGE_S = 400 * 24 * 3600;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43,}$/;

export const createSecret = () => randomBytes(32).toString('base64url');

/** The secret stored in `file`, created (0600, in a 0700 folder) on first use or when the file is unreadable. */
export function readOrCreateSecret(file: string): string {
  try {
    const stored = readFileSync(file, 'utf8').trim();
    if (SECRET_PATTERN.test(stored)) return stored;
  } catch { /* first launch */ }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const secret = createSecret();
  writeFileSync(file, `${secret}\n`, { mode: 0o600 });
  return secret;
}

/** Builds the allow-lists for the loopback addresses of the given ports. */
export function loopbackPolicy(ports: number[], secret: string): AccessPolicy {
  const names = ['localhost', '127.0.0.1'];
  return {
    allowedHosts: new Set(ports.flatMap((port) => names.map((name) => `${name}:${port}`))),
    allowedOrigins: new Set(ports.flatMap((port) => names.map((name) => `http://${name}:${port}`))),
    secret,
  };
}

/** Constant-time comparison (both sides hashed first so lengths never leak). */
export function secretsMatch(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(expected), digest(provided));
}

/** The value of one cookie in a `Cookie` header, or null. */
export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

/** HttpOnly: page scripts never see it. SameSite=Strict: no other site can make the browser send it. */
export const sessionCookie = (secret: string) => `${SESSION_COOKIE}=${secret}; Path=/; Max-Age=${COOKIE_MAX_AGE_S}; HttpOnly; SameSite=Strict`;

export const hasSessionCookie = (policy: AccessPolicy, req: IncomingMessage) => secretsMatch(policy.secret, readCookie(req.headers.cookie, SESSION_COOKIE));

/**
 * Parses a request target ("/path?query"). Returns null for anything that is not a plain
 * origin-form target: "//host/x" and "/\host" would otherwise be read as a different authority,
 * and `new URL` throws on some of them.
 */
export function parseRequestUrl(target: string | undefined): URL | null {
  if (target?.[0] !== '/' || target[1] === '/' || target[1] === '\\') return null;
  try {
    return new URL(target, 'http://localhost');
  } catch {
    return null;
  }
}

/** DNS-rebinding guard: the Host header must be one of our own loopback names. */
export function hostAllowed(policy: AccessPolicy, req: IncomingMessage): boolean {
  const host = req.headers.host;
  return typeof host === 'string' && policy.allowedHosts.has(host.toLowerCase());
}

/** Everything a WebSocket upgrade must satisfy: Host, Origin and the session cookie. */
export function checkUpgrade(policy: AccessPolicy, req: IncomingMessage): AccessDecision {
  if (!hostAllowed(policy, req)) return 'bad-host';
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !policy.allowedOrigins.has(origin)) return 'bad-origin';
  if (!hasSessionCookie(policy, req)) return 'bad-cookie';
  return 'ok';
}
