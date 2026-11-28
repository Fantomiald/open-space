import { useEffect, useRef, type ReactNode } from 'react';
import { boxVariables } from './boxes.ts';
import { FreeHandles } from './FreeHandles.tsx';
import { usePanelFrame } from './usePanelFrame.ts';

/**
 * A modal dialog on the native <dialog> element: focus trap, Escape and screen-reader semantics come with it; the
 * element marked data-autofocus (its action) has the focus. `look`
 * dresses it as the search palette (high on the screen), a panel of its own (the settings, the whiteboard's notes) or a
 * sheet with its own head (the branches): its title is then only read out, the content shows its own. `movable`: the
 * preference its place is kept under; it is then carried by what is marked data-carry in it and resized by its edges.
 */
export function Modal({ title, onClose, children, wide, look, movable }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; look?: 'palette' | 'panel' | 'sheet' | 'showcase'; movable?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = usePanelFrame(movable ?? null, dialog);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    // showModal focuses the first button, and React's autoFocus came before it, on a dialog still hidden: the
    // dialog's action, marked data-autofocus, gets the focus so Enter does it
    element?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog} className="cp-modal" data-wide={wide} data-look={look} aria-label={title}
      data-movable={movable ? true : undefined} data-placed={frame.box ? true : undefined} data-moving={frame.moving || undefined}
      style={frame.box ? boxVariables(frame.box) : undefined}
      onClose={onClose}
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}
      onPointerDown={movable ? (event) => frame.grab(null, event) : undefined}
      onPointerMove={movable ? frame.drag : undefined} onPointerUp={movable ? frame.drop : undefined} onPointerCancel={movable ? frame.drop : undefined}
    >
      <div className="cp-modal__body">
        <h2 className="cp-modal__title">{title}</h2>
        {children}
      </div>
      {movable && <FreeHandles onPull={frame.grab} />}
    </dialog>
  );
}
