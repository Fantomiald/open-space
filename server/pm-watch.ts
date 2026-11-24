// The reports of a project manager's (PM) workers: a turn finished, a request for the user, a silence, a stop, an error,
// a usage-limit pause, a restart. Each one goes to the worker's PM once: its key (worker, kind, the worker's last log seq,
// which survives restarts) is written in the PM's file before the message leaves, so the listener and the startup check
// never both send it. Nothing is sent while the setting is off, to a PM closed or gone, nor about a worker resolved.
import { itemTag, PM_LIMITS, type PmFile, type PmMessageTag, type PmWorker, type ReportKind } from '../shared/pm.ts';
import type { AttentionKind, SessionInfo } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
import type { PmBook } from './pm.ts';
import { nameOf, ownWorker, resolveWorker } from './pm-ops.ts';
import type { TurnEnd } from './session.ts';

/** How much of a worker's last reply follows its report, in characters. */
const LAST_WORDS = 3000;

export interface WatchDeps {
  now: () => number;
  sessions: () => SessionInfo[];
  book: PmBook;
  enabled: () => boolean;
  quietMs: () => number;
  /** the worker's last reply in full */
  lastWords: (sessionId: string) => string;
  /** when the session's last event was logged (epoch ms) */
  lastEventAt: (sessionId: string) => number;
  /** sends a message to the PM: sessions.send(pm, text, [], [], tag) */
  deliver: (pm: string, text: string, tag: PmMessageTag) => void;
  nudge: (worker: string, text: string) => void;
  log?: (message: string, error: unknown) => void;
}

export type WatchEvent = { kind: 'turnEnd'; how: TurnEnd } | { kind: 'attention'; attention: AttentionKind } | { kind: 'paused' } | { kind: 'reconcile' };

/** What an event of a worker reports to its PM, if anything. */
export function decideReport(worker: PmWorker, session: SessionInfo, event: WatchEvent): ReportKind | null {
  switch (event.kind) {
    case 'turnEnd':
      // a turn the usage limit stopped: the pause is reported on its own
      if (session.pausedUntil !== undefined) return null;
      if (event.how === 'done') return 'finished';
      // closed by the user (resolved, see closedByUser) or by Open Space stopping (reported at the next startup)
      if (event.how === 'exited') return session.state === 'closed' ? null : 'error';
      // the turn after a pm_worker_stop: the stop asked for is consumed at each turn end
      return worker.watch.stopAsked ? null : 'stopped';
    case 'attention':
      if (event.attention === 'permission' || event.attention === 'question') return 'waiting';
      return event.attention === 'error' ? 'error' : null;
    case 'paused': return 'paused';
    case 'reconcile':
      if (session.state === 'wait') return session.pausedUntil !== undefined ? 'paused' : 'finished';
      if (session.state === 'closed') return 'restarted';
      return session.state === 'error' ? 'error' : null;
  }
}

/** A report written in the PM's file, to deliver. */
interface Outgoing { pm: string; text: string; tag: PmMessageTag }

export class PmWatch {
  private readonly deps: WatchDeps;
  /** the setting as last seen: once it is back on, the next sweep catches up with what was missed */
  private wasOn = false;

  constructor(deps: WatchDeps) {
    this.deps = deps;
  }

  /** A turn ended: a worker's is reported, a PM's own counts its turns (the statuses of its tasks follow them). */
  async turnEnded(session: SessionInfo, how: TurnEnd): Promise<void> {
    if (!this.on()) return;
    if (session.pm) {
      if (!session.trigger) await this.deps.book.change(session.id, (file) => { file.turn += 1; });
      return;
    }
    await this.report(session, { kind: 'turnEnd', how });
  }

  async attention(kind: AttentionKind, session: SessionInfo): Promise<void> {
    if (this.on()) await this.report(session, { kind: 'attention', attention: kind });
  }

  async paused(session: SessionInfo): Promise<void> {
    if (this.on()) await this.report(session, { kind: 'paused' });
  }

  /** A worker forgotten: its job is closed in its PM's plan (its task has nobody on it any more). */
  async forgotten(session: SessionInfo): Promise<void> {
    if (session.pmOf) await this.resolve(session.pmOf, session.id);
  }

  /** A worker the user closed: the same. */
  async closedByUser(sessionId: string): Promise<void> {
    const pm = this.deps.sessions().find((one) => one.id === sessionId)?.pmOf;
    if (pm) await this.resolve(pm, sessionId);
  }

  /** Every 30 s: a worker silent for too long is nudged, then reported if it stays silent; and the catch-up once the setting is back on. */
  async sweep(): Promise<void> {
    if (!this.on()) return;
    if (!this.wasOn) await this.reconcile();
    const now = this.deps.now();
    const quietMs = this.deps.quietMs();
    for (const [pm, workers] of this.workersByPm()) {
      const nudges: string[] = [];
      const outgoing = await this.deps.book.change(pm, (file) => workers.flatMap((session) => {
        const worker = ownWorker(file, session.id);
        if (!worker) return [];
        const { watch } = worker;
        const last = this.deps.lastEventAt(session.id);
        const quiet = session.state === 'work' && session.pausedUntil === undefined && now - last > quietMs;
        if (!quiet) {
          delete watch.nudgedAt;
          delete watch.quietSince;
          return [];
        }
        // nudged once for this silence: a sign of life since starts it over
        if (watch.nudgedAt === undefined || last > (watch.quietSince ?? 0)) {
          watch.nudgedAt = now;
          watch.quietSince = last;
          nudges.push(session.id);
          return [];
        }
        if (now - watch.nudgedAt < quietMs) return [];
        const sent = this.write(pm, file, worker, session, 'quiet', now);
        if (sent) watch.round += 1;
        return sent ? [sent] : [];
      }));
      for (const worker of nudges) this.send(() => this.deps.nudge(worker, st.pm.nudge));
      for (const one of outgoing) this.send(() => this.deps.deliver(one.pm, one.text, one.tag));
    }
  }

