import { useEffect, useMemo, useRef, useState } from 'react';
import type { SlashCommand } from '../../shared/protocol.ts';
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

  return (
    <Modal title="Commandes" onClose={close} wide>
      <div className="cp-palette" onKeyDown={onKeyDown}>
        <div className="cp-palette__target" role="radiogroup" aria-label="Envoyer à">
          <label><input type="radio" name="palette-target" checked={target === 'selected'} disabled={!selected} onChange={() => setTarget('selected')} /> {selected ? `Session ${selected.name}` : 'Aucune session sélectionnée'}</label>
          <label><input type="radio" name="palette-target" checked={target === 'new' || !selected} onChange={() => setTarget('new')} /> Nouvelle session</label>
        </div>
        <label className="cp-sr-only" htmlFor="palette-query">Chercher une commande</label>
        <input id="palette-query" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} placeholder="Chercher une commande (kit, design, seo…)" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={shown[active] ? `palette-${shown[active].name}` : undefined} autoFocus />
        <label className="cp-sr-only" htmlFor="palette-args">Arguments</label>
        <input id="palette-args" value={args} onChange={(e) => setArgs(e.target.value)} placeholder="Arguments (facultatif)" />
        <ul id="palette-list" ref={list} role="listbox" className="cp-palette__list" aria-label="Commandes disponibles">
          {shown.map((command, index) => (
            <li key={command.name} id={`palette-${command.name}`} role="option" aria-selected={index === active} data-active={index === active} onMouseEnter={() => setActive(index)} onClick={() => run(command)}>
              <strong>/{command.name}</strong>
              {command.argumentHint && <span className="cp-muted"> {command.argumentHint}</span>}
              {command.description && <span className="cp-palette__description">{command.description}</span>}
            </li>
          ))}
          {shown.length === 0 && <li className="cp-muted">{commands.length === 0 ? 'Aucune commande connue : elles apparaissent dès qu’une session a démarré.' : 'Aucun résultat.'}</li>}
        </ul>
        {found.length > shown.length && <p className="cp-muted" role="status">{shown.length} commandes affichées sur {found.length} : précise la recherche pour voir les autres.</p>}
      </div>
    </Modal>
  );
}
