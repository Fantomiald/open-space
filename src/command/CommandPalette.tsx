import { useEffect, useMemo, useRef, useState } from 'react';
import type { SlashCommand } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { findCommands } from '../state/commands.ts';
import { useSessions } from '../state/sessions.ts';
import { Modal } from './Modal.tsx';

const MAX_SHOWN = 80;

/** Slash commands read from the init message of Claude Code, as a searchable list. */
export function CommandPalette() {
  const open = useSessions((s) => s.paletteOpen);
  return open ? <PaletteContent /> : null;
}

function PaletteContent() {
  const commands = useSessions((s) => s.commands);
  const selected = useSessions((s) => (s.selectedId ? s.sessions[s.selectedId] : undefined));
  const openPalette = useSessions((s) => s.openPalette);
  const openNewSession = useSessions((s) => s.openNewSession);
  const sendText = useSessions((s) => s.sendText);
  const [query, setQuery] = useState('');
  const [args, setArgs] = useState('');
  const [target, setTarget] = useState<'selected' | 'new'>(selected ? 'selected' : 'new');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const found = useMemo(() => findCommands(commands, query), [commands, query]);
  const shown = found.slice(0, MAX_SHOWN);

  // keyboard selection stays visible
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const close = () => openPalette(false);

  const run = (command: SlashCommand) => {
    const text = `/${command.name}${args.trim() ? ` ${args.trim()}` : ''}`;
    close();
    if (target === 'selected' && selected) sendText(selected.id, text);
    else openNewSession({ command: text });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); run(shown[active]); }
  };

  const words = t.common.palette;
  return (
    <Modal title={words.title} onClose={close} wide>
      <div className="cp-palette" onKeyDown={onKeyDown}>
        <div className="cp-palette__target" role="radiogroup" aria-label={words.sendTo}>
          <label><input type="radio" name="palette-target" checked={target === 'selected'} disabled={!selected} onChange={() => setTarget('selected')} /> {selected ? words.selectedSession(selected.name) : words.noSelection}</label>
          <label><input type="radio" name="palette-target" checked={target === 'new' || !selected} onChange={() => setTarget('new')} /> {words.newSession}</label>
        </div>
        <label className="cp-sr-only" htmlFor="palette-query">{words.search}</label>
        <input id="palette-query" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} placeholder={words.searchPlaceholder} role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={shown[active] ? `palette-${shown[active].name}` : undefined} autoFocus />
        <label className="cp-sr-only" htmlFor="palette-args">{words.arguments}</label>
        <input id="palette-args" value={args} onChange={(e) => setArgs(e.target.value)} placeholder={words.argumentsPlaceholder} />
        <ul id="palette-list" ref={list} role="listbox" className="cp-palette__list" aria-label={words.available}>
          {shown.map((command, index) => (
            <li key={command.name} id={`palette-${command.name}`} role="option" aria-selected={index === active} data-active={index === active} onMouseEnter={() => setActive(index)} onClick={() => run(command)}>
              <strong>/{command.name}</strong>
              {command.argumentHint && <span className="cp-muted"> {command.argumentHint}</span>}
              {command.description && <span className="cp-palette__description">{command.description}</span>}
            </li>
          ))}
          {shown.length === 0 && <li className="cp-muted">{commands.length === 0 ? words.noneKnown : words.noResult}</li>}
        </ul>
        {found.length > shown.length && <p className="cp-muted" role="status">{words.truncated(shown.length, found.length)}</p>}
      </div>
    </Modal>
  );
}
