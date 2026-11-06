import { useState } from 'react';
import { t } from '../i18n/index.ts';
import { actionName, type FeedItem } from '../state/feed.ts';

/** The lines of an output shown before "… +N lines" opens the rest, like Claude Code before ctrl+o. */
const SHOWN_LINES = 3;

/**
 * One action of a session as Claude Code shows it (Preferences.detailedActions): "Bash(the command)", then what it
 * gave back: its first lines, how many lines a file read had, or that it is still running or failed.
 */
export function ActionBlock({ call }: { call: FeedItem & { kind: 'tool' } }) {
  const words = t.session.feed.action;
  const [open, setOpen] = useState(false);
  const output = call.output?.read ? undefined : call.output;
  const kept = output?.lines ?? [];
  const lines = open ? kept : kept.slice(0, SHOWN_LINES);
  const status = call.ok === null ? 'running' : call.ok ? 'done' : 'failed';
  return (
    <li className="cp-feed__item" data-kind="action">
      <div className="cp-edit" data-status={status}>
        <p className="cp-edit__head"><code>{actionName(call.tool)}</code>{call.detail ? `(${call.detail})` : ''}</p>
        {call.ok === null ? <p className="cp-edit__summary">{words.running}</p>
          : call.output?.read ? <p className="cp-edit__summary">{words.read(call.output.total)}</p>
            : lines.length ? <pre className="cp-edit__output">{lines.join('\n')}</pre>
              : <p className="cp-edit__summary">{call.ok ? words.empty : words.failed}</p>}
        {open && output && output.total > kept.length && <p className="cp-edit__summary">{words.cut(output.total - kept.length)}</p>}
        {output && output.total > SHOWN_LINES && (
          <button type="button" className="cp-edit__more" onClick={() => setOpen(!open)}>{open ? t.session.feed.diff.less : t.session.feed.diff.more(output.total - lines.length)}</button>
        )}
      </div>
    </li>
  );
}
