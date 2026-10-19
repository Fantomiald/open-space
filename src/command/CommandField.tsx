import { forwardRef, useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import type { SlashCommand } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { commandSuggestions } from '../state/commands.ts';
import { useSessions } from '../state/sessions.ts';

const MAX_SUGGESTIONS = 8;

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Enter (without Shift) once no suggestion is waiting to be completed */
  onSubmit: () => void;
  placeholder: string;
  rows?: number;
  /** pasting into the field (a screenshot is attached, see useAttachments) */
  onPaste?: (event: ClipboardEvent) => void;
  /** "!" typed first turns the field into a shell command, as in Claude Code (see below) */
  shell?: boolean;
}

/**
 * A message field that suggests the slash commands as soon as the text starts with "/" (Tab or Enter completes). With
 * `shell`, like Claude Code's bash mode: a "!" typed first becomes a prompt in front of the field instead of text (the
 * value keeps it: "!ls"), and Backspace at the very start takes it away, back to a message.
 */
export const CommandField = forwardRef<HTMLTextAreaElement, Props>(function CommandField({ id, label, value, onChange, onSubmit, placeholder, rows = 3, onPaste, shell = false }, ref) {
  const shellMode = shell && value.startsWith('!');
  // the space after the "!" is the prompt's, not the command's
  const shown = shellMode ? value.slice(1).replace(/^ +/, '') : value;
  const [active, setActive] = useState(0);
  /** the user closed the suggestions with Escape; they come back on the next keystroke */
  const [dismissed, setDismissed] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const commands = useSessions((s) => s.commands);
  const suggestions = useMemo(() => (dismissed ? [] : commandSuggestions(commands, value).slice(0, MAX_SUGGESTIONS)), [commands, value, dismissed]);
  const current = suggestions[Math.min(active, suggestions.length - 1)];
  const listId = `${id}-commands`;

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const edit = (next: string) => {
    onChange(next);
    setActive(0);
    setDismissed(false);
  };
  const complete = (command: SlashCommand) => edit(`/${command.name} `);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (current) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((index) => Math.min(index + 1, suggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((index) => Math.max(index - 1, 0)); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissed(true); return; }
      // Enter on a name already typed in full sends it; otherwise Tab and Enter complete the name
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && value !== `/${current.name}`)) { e.preventDefault(); complete(current); return; }
    }
    if (shellMode && e.key === 'Backspace' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) { e.preventDefault(); edit(shown); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
  };

  return (
    <>
      <label className="cp-sr-only" htmlFor={id}>{label}</label>
      {current && (
        <ul id={listId} ref={list} role="listbox" className="cp-composer__commands" aria-label={t.common.commandField.commands}>
          {suggestions.map((command) => (
            <li
              key={command.name} id={`${listId}-${command.name}`} role="option" aria-selected={command === current} data-active={command === current}
              onMouseDown={(e) => e.preventDefault()} onClick={() => complete(command)}
            >
              <strong>/{command.name}</strong>
              {command.argumentHint && <span className="cp-muted"> {command.argumentHint}</span>}
              {command.description && <span className="cp-palette__description">{command.description}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="cp-command-field" data-shell={shellMode}>
        {shellMode && <span className="cp-command-field__prompt" aria-hidden="true">!</span>}
        <textarea
          id={id} ref={ref} value={shown} rows={rows} data-composer data-command={value.startsWith('/')}
          aria-autocomplete="list" aria-controls={current ? listId : undefined} aria-activedescendant={current ? `${listId}-${current.name}` : undefined}
          placeholder={placeholder} onChange={(e) => edit(shellMode ? `!${e.target.value.replace(/^ +/, '')}` : e.target.value)} onKeyDown={onKeyDown} onPaste={onPaste}
        />
      </div>
    </>
  );
});
