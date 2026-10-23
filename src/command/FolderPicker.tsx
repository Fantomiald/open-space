import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n/index.ts';
import { homeRelative, splitPath } from '../lib/format.ts';
import { matchFolders } from '../state/folders.ts';
import { useDismiss } from './useDismiss.ts';

/**
 * The session's folder: typed, or picked in the folders found under the roots, which open above the field (the launcher
 * sits at the bottom of the window). Drawn by hand: the browser's own list (datalist) is as narrow as the field and
 * opened below it in Safari, out of the window.
 */
export function FolderPicker({ directories, value, placeholder, onChange }: { directories: readonly string[]; value: string; placeholder: string; onChange: (folder: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); setActive(-1); }, []);
  useDismiss(open, box, close);
  const matches = useMemo(() => matchFolders(directories, value), [directories, value]);
  const shown = open && matches.length > 0;
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
    <div className="cp-chip cp-folder" data-folder title={t.composer.folderPicker.title} ref={box}>
      <input
        aria-label={t.composer.folderPicker.label} role="combobox" aria-expanded={shown} aria-controls="folder-picker" aria-autocomplete="list" autoComplete="off" spellCheck={false}
        aria-activedescendant={shown && active >= 0 ? `folder-option-${active}` : undefined}
        value={value} placeholder={placeholder} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
      />
      {shown && (
        <ul className="cp-folder__panel" id="folder-picker" role="listbox" aria-label={t.composer.folderPicker.list}>
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
