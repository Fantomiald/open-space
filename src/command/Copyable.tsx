import { useEffect, useState } from 'react';
import { t } from '../i18n/index.ts';
import { CopyIcon } from './Icons.tsx';

/** A text copied on click, the button saying so for a moment. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button type="button" className="cp-button" data-size="small" onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true), () => {}); }}>
      <CopyIcon />{copied ? t.automata.triggers.copied : t.automata.triggers.copy}
    </button>
  );
}

/** A value to copy whole (an address, a configuration), set apart in monospace. */
export function Copyable({ text, block }: { text: string; block?: boolean }) {
  return (
    <div className="cp-trigger__copy">
      {block ? <pre>{text}</pre> : <code>{text}</code>}
      <CopyButton text={text} />
    </div>
  );
}
