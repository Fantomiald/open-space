// The PM files: one per project manager session, OFFICE_DIR/pm/<id of the PM>.json, read when asked for and written whole.
// Changes to one PM's file run one after the other (the model calls several pm_* tools at once), so no W or Q number is
// handed out twice and no write is lost. A file is written to a temporary name then renamed, as sessions.json is.
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyPm, type PmFile, parsePmFile } from '../shared/pm.ts';
import { st } from './i18n/index.ts';
import { SESSION_ID } from './pm-ops.ts';

export class PmBook {
  private readonly dir: string;
  /** The last change queued for each PM, never rejected: the next one waits for it. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  /** The PM's file: empty when there is none, its readable part when it is damaged. */
  read(pm: string): Promise<PmFile> {
    return this.queue(pm, (file) => this.load(file));
  }

  /** Runs `edit` on the PM's file once the changes before it are done, then writes the file if `edit` changed it. */
  change<T>(pm: string, edit: (file: PmFile) => T): Promise<T> {
    return this.queue(pm, async (file) => {
      const data = await this.load(file);
      const before = JSON.stringify(data);
      const result = edit(data);
      const after = JSON.stringify(data);
      if (after !== before) await write(file, after);
      return result;
    });
  }

  /** Deletes the PM's file, once the changes before are done. */
  remove(pm: string): Promise<void> {
    return this.queue(pm, (file) => rm(file, { force: true }));
  }

  private queue<T>(pm: string, task: (file: string) => Promise<T>): Promise<T> {
    // a PM is a session: its id never leaves the folder
    if (!SESSION_ID.test(pm)) return Promise.reject(new Error(st.pm.badId(pm)));
    const file = path.join(this.dir, `${pm}.json`);
    const run = (this.queues.get(pm) ?? Promise.resolve()).then(() => task(file));
    const tail = run.catch(() => {});
    this.queues.set(pm, tail);
    void tail.then(() => { if (this.queues.get(pm) === tail) this.queues.delete(pm); });
    return run;
  }

  private async load(file: string): Promise<PmFile> {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyPm();
      // a file that is there but cannot be read must not be written over by an empty one
      throw error;
    }
    try {
      return parsePmFile(JSON.parse(text));
    } catch {
      return parsePmFile(undefined);
    }
  }
}

async function write(file: string, text: string) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { mode: 0o600 });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
