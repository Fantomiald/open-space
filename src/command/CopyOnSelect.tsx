import { useEffect, useState, type CSSProperties } from 'react';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';

const SHOWN_MS = 900;
/** What the mouse selected: in a text field, its own selection (the page's does not see it); a password never. */
function selectedText(target: EventTarget | null): string {
  const field = document.activeElement;
  const inField = target instanceof Node && field?.contains(target);
  if (inField && (field instanceof HTMLTextAreaElement || (field instanceof HTMLInputElement && field.type !== 'password'))) {
    const { selectionStart, selectionEnd } = field;
    return selectionStart === null || selectionEnd === null ? '' : field.value.slice(selectionStart, selectionEnd);
  }
  return window.getSelection()?.toString() ?? '';
}

/**
 * With the setting on, text selected with the mouse is copied at once, as in a terminal (and in Claude Code's own
 * prompt): in the threads and in the fields alike. A small "Copied" shows by the pointer, where the selection ended.
 */
export function CopyOnSelect() {
  const enabled = useSessions((s) => s.preferences.copyOnSelect);
  const [copied, setCopied] = useState<{ x: number; y: number; at: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const text = selectedText(event.target);
      if (!text.trim()) return;
      navigator.clipboard?.writeText(text).then(() => setCopied({ x: event.clientX, y: event.clientY, at: Date.now() }), () => { /* no clipboard access: nothing to tell */ });
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [enabled]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!copied) return null;
  return (
    <span key={copied.at} className="cp-copied" role="status" style={{ '--x': `${copied.x}px`, '--y': `${copied.y}px` } as CSSProperties}>
      {t.common.copied}
    </span>
  );
}
