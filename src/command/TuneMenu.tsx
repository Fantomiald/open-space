import { type CSSProperties, useCallback, useId, useRef, useState } from 'react';
import { Select } from './Select.tsx';
import { EFFORTS, PERMISSION_MODES, type Effort, type PermissionMode, type TuneChange } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { modeLabel, models } from '../state/labels.ts';
import { useSessions } from '../state/sessions.ts';
import { BranchIcon, TuneIcon, UltracodeIcon } from './Icons.tsx';
import { useDismiss } from './useDismiss.ts';

/** What the menu shows: a session's own settings, or those a new session will start with. */
export interface Tuning { model: string; effort?: Effort; ultracode?: boolean; permissionMode: PermissionMode }

/**
 * The model, effort, permissions and ultracode in one button (the bar has no room for four more), opening a panel to change them at
 * once: a running session's (see Session.tune), or the next one's in the launcher. The models are Claude Code's own
 * list, with the efforts each takes; until it was asked for, Open Space's short list and every effort.
 * In a small window, the button is an icon that says them in its tooltip.
 */
/** The launcher's choice of a branch of its own for the new session (a folder in a git repository only). */
export interface Isolation { isolated: boolean; onChange: (isolated: boolean) => void }

export function TuneMenu({ tuning, cwd, onChange, compact = false, isolation }: { tuning: Tuning; cwd: string; onChange: (change: TuneChange) => void; compact?: boolean; isolation?: Isolation }) {
  const catalog = useSessions((s) => s.models);
  // Claude Code names ultracode in /effort's hint only when it is offered (dynamic workflows on, in its /config)
  const effortHint = useSessions((s) => (s.folderCommands[cwd] ?? s.commands).find((command) => command.name === 'effort')?.argumentHint);
  const ultracodeOffered = !!tuning.ultracode || effortHint === undefined || effortHint.includes('ultracode');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  const panelId = useId();
  const words = t.composer.tune;
  const chosen = tuning.model || 'default';
  const choices: { value: string; label: string; description?: string; efforts: readonly Effort[] }[] = catalog.length
    ? catalog
    : models().map(([value, label]) => ({ value: value || 'default', label, efforts: EFFORTS }));
  // a model given by its full name, or not offered any more, stays shown as it is
  const options = choices.some((choice) => choice.value === chosen) ? choices : [...choices, { value: chosen, label: chosen, efforts: EFFORTS }];
  const model = options.find((choice) => choice.value === chosen)!;
  // the slider goes from the default effort ('') to the highest the model takes
  const steps: (Effort | '')[] = ['', ...model.efforts];
  const effort = tuning.effort && model.efforts.includes(tuning.effort) ? tuning.effort : '';
  const effortName = (value: Effort | '') => (value ? words.efforts[value] : words.defaultEffort);
  const summary = [shortModelName(model), model.efforts.length > 0 && effortName(effort), modeLabel(tuning.permissionMode, 'short'), tuning.ultracode && words.ultracode].filter(Boolean).join(' · ');
  // how far the slider is filled, and how hot it glows (data-effort)
  const fill = { '--fill': `${(steps.indexOf(effort) / Math.max(1, steps.length - 1)) * 100}%` } as CSSProperties;
  return (
    <div className="cp-tune" ref={box} data-effort={effort || 'auto'} data-ultracode={tuning.ultracode || undefined}>
      {compact ? (
        <button
          type="button" className="cp-icon-button cp-tune__chip" data-variant="outlined" aria-expanded={open} aria-controls={panelId}
          aria-label={`${words.title} : ${summary}`} title={summary} onClick={() => setOpen(!open)}
        ><TuneIcon /></button>
      ) : (
        <button type="button" className="cp-button cp-tune__chip" aria-expanded={open} aria-controls={panelId} aria-label={summary} title={summary} onClick={() => setOpen(!open)}>
          {tuning.ultracode && <span className="cp-tune__ultracode"><UltracodeIcon /></span>}
          {shortModelName(model)}{model.efforts.length > 0 && <span className="cp-muted"> · <span className="cp-tune__level">{effortName(effort)}</span></span>}
        </button>
      )}
      {open && (
        <div className="cp-tune__panel" id={panelId} role="group" aria-label={words.title}>
          <div className="cp-popover-field">
            <span>{words.model}</span>
            <Select aria-label={words.model} value={chosen} onChange={(e) => onChange({ model: e.target.value === 'default' ? '' : e.target.value })}>
              {options.map((choice) => <option key={choice.value} value={choice.value}>{shortModelName(choice)}</option>)}
            </Select>
          </div>
          {steps.length > 1 && (
            <label className="cp-popover-field cp-effort" style={fill}>
              <span>{words.effort} <output>{effortName(effort)}</output></span>
              <input type="range" min={0} max={steps.length - 1} step={1} value={steps.indexOf(effort)} onChange={(e) => onChange({ effort: steps[Number(e.target.value)] })} />
            </label>
          )}
          <div className="cp-popover-field">
            <span>{words.permissions}</span>
            <Select aria-label={words.permissions} value={tuning.permissionMode} title={modeLabel(tuning.permissionMode)} onChange={(e) => onChange({ permissionMode: e.target.value as PermissionMode })}>
              {PERMISSION_MODES.map((mode) => <option key={mode} value={mode}>{modeLabel(mode, 'short')}</option>)}
            </Select>
          </div>
          {isolation && (
            <div className="cp-popover-field">
              <span id={`${panelId}-folder`}>{t.branches.tune.folder}</span>
              <div className="cp-segmented cp-tune__folder" role="group" aria-labelledby={`${panelId}-folder`}>
                <button type="button" aria-pressed={!isolation.isolated} title={t.branches.tune.sharedTitle} onClick={() => isolation.onChange(false)}>{t.branches.tune.shared}</button>
                <button type="button" aria-pressed={isolation.isolated} title={t.branches.tune.isolatedTitle} onClick={() => isolation.onChange(true)}><BranchIcon />{t.branches.tune.isolated}</button>
              </div>
            </div>
          )}
          {ultracodeOffered && (
            <label className="cp-ultracode">
              <span><UltracodeIcon /><strong>{words.ultracode}</strong></span>
              <input type="checkbox" role="switch" checked={!!tuning.ultracode} aria-checked={!!tuning.ultracode} onChange={(e) => onChange({ ultracode: e.target.checked })} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** "Opus 5.5", and Open Space's short name for Claude Code's default: its own ("Default (recommended)") is long for a chip. */
const shortModelName = (choice: { value: string; label: string }) => (choice.value === 'default' ? t.session.models.default : choice.label.replace(/\s*\(.*\)$/, ''));
