// The user's mods (shared/mods.ts): one folder each under OFFICE_DIR/mods, written by sessions that run there. This
// lists them, makes the folder of a new one, watches their files, and remembers when the user last saw each one's data
// (OFFICE_DIR/mods-seen.json). The folder's CLAUDE.md, the rules a session writing a mod reads, is Open Space's own
// (the kit's GUIDE.md): written again whenever it differs.
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { hasNewData, isModId, MOD_DATA_FOLDER, modIdFor, readManifest, type ModInfo } from '../shared/mods.ts';
import { asJson } from './json.ts';
import { resolveInside } from './paths.ts';
import { moveToTrash } from './trash.ts';

/** The folder the mods live in; sessions may run in it, beside the user's own folders. */
export const modsFolder = (dataDir: string) => path.join(dataDir, 'mods');
/** What lets a mod's page in, without a cookie (its sandbox gives it an origin of its own): part of its address. */
export const modKey = (secret: string, id: string) => createHmac('sha256', secret).update(`mod:${id}`).digest('hex').slice(0, 32);

const GUIDE = 'GUIDE.md';
/** in each mod's folder: the address its page is served at, for its session to test it (never served: it starts with a dot) */
const ADDRESS = '.address';
const STARTER = 'starter.html';
/** a burst of writes (a session saving several files) is one change */
const SETTLE_MS = 250;
/** how deep and how many files are read to tell when a mod last changed */
const MAX_DEPTH = 4;
const MAX_FILES = 400;
const isShown = (name: string) => !name.startsWith('.') && name !== 'node_modules';

/** The latest change time (ms) among the files under `folder`, null when it holds none. */
function changedAt(folder: string): number | null {
  let latest: number | null = null, seen = 0;
  const walk = (directory: string, depth: number) => {
    let names: string[];
    try { names = readdirSync(directory).filter(isShown); } catch { return; }
    for (const name of names) {
      if (++seen > MAX_FILES) return;
      let info: Stats;
      try { info = statSync(path.join(directory, name)); } catch { continue; }
      if (info.isDirectory()) { if (depth < MAX_DEPTH) walk(path.join(directory, name), depth + 1); }
      else if (latest === null || info.mtimeMs > latest) latest = info.mtimeMs;
    }
  };
  walk(folder, 0);
  return latest === null ? null : Math.round(latest);
}

export interface ModsOptions {
  /** OFFICE_DIR/mods */
  folder: string;
  /** where the kit ships (GUIDE.md, starter.html, served under /mod-kit/) */
  kitDir: string;
  /** OFFICE_DIR/mods-seen.json */
  seenFile: string;
  secret: string;
  /** where Open Space answers (http://127.0.0.1:<port>): a mod's address, for its session to open it in its browser */
  origin: string;
  onChange: (mods: ModInfo[]) => void;
  log: (message: string, error?: unknown) => void;
}

export class Mods {
  private options: ModsOptions;
  private seen: Record<string, number> = {};
  private watcher: FSWatcher | null = null;
  private settling: NodeJS.Timeout | null = null;
  private last = '';

  constructor(options: ModsOptions) {
    this.options = options;
  }

  /** Makes the folder, writes the guide, reads what was seen, and starts watching. */
  async prepare() {
    const { folder, kitDir, seenFile, log } = this.options;
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    try {
      const guide = readFileSync(path.join(kitDir, GUIDE), 'utf8');
      const target = path.join(folder, 'CLAUDE.md');
      if (!existsSync(target) || readFileSync(target, 'utf8') !== guide) writeFileSync(target, guide);
    } catch (error) { log('cannot write the mods guide', error); }
    try {
      const raw = asJson(JSON.parse(await readFile(seenFile, 'utf8')));
      for (const [id, at] of Object.entries(raw)) if (isModId(id) && typeof at === 'number') this.seen[id] = at;
    } catch { /* nothing seen yet */ }
    const mods = this.list();
    for (const mod of mods) this.writeAddress(mod);
    this.last = JSON.stringify(mods);
    try {
      this.watcher = watch(folder, { recursive: true }, () => {
        if (this.settling) clearTimeout(this.settling);
        this.settling = setTimeout(() => this.announce(), SETTLE_MS);
      });
      this.watcher.on('error', (error) => log('the mods folder is not watched any more', error));
    } catch (error) { log('cannot watch the mods folder', error); }
  }

