import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n/index.ts';
import { folderName, homeRelative, splitPath } from '../lib/format.ts';
import { matchFolders } from '../state/folders.ts';
import { useDismiss } from './useDismiss.ts';

/**
 * The session's folder: typed, or picked in the folders found under the roots, which open above the field (the launcher
 * sits at the bottom of the window). Drawn by hand: the browser's own list (datalist) is as narrow as the field and
 * opened below it in Safari, out of the window. `field`: a full-width field in a form, its full path shown and its list
 * below it, instead of the launcher's chip.
 */
export function FolderPicker({ directories, value, placeholder, onChange, field }: { directories: readonly string[]; value: string; placeholder: string; onChange: (folder: string) => void; field?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // the folder's name alone at rest, its full path while typing
  const [focused, setFocused] = useState(false);
  // every folder until something is typed: the one already chosen would only list itself
  const [typed, setTyped] = useState(false);
  const close = useCallback(() => { setOpen(false); setActive(-1); setTyped(false); }, []);
  useDismiss(open, box, close);
  const matches = useMemo(() => matchFolders(directories, typed ? value : ''), [directories, value, typed]);
  const shown = open && matches.length > 0;
  // the list never runs past what holds it: the launcher clips what overflows it, and a short window (Windows' title bar
  // and scaling) leaves less than the list's full height above the field
  const [room, setRoom] = useState<number>();
  useLayoutEffect(() => {
    if (!shown) return;
    const measure = () => { if (box.current) setRoom(roomFor(box.current, Boolean(field))); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [shown, field]);
  useEffect(() => { if (active >= 0) document.getElementById(`folder-option-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = (directory: string) => { onChange(homeRelative(directory)); close(); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + matches.length) % Math.max(matches.length, 1));
    } else if (event.key === 'Enter' && shown && matches[active]) {
      event.preventDefault();
      pick(matches[active]);
    }
  };

  return (
    <div className={field ? 'cp-folder' : 'cp-chip cp-folder'} data-folder={field ? undefined : true} data-field={field || undefined} title={field ? undefined : t.composer.folderPicker.title} ref={box}>
      <input
        ref={input} title={value || placeholder}
        aria-label={t.composer.folderPicker.label} role="combobox" aria-expanded={shown} aria-controls="folder-picker" aria-autocomplete="list" autoComplete="off" spellCheck={false}
        aria-activedescendant={shown && active >= 0 ? `folder-option-${active}` : undefined}
        value={focused || field ? value : folderName(value)} placeholder={focused || field ? placeholder : folderName(placeholder)}
        onFocus={() => { setFocused(true); setOpen(true); requestAnimationFrame(() => { if (document.activeElement === input.current) input.current?.select(); }); }} onBlur={() => { setFocused(false); close(); }} onKeyDown={onKeyDown}
        onChange={(e) => { onChange(e.target.value); setTyped(true); setOpen(true); setActive(-1); }}
      />
      {shown && (
        <ul className="cp-folder__panel" id="folder-picker" role="listbox" aria-label={t.composer.folderPicker.list} style={room === undefined ? undefined : ({ '--room': `${room}px` } as CSSProperties)}>
          {matches.map((directory, index) => {
            const { folder, name } = splitPath(homeRelative(directory));
            return (
              <li
                key={directory} id={`folder-option-${index}`} role="option" aria-selected={index === active} className="cp-folder__option"
                onPointerDown={(e) => e.preventDefault()} onClick={() => pick(directory)} onPointerEnter={() => setActive(index)}
              >
                <span className="cp-folder__name">{name}</span>
                <span className="cp-folder__parent">{folder}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The height free for the list, above the field (below it for `field`), inside the nearest ancestor that clips and the window. */
function roomFor(element: HTMLElement, below: boolean): number {
  let top = 0;
  let bottom = window.innerHeight;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent);
    if (overflowX === 'visible' && overflowY === 'visible') continue;
    const bounds = parent.getBoundingClientRect();
    top = Math.max(top, bounds.top);
    bottom = Math.min(bottom, bounds.bottom);
  }
  const gap = 12; // the list's offset from the field, and a little air
  const rect = element.getBoundingClientRect();
  return Math.max(0, Math.floor(below ? bottom - rect.bottom - gap : rect.top - top - gap));
}
