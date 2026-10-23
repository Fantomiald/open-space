import type { ChildProcessWithoutNullStreams } from 'node:child_process';

type Job = { input: unknown; resolve: (value: unknown) => void; reject: (error: Error) => void };

/** One JSON request at a time. Never replay a playback command after a crash or timeout. */
export class MediaWorker {
  private child: ChildProcessWithoutNullStreams | null = null;
  private jobs: Job[] = [];
  private active: Job | null = null;
  private buffer = '';
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private readonly start: () => ChildProcessWithoutNullStreams;
  private readonly timeoutMs: number;
  private readonly idleMs: number;

  constructor(start: () => ChildProcessWithoutNullStreams, timeoutMs = 12_000, idleMs = 30_000) {
    this.start = start;
    this.timeoutMs = timeoutMs;
    this.idleMs = idleMs;
  }

  request(input: unknown): Promise<unknown> {
    if (this.jobs.length >= 8) return Promise.reject(new Error('Media worker busy'));
    return new Promise((resolve, reject) => {
      this.jobs.push({ input, resolve, reject });
      this.pump();
    });
  }

  close(): void { this.fail(new Error('Media worker closed')); }

  private fail(error: Error): void {
    clearTimeout(this.timeout);
    clearTimeout(this.idle);
    const child = this.child;
    this.child = null;
    this.buffer = '';
    child?.kill();
    this.active?.reject(error);
    this.active = null;
    for (const job of this.jobs.splice(0)) job.reject(error);
  }

  private pump(): void {
    if (this.active || !this.jobs.length) return;
    clearTimeout(this.idle);
    this.active = this.jobs.shift()!;
    this.timeout = setTimeout(() => this.fail(new Error('Media worker timed out')), this.timeoutMs);
    try {
      if (!this.child) {
        const child = this.start();
        this.child = child;
        child.stdout.setEncoding('utf8');
        child.stderr.resume();
        child.stdout.on('data', (chunk: string) => {
          if (this.child !== child) return;
          this.buffer += chunk;
          if (this.buffer.length > 256 * 1024) return this.fail(new Error('Media response too large'));
          const end = this.buffer.indexOf('\n');
          if (end < 0) return;
          const line = this.buffer.slice(0, end);
          this.buffer = this.buffer.slice(end + 1);
          try {
            const reply = JSON.parse(line);
            const job = this.active;
            if (!job || typeof reply.ok !== 'boolean' || this.buffer.trim()) throw new Error('Invalid media response');
            clearTimeout(this.timeout);
            this.active = null;
            if (reply.ok) job.resolve(reply.value);
            else job.reject(new Error('Windows media request failed'));
            this.idle = setTimeout(() => this.close(), this.idleMs);
            this.idle.unref();
            this.pump();
          } catch { this.fail(new Error('Invalid media response')); }
        });
        const failed = () => { if (this.child === child) this.fail(new Error('Media worker stopped')); };
        child.on('error', failed);
        child.on('exit', failed);
        child.stdin.on('error', failed);
      }
      this.child.stdin.write(`${JSON.stringify(this.active.input)}\n`);
    } catch { this.fail(new Error('Unable to start media worker')); }
  }
}
