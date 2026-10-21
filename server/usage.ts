// What Claude Code spent on this computer, read from its own transcripts (<home>/.claude/projects/**/*.jsonl, the
// sub-agents' under <session>/subagents/) and cached in OFFICE_DIR/usage-cache.json. The files only grow, so each is
// read once from where the last scan stopped; a file that shrank or was replaced is read again from its start.
// The page prices the tokens (shared/usage.ts): this file only counts them, by hour, model and project.
import { readFileSync, type Dirent } from 'node:fs';
import { open, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { USAGE_DAYS, addTokens, dayOf, type ActiveHour, type ConversationSpan, type CostReport, type ModelDay, type ProjectDay, type Tokens } from '../shared/usage.ts';
import { asJson, type Json, asNumber, asString } from './json.ts';

/** Bump when the cache's format changes: an older cache is then dropped and rebuilt. */
const CACHE_VERSION = 1;
const FRESH_MS = 60_000;
const CHUNK = 4 * 1024 * 1024;
/** How many (message id | request id) keys a file remembers: enough to recognize a message cut by the end of the last read. */
const RECENT_KEYS = 50;
const DAY_MS = 86_400_000;

/** The tokens of one hour for one model, as [input, output, cacheWrite5m, cacheWrite1h, cacheRead], and its answers. */
interface Bucket { hour: number; model: string; fast: boolean; tokens: number[]; turns: number }

/** What one transcript file adds up to. `offset`: how far it was read (after its last complete line). */
interface FileTotals {
  size: number; mtimeMs: number; ino: number; offset: number;
  sessionId: string; project: string;
  /** keyed by hour (ms) | model | fast */
  buckets: Map<string, Bucket>;
  /** the minutes (epoch minutes) in which something was written */
  minutes: Set<number>;
  recent: string[];
}

const emptyTotals = (sessionId: string): FileTotals => ({ size: 0, mtimeMs: 0, ino: 0, offset: 0, sessionId, project: '', buckets: new Map(), minutes: new Set(), recent: [] });
const tokensOf = (list: number[]): Tokens => ({ input: list[0], output: list[1], cacheWrite5m: list[2], cacheWrite1h: list[3], cacheRead: list[4] });
const startOfDay = (time: number) => { const date = new Date(time); return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); };
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The string value of `"name":"` in a JSON line, found without decoding the whole line (lines can be megabytes). */
function stringField(line: Buffer, marker: Buffer): string | null {
  const at = line.indexOf(marker);
  if (at === -1) return null;
  const from = at + marker.length;
  const end = line.indexOf(0x22, from);
  return end === -1 ? null : line.toString('utf8', from, end);
}
const TIMESTAMP = Buffer.from('"timestamp":"');
const SESSION_ID = Buffer.from('"sessionId":"');
const CWD = Buffer.from('"cwd":"');
const USAGE = Buffer.from('"usage"');

/** Adds one transcript line to a file's totals. A line that is not what we look for, or broken, adds nothing. */
function addLine(totals: FileTotals, line: Buffer, earliest: number) {
  const stamp = stringField(line, TIMESTAMP);
  const time = stamp ? Date.parse(stamp) : NaN;
  if (Number.isNaN(time) || time < earliest) return;
  totals.minutes.add(Math.floor(time / 60_000));
  if (!totals.project) totals.project = stringField(line, CWD) ?? '';
  if (totals.sessionId === '') totals.sessionId = stringField(line, SESSION_ID) ?? '';
  if (line.indexOf(USAGE) === -1) return;
  let record: Json;
  try { record = asJson(JSON.parse(line.toString('utf8'))); } catch { return; }
  if (record.type !== 'assistant') return;
  const message = asJson(record.message);
  const usage = asJson(message.usage);
  const model = asString(message.model);
  if (!model || model === '<synthetic>' || Object.keys(usage).length === 0) return;
  const key = `${asString(message.id)}|${asString(record.requestId)}`;
  if (key !== '|') {
    if (totals.recent.includes(key)) return;
    totals.recent.push(key);
    if (totals.recent.length > RECENT_KEYS) totals.recent.shift();
  }
  const written = asNumber(usage.cache_creation_input_tokens);
  const split = asJson(usage.cache_creation);
  const written1h = 'ephemeral_1h_input_tokens' in split ? asNumber(split.ephemeral_1h_input_tokens) : 0;
  const written5m = 'ephemeral_5m_input_tokens' in split ? asNumber(split.ephemeral_5m_input_tokens) : written;
  const fast = usage.speed === 'fast';
  const hour = Math.floor(time / 3_600_000) * 3_600_000;
  const id = `${hour}|${model}|${fast ? 1 : 0}`;
  let bucket = totals.buckets.get(id);
  if (!bucket) { bucket = { hour, model, fast, tokens: [0, 0, 0, 0, 0], turns: 0 }; totals.buckets.set(id, bucket); }
  bucket.tokens[0] += asNumber(usage.input_tokens);
  bucket.tokens[1] += asNumber(usage.output_tokens);
  bucket.tokens[2] += written5m;
  bucket.tokens[3] += written1h;
  bucket.tokens[4] += asNumber(usage.cache_read_input_tokens);
  bucket.turns += 1;
}

