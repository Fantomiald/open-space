import { useEffect, useState } from 'react';
import { ANSWER_GUARD_MS } from '../state/sessions.ts';

/** When an answer got no update back (refused by the server), the buttons come back after this long. */
const RETRY_AFTER_MS = 3000;

/**
 * State of the answer buttons of one request. Mount the component with `key={requestId}`: its buttons stay inactive
 * for a moment after a new request appears (a double click must not answer what was not read), and after a click
 * until the request goes away.
 */
export function useAnswerButtons() {
  const [armed, setArmed] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), ANSWER_GUARD_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(false), RETRY_AFTER_MS);
    return () => clearTimeout(timer);
  }, [sent]);
  return { disabled: !armed || sent, sent: (delivered: boolean) => { if (delivered) setSent(true); } };
}
