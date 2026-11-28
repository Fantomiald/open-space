// The keyboard into a session's field once its window is on screen, so one click on the session is enough to type.
// Not on a touch screen, where it would bring the keyboard up over what the user came to read.

/** Frames to wait for a window that is opening to show its field. */
const TRIES = 10;

/** Puts the keyboard in the field of the session's window as soon as it is there (a few frames at most). */
export function focusComposer(sessionId: string) {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  const selector = `[data-session="${CSS.escape(sessionId)}"] textarea[data-composer]`;
  const attempt = (left: number) => {
    const field = document.querySelector<HTMLTextAreaElement>(selector);
    if (field && !field.disabled) {
      field.focus({ preventScroll: true });
      return;
    }
    if (left > 0) requestAnimationFrame(() => attempt(left - 1));
  };
  requestAnimationFrame(() => attempt(TRIES));
}
