import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { comboOf, DEFAULT_SHORTCUTS, resolveShortcuts, shortcutProblem, withShortcut, type ShortcutAction, type Shortcuts as Combos } from '../../shared/shortcuts.ts';
import { t } from '../i18n/index.ts';
import { MODIFIER, OPTION } from '../lib/platform.ts';
import { useSessions } from '../state/sessions.ts';
import { UndoIcon } from './Icons.tsx';
import { shortcutKeys, shortcutText } from './useShortcut.ts';

/** A row of the list: a shortcut the user can change, or one the page keeps as it is. */
type Row = { action: ShortcutAction } | { label: string; keys: readonly string[] };

/** Keeps the user's own combos (only those that differ from the default) in the settings. */
const save = (next: Partial<Combos>) => useSessions.getState().setPreferences({ shortcuts: next });

/** The keyboard shortcuts, as App.tsx and the windows listen to them: a click on one listens for the keys to give it instead. */
export function Shortcuts() {
  const words = t.settings.prefs.shortcuts;
  const overrides = useSessions((s) => s.preferences.shortcuts);
  const current = resolveShortcuts(overrides);
  const [listening, setListening] = useState<ShortcutAction | null>(null);
  const [problem, setProblem] = useState<{ action: ShortcutAction; text: string } | null>(null);
  // the settings' dialog, whose Escape cancels the listening instead of closing it
  const dialog = useRef<HTMLDialogElement | null>(null);

  // while a row listens, the next keys are for it alone: neither App.tsx's shortcuts nor the dialog's Escape see them
  useEffect(() => {
    if (!listening) return;
    const shortcuts = resolveShortcuts(overrides);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { setProblem(null); setListening(null); return; }
      const combo = comboOf(e);
      if (!combo) return;
      const trouble = shortcutProblem(listening, combo, shortcuts);
      if (trouble) { setProblem({ action: listening, text: trouble === 'reserved' ? words.reserved : words.taken(words[trouble.taken]) }); return; }
      setProblem(null);
      setListening(null);
      if (combo !== shortcuts[listening]) save(withShortcut(overrides, listening, combo));
    };
    const modal = dialog.current;
    const keepOpen = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKey, true);
    modal?.addEventListener('cancel', keepOpen);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      modal?.removeEventListener('cancel', keepOpen);
    };
  }, [listening, overrides, words]);

  const listen = (action: ShortcutAction) => (e: MouseEvent<HTMLElement>) => {
    dialog.current = e.currentTarget.closest('dialog');
    setProblem(null);
    setListening(listening === action ? null : action);
  };

  const groups: readonly (readonly [string, readonly Row[]])[] = [
    [words.groups.everywhere, [{ action: 'search' }, { action: 'settings' }, { action: 'focus' }, { action: 'terminal' }]],
    [words.groups.sessions, [
      { action: 'newSession' }, { action: 'quickSession' }, { label: words.projectSession, keys: [OPTION, '1…9'] }, { label: words.command, keys: ['/'] },
      { action: 'threadSearch' }, { label: words.interrupt, keys: ['esc'] }, { action: 'hide' },
    ]],
    [words.groups.windows, [{ label: words.move, keys: [OPTION, words.drag] }, { label: words.zoom, keys: [OPTION, words.wheel] }, { label: words.magnets, keys: [MODIFIER] }]],
  ];

  const kbds = (keys: readonly string[]) => keys.map((key) => <kbd key={key} className="cp-kbd">{key}</kbd>);

  const row = (item: Row) => {
    if (!('action' in item)) {
      return (
        <div key={item.label} className="cp-keys__row">
          <dt>{item.label}</dt>
          <dd>{kbds(item.keys)}</dd>
        </div>
      );
    }
    const { action } = item;
    const label = words[action];
    const keys = shortcutKeys(current[action]);
    const on = listening === action;
    const trouble = problem?.action === action ? problem.text : null;
    return (
      <div key={action} className="cp-keys__row">
        <dt>{label}</dt>
        <dd>
          {trouble && <span className="cp-keys__problem">{trouble}</span>}
          <button
            type="button" className="cp-keys__combo" data-listening={on || undefined} aria-pressed={on} title={words.changeHint}
            aria-label={words.change(label, shortcutText(keys))} onClick={listen(action)} onBlur={() => { if (on) { setProblem(null); setListening(null); } }}
          >
            {on ? words.listening : kbds(keys)}
          </button>
          {current[action] !== DEFAULT_SHORTCUTS[action] && (
            <button type="button" className="cp-icon-button" data-size="small" aria-label={words.reset(label)} title={words.reset(label)} onClick={() => save(withShortcut(overrides, action, null))}>
              <UndoIcon />
            </button>
          )}
        </dd>
      </div>
    );
  };

  const changed = Object.keys(overrides ?? {}).length > 0;
  return (
    <>
      <p className="cp-sr-only" aria-live="polite">{listening ? words.listeningFor(words[listening]) : problem?.text ?? ''}</p>
      {groups.map(([title, rows]) => (
        <section key={title} className="cp-prefs__group" aria-label={title}>
          <h4 className="cp-prefs__group-title">{title}</h4>
          <dl className="cp-prefs__card cp-keys">{rows.map(row)}</dl>
        </section>
      ))}
      {changed && (
        <button type="button" className="cp-button cp-keys__reset-all" data-size="small" onClick={() => { setProblem(null); save({}); }}>
          <UndoIcon /> {words.resetAll}
        </button>
      )}
    </>
  );
}
