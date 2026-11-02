import { useEffect, useState, type CSSProperties } from 'react';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';

const SHOWN_MS = 900;
/** As in Claude Code: only in a thread or in the message field; elsewhere in the app, selecting is not meant as copying. */
function selectedText(target: EventTarget | null): string {
  const field = document.activeElement;
  if (field instanceof HTMLTextAreaElement && field.matches('[data-composer]') && target instanceof Node && field.contains(target)) {
    return field.value.slice(field.selectionStart, field.selectionEnd);
  }
  const selection = window.getSelection();
  const inThread = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest('.cp-feed');
  if (!selection || !inThread(selection.anchorNode) || !inThread(selection.focusNode)) return '';
  return selection.toString();
}

/**
 * With the setting on, text selected with the mouse is copied at once, as in a terminal (and in Claude Code's own
 * prompt), in the threads and the message field only. A small "Copied" shows by the pointer, where the selection ended.
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
