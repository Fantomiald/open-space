// The reports of a project manager's (PM) workers: a turn finished, a request for the user, a silence, a stop, an error,
// a usage-limit pause, a restart. Each one goes to the worker's PM once: its key (worker, kind, the worker's last log seq,
// which survives restarts) is written in the PM's file before the message leaves, so the listener and the startup check
// never both send it. Nothing is sent while the setting is off, to a PM closed or gone, nor about a worker resolved.
import { itemTag, PM_LIMITS, type PmFile, type PmMessageTag, type PmWorker, REPORT_WORDS, type ReportKind } from '../shared/pm.ts';
import type { AttentionKind, SessionInfo } from '../shared/protocol.ts';
import { fenced } from './fence.ts';
import { st } from './i18n/index.ts';
import type { PmBook } from './pm.ts';
import { nameOf, ownWorker, resolveWorker } from './pm-ops.ts';
import type { TurnEnd } from './session.ts';

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
  /**
   * the session's process runs without the role it has now (SessionManager.roleChanged): a PM's that does not run as one
   * yet (started while the setting was off) takes no report until it is relaunched, then catches up
   */
  roleChanged: (sessionId: string) => boolean;
  /** the session is no longer a worker of `pm` (sessions.releaseWorker, as pm_worker_resolve does) */
  releaseWorker: (session: string, pm: string) => void;
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
    // heard again for the same pause (it could not resume yet): its report stands until the session moves
    case 'paused': return worker.lastReport?.kind === 'paused' && session.stateSince <= worker.lastReport.at ? null : 'paused';
    case 'reconcile':
      // nothing changed since its last report (or since it was linked): its log may have grown meanwhile (a shell
      // command, a note), its state did not
      if (session.stateSince <= (worker.lastReport?.at ?? worker.linkedAt)) return null;
      if (session.state === 'wait' && session.pausedUntil !== undefined) return 'paused';
      // a request raised while its PM took no report (roleChanged): nothing else would raise it again
      if (session.state === 'perm') return 'waiting';
      // a turn finished since the last report: a compaction by Open Space moves its state, not its turns
      if (session.state === 'wait') return worker.lastReport?.turns !== undefined && session.turns <= worker.lastReport.turns ? null : 'finished';
      // put to rest by the user, it is not cut off
      if (session.state === 'closed') return session.resting ? null : 'restarted';
      return session.state === 'error' ? 'error' : null;
  }
}

/** A report written in the PM's file, to deliver. */
interface Outgoing { pm: string; text: string; tag: PmMessageTag }

export class PmWatch {
  private readonly deps: WatchDeps;
  /** the setting as last seen: once it is back on, the next sweep catches up with what was missed */
  private wasOn = false;
  /** the PMs that took reports at the last sweep: one open again (closed by the user before) is caught up with */
  private livePms = new Set<string>();

  constructor(deps: WatchDeps) {
    this.deps = deps;
  }