  /**
   * At startup and when the setting is back on: each worker's state against its last report, for what happened while
   * nobody listened (a turn ended, a restart cut it off). A worker gone meanwhile is resolved.
   */
  async reconcile(): Promise<void> {
    if (!this.on()) return;
    this.wasOn = true;
    const now = this.deps.now();
    const sessions = this.deps.sessions();
    for (const lead of sessions.filter((one) => this.isLivePm(one))) {
      const outgoing = await this.deps.book.change(lead.id, (file) => file.workers.filter((worker) => !worker.resolvedAt).flatMap((worker) => {
        const session = sessions.find((one) => one.id === worker.session);
        if (!session) { resolveWorker(file, worker.session, now); return []; }
        if (session.pm || session.pmOf !== lead.id) return [];
        const kind = decideReport(worker, session, { kind: 'reconcile' });
        // nothing since its last report (any kind: a stop seen at that point is not a finished turn), or since it was linked
        if (!kind || (worker.lastReport?.seq ?? 0) >= session.lastSeq || this.deps.lastEventAt(session.id) <= worker.linkedAt) return [];
        const sent = this.write(lead.id, file, worker, session, kind, now);
        return sent ? [sent] : [];
      }));
      for (const one of outgoing) this.send(() => this.deps.deliver(one.pm, one.text, one.tag));
    }
  }

  /** The setting, noted when off so that the next sweep catches up once it is on again. */
  private on(): boolean {
    const on = this.deps.enabled();
    if (!on) this.wasOn = false;
    return on;
  }

  /** A PM that takes reports: there, still a PM, not a trigger's run, not closed by the user. */
  private isLivePm(session: SessionInfo | undefined): session is SessionInfo {
    return !!session?.pm && !session.trigger && session.state !== 'closed';
  }

  /** The live workers of each PM that takes reports. */
  private workersByPm(): Map<string, SessionInfo[]> {
    const sessions = this.deps.sessions();
    const byPm = new Map<string, SessionInfo[]>();
    for (const session of sessions) {
      const pm = session.pmOf;
      if (!pm || session.pm || !this.isLivePm(sessions.find((one) => one.id === pm))) continue;
      byPm.set(pm, [...(byPm.get(pm) ?? []), session]);
    }
    return byPm;
  }

  private async report(session: SessionInfo, event: WatchEvent): Promise<void> {
    const pm = session.pmOf;
    if (!pm || session.pm || !this.isLivePm(this.deps.sessions().find((one) => one.id === pm))) return;
    const now = this.deps.now();
    const sent = await this.deps.book.change(pm, (file) => {
      const worker = ownWorker(file, session.id);
      if (!worker) return null;
      const kind = decideReport(worker, session, event);
      const stopAsked = event.kind === 'turnEnd' && worker.watch.stopAsked !== undefined;
      if (event.kind === 'turnEnd') delete worker.watch.stopAsked;
      if (kind) return this.write(pm, file, worker, session, kind, now);
      // the stop the PM asked for is noted as seen, so that the startup check does not take it for a finished turn
      if (stopAsked && (event.how === 'interrupted' || event.how === 'failed')) this.write(pm, file, worker, session, 'stopped', now);
      return null;
    });
    if (sent) this.send(() => this.deps.deliver(sent.pm, sent.text, sent.tag));
  }

  /** Writes the report in the PM's file and gives the message to send; null when it was written already. */
  private write(pm: string, file: PmFile, worker: PmWorker, session: SessionInfo, kind: ReportKind, now: number): Outgoing | null {
    const key = `${session.id}:${kind}:${session.lastSeq}`;
    if (file.reports.some((one) => one.key === key)) return null;
    const line = st.pm.report(kind, nameOf(session), worker.item ? itemTag(worker.item) : undefined, session.pausedUntil);
    file.reports = [...file.reports, { key, worker: session.id, kind, at: now }].slice(-PM_LIMITS.reports);
    worker.lastReport = { kind, at: now, line: line.slice(0, PM_LIMITS.line), seq: session.lastSeq };
    const said = kind === 'finished' || kind === 'waiting' ? this.deps.lastWords(session.id).slice(0, LAST_WORDS) : '';
    return { pm, text: said ? `${line}\n\n${said}` : line, tag: { report: { worker: session.id, kind } } };
  }

  private async resolve(pm: string, worker: string): Promise<void> {
    await this.deps.book.change(pm, (file) => { resolveWorker(file, worker, this.deps.now()); });
  }

  /** A message that cannot leave (the session closing meanwhile) is logged: its report stays written, it is not sent again. */
  private send(deliver: () => void) {
    try {
      deliver();
    } catch (error) {
      this.deps.log?.('cannot deliver a PM report', error);
    }
  }
}
