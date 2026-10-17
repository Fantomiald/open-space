// Runtime configuration, read from environment variables once at startup.
//   PORT                  bridge port (default 4848)
//   OFFICE_ROOTS          folders sessions may run in, separated like PATH (default: the ones chosen in the page, settings.json)
//   OFFICE_DIR            where sessions and their logs are stored (default: ~/.open-space)
//   OFFICE_MAX_LIVE       maximum number of claude processes alive at once (default: 8)
//   OFFICE_IDLE_MINUTES   a waiting session releases its process after this long (default: 30)
//   OFFICE_ENV_PASSTHROUGH  extra environment variable names handed to claude (default: none)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parsePassthrough } from './environment.ts';

export interface Config {
  port: number;
  /** the folders sessions may run in: OFFICE_ROOTS, or else the user's choice (set by index.ts from the settings) */
  roots: string[];
  /** set by OFFICE_ROOTS: the page cannot change them */
  rootsLocked: boolean;
  dataDir: string;
  maxLive: number;
  idleMs: number;
  passthrough: string[];
}

const positiveInteger = (raw: string | undefined, fallback: number) => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

function expandHome(value: string, home: string) {
  if (value === '~') return home;
  return value.startsWith('~/') ? path.join(home, value.slice(2)) : value;
}

export function loadConfig(env: NodeJS.ProcessEnv, home: string, exists: (folder: string) => boolean = existsSync): Config {
  const roots = (env.OFFICE_ROOTS ?? '').split(path.delimiter).map((root) => root.trim()).filter(Boolean).map((root) => path.resolve(expandHome(root, home))).filter(exists);
  return {
    port: positiveInteger(env.PORT, 4848),
    roots,
    rootsLocked: roots.length > 0,
    dataDir: path.resolve(expandHome(env.OFFICE_DIR ?? '~/.open-space', home)),
    maxLive: positiveInteger(env.OFFICE_MAX_LIVE, 8),
    idleMs: positiveInteger(env.OFFICE_IDLE_MINUTES, 30) * 60_000,
    passthrough: parsePassthrough(env.OFFICE_ENV_PASSTHROUGH),
  };
}
