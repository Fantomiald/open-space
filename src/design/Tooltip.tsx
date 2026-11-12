import {
  cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type FocusEvent, type MouseEvent, type PointerEvent, type ReactElement, type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { placeTooltip } from './tooltip-position.ts';

/** How long the pointer rests on a button, or the keyboard focus stays on it, before its tooltip shows. */
export const TOOLTIP_DELAY_MS = 300;

interface TriggerProps {
  ref?: Ref<HTMLElement>;
  'aria-label'?: string;
  'aria-describedby'?: string;
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
}

function assignRef(ref: Ref<HTMLElement> | undefined, node: HTMLElement | null) {
  if (typeof ref === 'function') ref(node);
  else if (ref) ref.current = node;
}

/**
 * Open Space's tooltip, in place of a native `title`: it names the one element it wraps (a button made of an icon) after
 * a short rest of the pointer on it, or as soon as the keyboard focus reaches it (`:focus-visible`), and goes on Escape,
 * a click, a blur, the pointer leaving, a scroll or a resize. It lives in the top layer (`popover="manual"`, rendered in
 * `document.body`), so no `overflow: hidden` clips it; `placeTooltip` puts it under the element, or above it when there
 * is no room below, inside the window. The element keeps its `aria-label`; the tooltip describes it
 * (`aria-describedby`) only when it says something else, so a screen reader does not read the same words twice.
 * A tooltip only shows on a visible pointer or keyboard focus: a touch shows nothing.
 */
export function Tooltip({ text, children }: { text: string; children: ReactElement<TriggerProps> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLElement | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const trigger = children.props;

  const cancel = useCallback(() => { window.clearTimeout(timer.current); timer.current = undefined; }, []);
  const hide = useCallback(() => { cancel(); setOpen(false); }, [cancel]);
  const showSoon = useCallback(() => {
    cancel();
    timer.current = window.setTimeout(() => { if (anchor.current?.getAttribute('aria-expanded') !== 'true') setOpen(true); }, TOOLTIP_DELAY_MS);
  }, [cancel]);
  const triggerRef = trigger.ref;
  const setAnchor = useCallback((node: HTMLElement | null) => { anchor.current = node; assignRef(triggerRef, node); }, [triggerRef]);

  useEffect(() => cancel, [cancel]);

  useLayoutEffect(() => {
    const element = bubble.current, target = anchor.current;
    if (!element || !target) return;
    if (!open) { if (element.matches(':popover-open')) element.hidePopover(); return; }
    element.showPopover();
    const box = target.getBoundingClientRect();
    const place = placeTooltip(box, { width: element.offsetWidth, height: element.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
    element.style.setProperty('--tooltip-left', `${place.left}px`);
    element.style.setProperty('--tooltip-top', `${place.top}px`);
    element.dataset.side = place.side;
  }, [open, text]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.activeElement === anchor.current) event.stopPropagation();
      hide();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, hide]);

  const describes = trigger['aria-label'] !== text;
  return (
    <>
      {cloneElement(children, {
        ref: setAnchor,
        'aria-describedby': describes ? [trigger['aria-describedby'], id].filter(Boolean).join(' ') : trigger['aria-describedby'],
        onPointerEnter: (event: PointerEvent<HTMLElement>) => { trigger.onPointerEnter?.(event); if (event.pointerType !== 'touch') showSoon(); },
        onPointerLeave: (event: PointerEvent<HTMLElement>) => { trigger.onPointerLeave?.(event); hide(); },
        onPointerDown: (event: PointerEvent<HTMLElement>) => { trigger.onPointerDown?.(event); hide(); },
        onClick: (event: MouseEvent<HTMLElement>) => { trigger.onClick?.(event); hide(); },
        onFocus: (event: FocusEvent<HTMLElement>) => { trigger.onFocus?.(event); if (event.currentTarget.matches(':focus-visible')) showSoon(); },
        onBlur: (event: FocusEvent<HTMLElement>) => { trigger.onBlur?.(event); hide(); },
      })}
      {createPortal(<div ref={bubble} id={id} className="cp-tooltip" role="tooltip" popover="manual">{text}</div>, document.body)}
    </>
  );
}