  stop() {
    this.watcher?.close();
    if (this.settling) clearTimeout(this.settling);
  }

  /** Tells the pages when the list is not what they last got. */
  private announce() {
    const mods = this.list();
    const now = JSON.stringify(mods);
    if (now === this.last) return;
    this.last = now;
    this.options.onChange(mods);
  }

  /** The mods, by name: every folder with a mod.json (one that cannot be read yet still shows, under its folder's name). */
  list(): ModInfo[] {
    const { secret } = this.options;
    let folder: string, names: string[];
    // the real path: what a session running there has as its folder
    try { folder = realpathSync(this.options.folder); names = readdirSync(folder).filter(isModId); } catch { return []; }
    const mods: ModInfo[] = [];
    for (const id of names) {
      const own = path.join(folder, id);
      const manifest = path.join(own, 'mod.json');
      if (!existsSync(manifest)) continue;
      let raw: unknown = null;
      try { raw = JSON.parse(readFileSync(manifest, 'utf8')); } catch { /* being written */ }
      mods.push({
        ...readManifest(raw, id), id, folder: own, url: `/mods/${modKey(secret, id)}/${id}/`,
        version: changedAt(own) ?? 0,
        unread: hasNewData(changedAt(path.join(own, MOD_DATA_FOLDER)), this.seen[id]),
      });
    }
    return mods.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The folder of a new mod asked for with `request`, with a manifest and the starter page: its session fills it. */
  create(request: string): ModInfo {
    const { folder, kitDir } = this.options;
    const id = modIdFor(request, new Set(readdirSync(folder)));
    const own = path.join(folder, id);
    mkdirSync(own, { mode: 0o700 });
    writeFileSync(path.join(own, 'mod.json'), `${JSON.stringify({ name: id, description: '', icon: 'puzzle', width: 380, height: 320, draft: true }, null, 2)}\n`);
    writeFileSync(path.join(own, 'index.html'), readFileSync(path.join(kitDir, STARTER), 'utf8'));
    this.announce();
    const made = this.list().find((mod) => mod.id === id);
    if (!made) throw new Error(`mod ${id} was not made`);
    this.writeAddress(made);
    return made;
  }

  /** Puts a mod's folder in the Trash. */
  async remove(id: string) {
    const own = this.folderOf(id);
    if (!own) return;
    await moveToTrash(own, true);
    delete this.seen[id];
    await this.saveSeen();
    this.announce();
  }

  /** The user has the mod in sight: its data as it is now counts as seen. */
  async markSeen(id: string) {
    const own = this.folderOf(id);
    const at = own ? changedAt(path.join(own, MOD_DATA_FOLDER)) : null;
    if (at === null || at <= (this.seen[id] ?? 0)) return;
    this.seen[id] = at;
    await this.saveSeen();
    this.announce();
  }

  private writeAddress(mod: ModInfo) {
    try { writeFileSync(path.join(mod.folder, ADDRESS), `${this.options.origin}${mod.url}\n`); } catch (error) { this.options.log(`cannot write the address of mod ${mod.id}`, error); }
  }

  private saveSeen = () => writeFile(this.options.seenFile, `${JSON.stringify(this.seen)}\n`, { mode: 0o600 });

  private folderOf(id: string): string | null {
    return isModId(id) ? resolveInside(this.options.folder, id) : null;
  }

  /** The real path of a file of a mod, served to its page: null unless it is a shown file of its folder. */
  file(id: string, relative: string): string | null {
    const own = this.folderOf(id);
    if (!own) return null;
    if (relative.split('/').some((part) => !isShown(part))) return null;
    const real = resolveInside(own, relative || 'index.html');
    try { return real && statSync(real).isFile() ? real : null; } catch { return null; }
  }
}