  /**
   * A turn ended: a worker's is reported, a PM's own counts its turns (the statuses of its tasks follow them); its process
   * let go while it rests ('exited') is no turn of its.
   */
  async turnEnded(session: SessionInfo, how: TurnEnd): Promise<void> {
    if (!this.on()) return;
    if (session.pm) {
      if (!session.trigger && how !== 'exited') await this.deps.book.change(session.id, (file) => { file.turn += 1; });
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

  /** A worker the user closed: the same, and it is no one's worker any more (opened again, another PM may adopt it). */
  async closedByUser(sessionId: string): Promise<void> {
    const pm = this.deps.sessions().find((one) => one.id === sessionId)?.pmOf;
    if (pm) await this.resolve(pm, sessionId);
  }

  /**
   * Every 30 s: a worker at work with nothing new for the quiet delay is reported, once for that silence (a message to
   * it would only wait in its queue); and the catch-up once the setting is back on, or for a PM open again.
   */
  async sweep(): Promise<void> {
    if (!this.on()) return;
    if (!this.wasOn) await this.reconcile();
    else {
      const live = this.livePmIds();
      const back = new Set([...live].filter((id) => !this.livePms.has(id)));
      this.livePms = live;
      if (back.size) await this.reconcile(back);
    }
    const now = this.deps.now();
    const quietMs = this.deps.quietMs();
    for (const [pm, workers] of this.workersByPm()) {
      const outgoing = await this.deps.book.change(pm, (file) => workers.flatMap((session) => {
        const worker = ownWorker(file, session.id);
        if (!worker) return [];
        const { watch } = worker;
        const last = this.deps.lastEventAt(session.id);
        const quiet = session.state === 'work' && session.pausedUntil === undefined && now - last > quietMs;
        // a stop asked while it did not work (no turn to end) must not hide its next interruption
        if (session.state !== 'work' && session.state !== 'starting' && session.state !== 'perm') delete watch.stopAsked;
        // a sign of life (or no more work) ends the silence: the next one is a new one
        if (!quiet) {
          delete watch.quietSince;
          return [];
        }
        if (watch.quietSince === last) return [];
        watch.quietSince = last;
        const sent = this.write(pm, file, worker, session, 'quiet', now);
        return sent ? [sent] : [];
      }));
      for (const one of outgoing) this.send(() => this.deps.deliver(one.pm, one.text, one.tag));
    }
  }

  /**
   * At startup and when the setting is back on: each worker's state against its last report, for what happened while
   * nobody listened (a turn ended, a restart cut it off). A worker gone meanwhile is resolved. `only`: these PMs alone.
   */
  async reconcile(only?: ReadonlySet<string>): Promise<void> {
    if (!this.on()) return;
    if (!only) {
      this.wasOn = true;
      this.livePms = this.livePmIds();
    }
    const now = this.deps.now();
    const sessions = this.deps.sessions();
    for (const lead of sessions.filter((one) => this.isLivePm(one) && (!only || only.has(one.id)))) {
      const outgoing = await this.deps.book.change(lead.id, (file) => file.workers.filter((worker) => !worker.resolvedAt).flatMap((worker) => {
        const session = sessions.find((one) => one.id === worker.session);
        if (!session) { resolveWorker(file, worker.session, now); return []; }
        if (session.pm || session.pmOf !== lead.id) return [];
        const kind = decideReport(worker, session, { kind: 'reconcile' });
        if (!kind) return [];
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

  /**
   * A PM that takes reports: there, still a PM, not a trigger's run, not closed by the user (one at rest is woken up),
   * its process, if any, running as a PM (else it would be told it is none, and have no PM tools).
   */
  private isLivePm(session: SessionInfo | undefined): session is SessionInfo {
    return !!session?.pm && !session.trigger && (session.state !== 'closed' || !!session.resting) && !this.deps.roleChanged(session.id);
  }

  private livePmIds(): Set<string> {
    return new Set(this.deps.sessions().filter((one) => this.isLivePm(one)).map((one) => one.id));
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
      // Noted as seen without a word, so that the startup check does not take them for a finished turn: the stop the PM
      // asked for, and the end of the turn the usage limit stopped (its pause is reported).
      if (stopAsked && (event.how === 'interrupted' || event.how === 'failed')) this.write(pm, file, worker, session, 'stopped', now, true);
      if (event.kind === 'turnEnd' && session.pausedUntil !== undefined && worker.lastReport?.kind === 'paused') {
        worker.lastReport = { ...worker.lastReport, at: now, seq: session.lastSeq, turns: session.turns };
      }
      return null;
    });
    if (sent) this.send(() => this.deps.deliver(sent.pm, sent.text, sent.tag));
  }

  /**
   * Writes the report in the PM's file and gives the message to send; null when it was written already, or when it is
   * `silent` (noted as seen, nothing to tell the PM, so no line either).
   */
  private write(pm: string, file: PmFile, worker: PmWorker, session: SessionInfo, kind: ReportKind, now: number, silent = false): Outgoing | null {
    const key = `${session.id}:${kind}:${session.lastSeq}`;
    if (file.reports.some((one) => one.key === key)) return null;
    const line = silent ? '' : st.pm.report(kind, nameOf(session), worker.item ? itemTag(worker.item) : undefined, session.pausedUntil);
    file.reports = [...file.reports, { key, worker: session.id, kind, at: now }].slice(-PM_LIMITS.reports);
    worker.lastReport = { kind, at: now, line: line.slice(0, PM_LIMITS.line), seq: session.lastSeq, turns: session.turns };
    if (silent) return null;
    // the worker's words are data for the PM, never instructions: anything it read (a page, a file) may speak in them
    const said = kind === 'finished' || kind === 'waiting' ? this.deps.lastWords(session.id).slice(0, REPORT_WORDS) : '';
    return { pm, text: said ? `${line}\n\n${fenced('worker-words', st.pm.workerWords, said)}` : line, tag: { report: { worker: session.id, kind } } };
  }

  /** Closes a worker's job in its PM's plan and lets it go, like pm_worker_resolve. */
  private async resolve(pm: string, worker: string): Promise<void> {
    await this.deps.book.change(pm, (file) => { resolveWorker(file, worker, this.deps.now()); });
    this.deps.releaseWorker(worker, pm);
  }

  /** A message the PM cannot take (closing or switched off meanwhile) is dropped: its report stays written, it is not sent again. */
  private send(deliver: () => void) {
    try {
      deliver();
    } catch (error) {
      this.deps.log?.('a worker report was dropped: its PM could not take it (closing or gone), it is not sent again', error);
    }
  }
}
