import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { findMentions, mentionAt } from '../../shared/mentions.ts';
import type { SessionInfo } from '../../shared/protocol.ts';
import { foldQuery } from '../../shared/search.ts';
import { t } from '../i18n/index.ts';
import { commandAt, commandSuggestions, typedName, withOwnCommands } from '../state/commands.ts';
import { commandsIn, useSessions } from '../state/sessions.ts';
import { SessionFace } from './SessionFace.tsx';

const MAX_SUGGESTIONS = 8;

/** A session the field can name with "@", and a word on it (its folder, at rest). */
export interface Mentionable { name: string; detail: string; session: SessionInfo }

/** A line of the suggestions: a command or a session. `insert` replaces what is typed; typed as `whole`, Enter sends. */
interface Suggestion { label: string; hint?: string; description?: string; insert: string; whole: string; face?: SessionInfo }

/** The sessions whose name starts with what follows the "@", then those whose name holds it, accents and case aside. */
function mentionSuggestions(people: readonly Mentionable[], typed: string): Suggestion[] {
  const word = foldQuery(typed);
  const named = (person: Mentionable) => foldQuery(person.name);
  const found = [...people.filter((person) => named(person).startsWith(word)), ...people.filter((person) => !named(person).startsWith(word) && named(person).includes(word))];
  return found.map((person) => ({ label: `@${person.name}`, description: person.detail, insert: `@${person.name} `, whole: `@${person.name}`, face: person.session }));
}

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
  /** a session's field: Open Space's own commands are offered too (/tag, /focus…) */
  own?: boolean;
  /** the sessions "@" names: suggested as it is typed, and marked in the text */
  people?: readonly Mentionable[];
}

/**
 * A message field that suggests the slash commands as soon as a word starts with "/", at the start or in the middle
 * of the message (Tab or Enter completes it where it is), and the sessions after an "@", marked once named. With
 * `shell`, like Claude Code's bash mode: a "!" typed first becomes a prompt in front of the field instead of text (the
 * value keeps it: "!ls"), and Backspace at the very start takes it away, back to a message.
 */
export const CommandField = forwardRef<HTMLTextAreaElement, Props>(function CommandField({ id, label, value, onChange, onSubmit, placeholder, rows = 3, onPaste, shell = false, cwd, own = false, people }, ref) {
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
  const folderCommands = useSessions((s) => commandsIn(s, cwd));
  const commands = useMemo(() => (own ? withOwnCommands(folderCommands, true) : folderCommands), [folderCommands, own]);
  const mentioning = shellMode || !people?.length ? null : mentionAt(value, Math.min(caret, value.length));
  const typing = mentioning ? { start: mentioning.start, typed: `@${mentioning.typed}` } : shellMode ? null : commandAt(value, Math.min(caret, value.length));
  const typed = typing?.typed;
  const suggestions = useMemo((): Suggestion[] => {
    if (dismissed || !focused || typed === undefined) return [];
    if (typed.startsWith('@')) return mentionSuggestions(people ?? [], typed.slice(1)).slice(0, MAX_SUGGESTIONS);
    return commandSuggestions(commands, typed).slice(0, MAX_SUGGESTIONS).map((command) => {
      const whole = `/${typedName(command)}`;
      return { label: whole, hint: command.argumentHint, description: command.description, insert: `${whole} `, whole };
    });
  }, [commands, people, typed, dismissed, focused]);
  const current = suggestions[Math.min(active, suggestions.length - 1)];
  const marks = useMemo(() => (shellMode || !people?.length ? [] : findMentions(value, people.map((person) => person.name))), [value, people, shellMode]);
  const overlay = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (overlay.current && area.current) overlay.current.scrollTop = area.current.scrollTop; });
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
  /** What is typed under the caret becomes the command or the session chosen, followed by a space, and the caret goes after it. */
  const complete = (suggestion: Suggestion) => {
    if (!typing) return;
    const inserted = suggestion.insert;
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
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && typing?.typed !== current.whole)) { e.preventDefault(); complete(current); return; }
    }
    if (shellMode && e.key === 'Backspace' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) { e.preventDefault(); edit(shown); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
  };

  return (
    <>
      <label className="cp-sr-only" htmlFor={id}>{label}</label>
      {current && (
        <ul id={listId} ref={list} role="listbox" className="cp-composer__commands" aria-label={t.common.commandField.commands}>
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.label} id={`${listId}-${index}`} role="option" aria-selected={suggestion === current} data-active={suggestion === current} data-face={!!suggestion.face}
              onMouseDown={(e) => e.preventDefault()} onClick={() => complete(suggestion)}
            >
              {suggestion.face && <SessionFace session={suggestion.face} resting={suggestion.face.resting} />}
              <strong>{suggestion.label.startsWith('@') ? <><span className="cp-at">@</span>{suggestion.label.slice(1)}</> : suggestion.label}</strong>
              {suggestion.hint && <span className="cp-muted"> {suggestion.hint}</span>}
              {suggestion.description && <span className="cp-palette__description">{suggestion.description}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="cp-command-field" data-shell={shellMode} data-marked={marks.length > 0}>
        {shellMode && <span className="cp-command-field__prompt" aria-hidden="true">!</span>}
        <textarea
          id={id} ref={area} value={shown} rows={rows} data-composer data-command={value.startsWith('/')}
          aria-autocomplete="list" aria-controls={current ? listId : undefined} aria-activedescendant={current ? `${listId}-${suggestions.indexOf(current)}` : undefined}
          placeholder={placeholder} onChange={(e) => edit(shellMode ? `!${e.target.value.replace(/^ +/, '')}` : e.target.value, e.target.selectionStart)} onKeyDown={onKeyDown} onPaste={onPaste}
          onSelect={track} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onScroll={(e) => { if (overlay.current) overlay.current.scrollTop = e.currentTarget.scrollTop; }}
        />
        {marks.length > 0 && (
          <div ref={overlay} className="cp-command-field__marks" aria-hidden="true">
            {marks.map((mark, index) => <span key={mark.start}>{value.slice(index ? marks[index - 1].end : 0, mark.start)}<mark><span className="cp-at">@</span>{value.slice(mark.start + 1, mark.end)}</mark></span>)}
            {value.slice(marks.at(-1)!.end)}
            {/* a last empty line keeps its height, as in the field */}
            {'\u200b'}
          </div>
        )}
      </div>
    </>
  );
});
