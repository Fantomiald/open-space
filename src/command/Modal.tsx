import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal dialog on the native <dialog> element: focus trap, Escape and screen-reader semantics come with it. `look`
 * dresses it as something of the room (the whiteboard: its title is then only read out, the board shows its own).
 */
export function Modal({ title, onClose, children, wide, look }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; look?: 'board' }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog} className="cp-modal" data-wide={wide} data-look={look} aria-label={title}
      onClose={onClose}
      onClick={(e) => { if (e.target === dialog.current) onClose(); }}
    >
      <div className="cp-modal__body">
        <h2 className="cp-modal__title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
