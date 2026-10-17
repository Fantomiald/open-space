import { useEffect, useRef, type ReactNode } from 'react';

/** A modal dialog on the native <dialog> element: focus trap, Escape and screen-reader semantics come with it. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog} className="cp-modal" data-wide={wide} aria-label={title}
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
