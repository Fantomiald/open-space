import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import type { SlashCommand } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { commandAt, commandSuggestions, typedName } from '../state/commands.ts';
import { commandsIn, useSessions } from '../state/sessions.ts';

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
  /** the session's folder: its own commands are offered too */
  cwd?: string;
}

/**
 * A message field that suggests the slash commands as soon as a word starts with "/", at the start or in the middle
 * of the message (Tab or Enter completes it where it is). With
 * `shell`, like Claude Code's bash mode: a "!" typed first becomes a prompt in front of the field instead of text (the
 * value keeps it: "!ls"), and Backspace at the very start takes it away, back to a message.
 */
export const CommandField = forwardRef<HTMLTextAreaElement, Props>(function CommandField({ id, label, value, onChange, onSubmit, placeholder, rows = 3, onPaste, shell = false, cwd }, ref) {
  const shellMode = shell && value.startsWith('!');
  // the space after the "!" is the prompt's, not the command's
  const shown = shellMode ? value.slice(1).replace(/^ +/, '') : value;
  const [active, setActive] = useState(0);
  /** the user closed the suggestions with Escape; they come back on the next keystroke */
  const [dismissed, setDismissed] = useState(false);
  /** a draft that holds a command offers nothing until the user is back in the field */
  const [focused, setFocused] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => area.current!, []);
  /** where the caret is in the value, as the user moves it */
  const [caret, setCaret] = useState(value.length);
  const commands = useSessions((s) => commandsIn(s, cwd));
  const typing = shellMode ? null : commandAt(value, Math.min(caret, value.length));
  const typed = typing?.typed;
  const suggestions = useMemo(() => (dismissed || !focused || typed === undefined ? [] : commandSuggestions(commands, typed).slice(0, MAX_SUGGESTIONS)), [commands, typed, dismissed, focused]);
  const current = suggestions[Math.min(active, suggestions.length - 1)];
  const listId = `${id}-commands`;

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const edit = (next: string, at?: number) => {
    onChange(next);
    if (at !== undefined) setCaret(at);
    setActive(0);
    setDismissed(false);
  };
  /** The command typed under the caret becomes the one chosen, followed by a space, and the caret goes after it. */
  const complete = (command: SlashCommand) => {
    if (!typing) return;
    const inserted = `/${typedName(command)} `;
    const end = typing.start + typing.typed.length;
    const at = typing.start + inserted.length;
    edit(value.slice(0, typing.start) + inserted + value.slice(end).replace(/^ /, ''), at);
    requestAnimationFrame(() => area.current?.setSelectionRange(at, at));
  };
  const track = (e: React.SyntheticEvent<HTMLTextAreaElement>) => setCaret(e.currentTarget.selectionStart + (shellMode ? 1 : 0));

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (current) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((index) => Math.min(index + 1, suggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((index) => Math.max(index - 1, 0)); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissed(true); return; }
      // Enter on a name already typed in full sends it; otherwise Tab and Enter complete the name
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && typing?.typed !== `/${typedName(current)}`)) { e.preventDefault(); complete(current); return; }
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
              <strong>/{typedName(command)}</strong>
              {command.argumentHint && <span className="cp-muted"> {command.argumentHint}</span>}
              {command.description && <span className="cp-palette__description">{command.description}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="cp-command-field" data-shell={shellMode}>
        {shellMode && <span className="cp-command-field__prompt" aria-hidden="true">!</span>}
        <textarea
          id={id} ref={area} value={shown} rows={rows} data-composer data-command={value.startsWith('/')}
          aria-autocomplete="list" aria-controls={current ? listId : undefined} aria-activedescendant={current ? `${listId}-${current.name}` : undefined}
          placeholder={placeholder} onChange={(e) => edit(shellMode ? `!${e.target.value.replace(/^ +/, '')}` : e.target.value, e.target.selectionStart)} onKeyDown={onKeyDown} onPaste={onPaste}
          onSelect={track} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        />
      </div>
    </>
  );
});
