// The phone's access (Preferences.phoneAccess): `tailscale serve` gives this computer an https address on the user's
// tailnet (https://<computer>.<tailnet>.ts.net, a real certificate) and hands its requests to the bridge on 127.0.0.1,
// keeping that name as the Host. Https makes the page a secure context on the phone (copy buttons, notifications), and
// the bridge never listens beyond the loopback. Only the user's own Tailscale devices reach that address.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PHONE_MODS_PORT } from '../shared/mods.ts';

/** The CLI of the Mac app (App Store or standalone), else Homebrew's or the open-source package's. */
const CANDIDATES = ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale', '/usr/bin/tailscale'];
const TIMEOUT_MS = 15_000;

export const findTailscale = (): string | null => CANDIDATES.find((file) => existsSync(file)) ?? null;

/** This computer's name on the tailnet, from `tailscale status --json`; null when Tailscale is stopped or signed out. */
export function tailscaleName(status: unknown): string | null {
  if (typeof status !== 'object' || status === null) return null;
  const { BackendState, Self } = status as { BackendState?: unknown; Self?: { DNSName?: unknown } };
  if (BackendState !== 'Running' || typeof Self?.DNSName !== 'string') return null;
  const name = Self.DNSName.replace(/\.$/, '').toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name) ? name : null;
}

// the Mac app's binary only acts as the CLI when it sees a terminal (TERM): launched from the Dock, Open Space has none
const run = (cli: string, args: string[]) => new Promise<string>((resolve, reject) => {
  execFile(cli, args, { timeout: TIMEOUT_MS, env: { ...process.env, TERM: process.env.TERM || 'dumb' } }, (error, stdout, stderr) => (error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout)));
});

export async function readTailscaleName(cli: string): Promise<string | null> {
  try {
    return tailscaleName(JSON.parse(await run(cli, ['status', '--json'])));
  } catch {
    return null;
  }
}

/** Serves the bridge on https://<name> (port 443). It fails while HTTPS certificates are off in the tailnet's DNS settings. */
export const serveBridge = (cli: string, port: number) => run(cli, ['serve', '--bg', '--https=443', `http://127.0.0.1:${port}`]);

/** The mods on https://<name>:8443: each under its own name on the Mac (<mod>.localhost), which the phone cannot reach. */
export const serveMods = (cli: string, modsPort: number) => run(cli, ['serve', '--bg', `--https=${PHONE_MODS_PORT}`, `http://127.0.0.1:${modsPort}`]);

export async function stopServing(cli: string) {
  await run(cli, ['serve', '--https=443', 'off']);
  await run(cli, ['serve', `--https=${PHONE_MODS_PORT}`, 'off']).catch(() => { /* never served (an older version) */ });
}
