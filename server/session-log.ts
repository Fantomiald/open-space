// Per-session event log: JSONL on disk (source of truth, replayable), recent events in memory.
// Appends go through one write stream so lines are always written in order.
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { LoggedEvent, OfficeEvent } from '../shared/protocol.ts';
import { asNumber, isJson } from './json.ts';

/** Where the thread of a switched off session waits, under its conversation's id, to come back if it is resumed. */
export const switchedOffFolder = (logsDir: string) => path.join(logsDir, 'off');

/** Events kept in memory per session; older ones stay on disk only. */
export const MEMORY_LIMIT = 5000;

export class SessionLog {
  private events: LoggedEvent[] = [];
  private seq = 0;
  private stream: WriteStream | null = null;
  private file: string;
  private onError: (error: Error) => void;

  constructor(file: string, onError: (error: Error) => void) {
    this.file = file;
    this.onError = onError;
  }

  get lastSeq() { return this.seq; }

  /** Reads the file written by an earlier run. Lines cut by a crash are skipped. */
  async load(): Promise<void> {
    let lines: readline.Interface;
    try {
      lines = readline.createInterface({ input: createReadStream(this.file, { encoding: 'utf8' }) });
      for await (const line of lines) {
        try {
          const parsed: unknown = JSON.parse(line);
          if (!isJson(parsed) || !isJson(parsed.ev)) continue;
          const seq = asNumber(parsed.seq, this.seq + 1);
          this.events.push({ seq, at: asNumber(parsed.at), ev: parsed.ev as unknown as OfficeEvent });
          this.seq = Math.max(this.seq, seq);
        } catch { /* partial line */ }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.onError(error as Error);
    }
    if (this.events.length > MEMORY_LIMIT) this.events.splice(0, this.events.length - MEMORY_LIMIT);
  }

  append(at: number, ev: OfficeEvent): LoggedEvent {
    const logged: LoggedEvent = { seq: ++this.seq, at, ev };
    this.events.push(logged);
    if (this.events.length > MEMORY_LIMIT) this.events.shift();
    this.write(`${JSON.stringify(logged)}\n`);
    return logged;
  }

  private write(line: string) {
    if (!this.stream) {
      const stream = createWriteStream(this.file, { flags: 'a', mode: 0o600 });
      // a failed stream is destroyed by Node and drops later writes silently: forget it so the next append reopens the file
      stream.on('error', (error) => {
        if (this.stream === stream) this.stream = null;
        this.onError(error);
      });
      this.stream = stream;
    }
    this.stream.write(line);
  }

  /** Events with seq > after. `truncated` when older events were dropped from memory (they remain in the file). */
  since(after: number): { events: LoggedEvent[]; truncated: boolean } {
    const first = this.events[0]?.seq ?? this.seq + 1;
    return { events: this.events.filter((event) => event.seq > after), truncated: after + 1 < first };
  }

  /** Waits until everything appended so far is on disk. */
  close(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    if (!stream) return Promise.resolve();
    return new Promise((resolve) => stream.end(resolve));
  }
}