/** Reads the complete lines of `file` from `totals.offset` on, and moves the offset after the last one. */
async function readFrom(file: string, totals: FileTotals, earliest: number) {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(CHUNK);
    let pending: Buffer = Buffer.alloc(0);
    let position = totals.offset;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, CHUNK, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      const data = pending.length ? Buffer.concat([pending, buffer.subarray(0, bytesRead)]) : buffer.subarray(0, bytesRead);
      let start = 0;
      for (let end = data.indexOf(0x0a); end !== -1; end = data.indexOf(0x0a, start)) {
        if (end > start) addLine(totals, data.subarray(start, end), earliest);
        start = end + 1;
      }
      // the end of the chunk is the start of a line still being written: kept (copied, the buffer is reused) for the next chunk
      pending = Buffer.from(data.subarray(start));
      totals.offset = position - pending.length;
    }
  } finally { await handle.close(); }
}

/** Every `.jsonl` file under `folder`, whatever the depth; an unreadable folder is skipped. */
async function transcriptFiles(folder: string): Promise<string[]> {
  const found: string[] = [];
  let entries: Dirent[];
  try { entries = await readdir(folder, { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    const child = path.join(folder, entry.name);
    if (entry.isDirectory()) found.push(...await transcriptFiles(child));
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push(child);
  }
  return found;
}

interface UsageOptions { home: string; cacheFile: string; log: (message: string, error?: unknown) => void; now?: () => number }

export class UsageLedger {
  private options: UsageOptions;
  private files = new Map<string, FileTotals>();
  private running: Promise<CostReport> | null = null;
  private scannedAt = 0;
  private built: CostReport | null = null;

  constructor(options: UsageOptions) {
    this.options = options;
    this.load();
  }

  private now() { return this.options.now ? this.options.now() : Date.now(); }

  /** The last report built, flagged as scanning while a scan runs; null before the first one (no cache either). */
  current(): CostReport | null {
    if (!this.built && this.files.size) this.built = this.build();
    return this.built && { ...this.built, scanning: this.running !== null };
  }

  /** True when `report(fresh)` will have to read the transcripts first. */
  needsScan(fresh: boolean): boolean {
    return this.running !== null || fresh || this.now() - this.scannedAt >= FRESH_MS;
  }

  /** The report: the last one when its scan ended less than a minute ago (unless `fresh`), else after a new scan. Calls during a scan share it. */
  report(fresh = false): Promise<CostReport> {
    if (this.running) return this.running;
    if (!fresh && this.built && this.now() - this.scannedAt < FRESH_MS) return Promise.resolve({ ...this.built, scanning: false });
    this.running = this.scan().finally(() => { this.running = null; });
    return this.running;
  }

  private async scan(): Promise<CostReport> {
    const now = this.now();
    const earliest = startOfDay(now - (USAGE_DAYS + 1) * DAY_MS);
    const seen = new Set<string>();
    for (const file of await transcriptFiles(path.join(this.options.home, '.claude', 'projects'))) {
      seen.add(file);
      try { await this.scanFile(file, earliest); } catch (error) { this.options.log(`usage: ${path.basename(file)} skipped`, error); }
      await nextTurn();
    }
    this.prune(earliest, seen);
    this.scannedAt = this.now();
    this.built = this.build();
    await this.save();
    return this.built;
  }

  private async scanFile(file: string, earliest: number) {
    const info = await stat(file);
    let totals = this.files.get(file);
    if (totals && totals.size === info.size && totals.mtimeMs === info.mtimeMs && totals.ino === info.ino) return;
    // shrunk, replaced or touched back in time: what was counted from it is dropped and it is read again
    if (!totals || info.size < totals.offset || info.ino !== totals.ino || info.mtimeMs < totals.mtimeMs) {
      totals = emptyTotals('');
      this.files.set(file, totals);
    }
    totals.ino = info.ino;
    await readFrom(file, totals, earliest);
    totals.size = info.size;
    totals.mtimeMs = info.mtimeMs;
    if (totals.sessionId === '') totals.sessionId = path.basename(file, '.jsonl');
  }

  /** Forgets what is older than the report needs, and the files that are gone with nothing left in them. */
  private prune(earliest: number, onDisk: ReadonlySet<string>) {
    const earliestMinute = Math.floor(earliest / 60_000);
    for (const [file, totals] of this.files) {
      for (const [id, bucket] of totals.buckets) if (bucket.hour < earliest) totals.buckets.delete(id);
      for (const minute of totals.minutes) if (minute < earliestMinute) totals.minutes.delete(minute);
      if (!onDisk.has(file) && totals.buckets.size === 0 && totals.minutes.size === 0) this.files.delete(file);
    }
  }

  private build(): CostReport {
    const now = this.now();
    const firstDay = dayOf(startOfDay(now - (USAGE_DAYS - 1) * DAY_MS));
    const firstTime = startOfDay(now - (USAGE_DAYS - 1) * DAY_MS);
    const models = new Map<string, ModelDay>();
    const projects = new Map<string, ProjectDay>();
    const sessions = new Map<string, { project: string; minutes: Set<number> }>();
    for (const totals of this.files.values()) {
      for (const bucket of totals.buckets.values()) {
        const day = dayOf(bucket.hour);
        if (day < firstDay) continue;
        const tokens = tokensOf(bucket.tokens);
        const fast = bucket.fast ? true as const : undefined;
        const modelKey = `${day}|${bucket.model}|${bucket.fast}`;
        const model = models.get(modelKey);
        if (model) { model.tokens = addTokens(model.tokens, tokens); model.turns += bucket.turns; }
        else models.set(modelKey, { day, model: bucket.model, ...(fast ? { fast } : {}), tokens, turns: bucket.turns });
        const projectKey = `${day}|${totals.project}|${bucket.model}|${bucket.fast}`;
        const project = projects.get(projectKey);
        if (project) project.tokens = addTokens(project.tokens, tokens);
        else projects.set(projectKey, { day, project: totals.project, model: bucket.model, ...(fast ? { fast } : {}), tokens });
      }
      // a conversation's minutes are the union over its main file and its sub-agents' files
      const session = sessions.get(totals.sessionId) ?? { project: '', minutes: new Set<number>() };
      sessions.set(totals.sessionId, session);
      if (!session.project) session.project = totals.project;
      for (const minute of totals.minutes) if (minute * 60_000 >= firstTime) session.minutes.add(minute);
    }
    const hours = new Map<string, ActiveHour>();
    const conversations: ConversationSpan[] = [];
    for (const [id, session] of sessions) {
      if (session.minutes.size === 0) continue;
      const days = new Set<string>();
      let start = Infinity;
      let end = 0;
      for (const minute of session.minutes) {
        const date = new Date(minute * 60_000);
        const day = dayOf(minute * 60_000);
        days.add(day);
        start = Math.min(start, minute);
        end = Math.max(end, minute);
        const hourKey = `${day}|${date.getHours()}`;
        const hour = hours.get(hourKey);
        if (hour) hour.minutes += 1;
        else hours.set(hourKey, { day, hour: date.getHours(), minutes: 1 });
      }
      conversations.push({ id, project: session.project, start: start * 60_000, end: end * 60_000, minutes: session.minutes.size, days: [...days].sort() });
    }
    conversations.sort((a, b) => b.end - a.end);
    return { generatedAt: now, scanning: false, models: [...models.values()], projects: [...projects.values()], hours: [...hours.values()], conversations };
  }

  private load() {
    try {
      const raw = asJson(JSON.parse(readFileSync(this.options.cacheFile, 'utf8')));
      if (raw.version !== CACHE_VERSION) return;
      for (const [file, value] of Object.entries(asJson(raw.files))) {
        const entry = asJson(value);
        const totals = emptyTotals(asString(entry.sessionId));
        totals.size = asNumber(entry.size);
        totals.mtimeMs = asNumber(entry.mtimeMs);
        totals.ino = asNumber(entry.ino);
        totals.offset = asNumber(entry.offset);
        totals.project = asString(entry.project);
        totals.recent = Array.isArray(entry.recent) ? entry.recent.filter((key): key is string => typeof key === 'string') : [];
        totals.minutes = new Set(Array.isArray(entry.minutes) ? entry.minutes.filter((minute): minute is number => typeof minute === 'number') : []);
        for (const row of Array.isArray(entry.buckets) ? entry.buckets : []) {
          if (!Array.isArray(row) || row.length !== 9) continue;
          const [hour, model, fast, ...rest] = row as [number, string, number, ...number[]];
          totals.buckets.set(`${hour}|${model}|${fast}`, { hour, model, fast: fast === 1, tokens: rest.slice(0, 5), turns: rest[5] });
        }
        this.files.set(file, totals);
      }
    } catch { /* missing or unreadable: everything is read again */ }
  }

  private async save() {
    const files: Record<string, unknown> = {};
    for (const [file, totals] of this.files) {
      files[file] = {
        size: totals.size, mtimeMs: totals.mtimeMs, ino: totals.ino, offset: totals.offset, sessionId: totals.sessionId, project: totals.project,
        recent: totals.recent, minutes: [...totals.minutes].sort((a, b) => a - b),
        buckets: [...totals.buckets.values()].map((bucket) => [bucket.hour, bucket.model, bucket.fast ? 1 : 0, ...bucket.tokens, bucket.turns]),
      };
    }
    const temporary = `${this.options.cacheFile}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ version: CACHE_VERSION, files }), { mode: 0o600 });
      await rename(temporary, this.options.cacheFile);
    } catch (error) { this.options.log('usage: cache not saved', error); }
  }
}
