import { Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, ChevronDownIcon } from './Icons.tsx';
import { useDismiss } from './useDismiss.ts';

type Option = { value?: string | number; children?: ReactNode; disabled?: boolean; lang?: string };

/** Native-select shaped API, with a dark list in the top layer so settings scroll panes never clip it. */
export function Select({ value, children, onChange, disabled, title, id, 'aria-label': label, 'aria-labelledby': labelledBy }: {
  value: string | number | undefined; children: ReactNode; onChange: (event: { target: { value: string } }) => void;
  disabled?: boolean; title?: string; id?: string; 'aria-label'?: string; 'aria-labelledby'?: string;
}) {
  const choices = Children.toArray(children).filter(isValidElement<Option>).map((child) => ({ ...child.props, value: String(child.props.value ?? '') }));
  const chosen = choices.find((choice) => choice.value === String(value ?? '')) ?? choices[0];
  const [open, setOpen] = useState(false);
  const popupId = useId();
  const box = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);
  useDismiss(open, box, close);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    menu.current.showPopover();
    const selected = menu.current.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)') ?? menu.current.querySelector<HTMLButtonElement>('button:not(:disabled)');
    selected?.focus();
    selected?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  return (
    <div className="cp-select" ref={box}>
      <button ref={trigger} id={id} type="button" className="cp-select__button" disabled={disabled || !choices.length} aria-label={label} aria-labelledby={labelledBy}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? popupId : undefined} title={title ?? (typeof chosen?.children === 'string' ? chosen.children : undefined)}
        onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>
        <span>{chosen?.children}</span><ChevronDownIcon />
      </button>
      {open && (
        <div ref={menu} id={popupId} className="cp-select__menu" popover="manual" role="listbox" aria-label={label} aria-labelledby={labelledBy} onKeyDown={(event) => {
          if (event.key === 'Tab') { close(); return; }
          const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          let next = event.key === 'ArrowDown' ? (current + 1) % buttons.length : event.key === 'ArrowUp' ? (current - 1 + buttons.length) % buttons.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
          if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey) {
            const now = Date.now();
            typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + event.key.toLocaleLowerCase(), at: now };
            next = buttons.findIndex((button) => button.textContent?.trim().toLocaleLowerCase().startsWith(typed.current.text));
          }
          if (next >= 0) { event.preventDefault(); buttons[next].focus(); }
        }}>
          {choices.map((choice) => (
            <button key={choice.value} type="button" role="option" aria-selected={choice.value === chosen?.value} disabled={choice.disabled} lang={choice.lang}
              tabIndex={choice.value === chosen?.value ? 0 : -1} onClick={() => { onChange({ target: { value: choice.value } }); close(); }}>
              <span className="cp-select__check" aria-hidden="true">{choice.value === chosen?.value && <CheckIcon />}</span><span>{choice.children}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
