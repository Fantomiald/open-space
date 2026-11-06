import { useCallback, useEffect, useRef, useState } from 'react';
import type { BackgroundTask } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { backgroundLabel } from '../state/labels.ts';
import { useSessions } from '../state/sessions.ts';
import { TerminalIcon } from './Icons.tsx';
import { useDismiss } from './useDismiss.ts';

/**
 * What a session left running in the background, worded as Claude Code's footer does ("1 shell"): a chip by the field,
 * opening the list above the field, where each task is stopped on its own (stop_task); a stop refused (its error shows as
 * a toast) can be tried again once the list is closed. `compact`: a small window, the count only.
 */
export function BackgroundTasks({ sessionId, tasks, compact = false }: { sessionId: string; tasks: readonly BackgroundTask[]; compact?: boolean }) {
  const send = useSessions((s) => s.send);
  const words = t.session.background;
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  useEffect(() => { if (!open) setStopping(new Set()); }, [open]);
  const label = backgroundLabel(tasks);

  const stop = (taskId: string) => {
    setStopping(new Set([...stopping, taskId]));
    send({ t: 'stopTask', sessionId, taskId });
  };

  return (
    <div className="cp-background" ref={box}>
      <button type="button" className="cp-changes-chip" aria-expanded={open} aria-haspopup="true" aria-label={label} title={words.title} onClick={() => setOpen(!open)}>
        <TerminalIcon /><span className="cp-background__label">{compact ? tasks.length : label}</span>
      </button>
      {open && (
        <ul className="cp-background__panel" aria-label={words.listLabel}>
          {tasks.map((task) => (
            <li key={task.id} className="cp-background__task">
              <span className="cp-background__kind">{words.kinds[task.kind ?? 'other']}</span>
              <span className="cp-background__description" title={task.description}>{task.description}</span>
              <button
                type="button" className="cp-button" data-size="small" disabled={stopping.has(task.id)}
                title={words.stopTitle(task.description)} onClick={() => stop(task.id)}
              >
                {words.stop}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
