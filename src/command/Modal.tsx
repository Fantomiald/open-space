import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal dialog on the native <dialog> element: focus trap, Escape and screen-reader semantics come with it. `look`
 * dresses it as the search palette (high on the screen), a panel of its own (the settings, the whiteboard's notes) or a
 * sheet with its own head (the branches): its title is then only read out, the content shows its own.
 */
export function Modal({ title, onClose, children, wide, look }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; look?: 'palette' | 'panel' | 'sheet' }) {
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
