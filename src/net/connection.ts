// The WebSocket to the bridge. The browser authenticates with the session cookie (set once by the /pair link),
// so the page itself carries no secret. It reconnects on its own and tells apart a stopped server from a browser
// that is not authorised, and lets the store resynchronise after each (re)connection.
import type { ClientMessage, ServerMessage } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';

/** Short on purpose: `npm start` only opens a new tab when no open one came back within ~3 s. */
const MAX_RETRY_MS = 2000;

let socket: WebSocket | null = null;
let attempts = 0;
let build = '';

function send(message: ClientMessage): boolean {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    return true;
  }
  useSessions.getState().toast('error', t.common.notices.notConnected);
  return false;
}

/** Why the WebSocket closed: the bridge is down, this browser has no valid cookie, or neither (a passing failure). */
async function diagnose(): Promise<'stopped' | 'unpaired' | 'connecting'> {
  try {
    const response = await fetch('/pair', { cache: 'no-store' });
    // in dev, Vite answers 5xx when it cannot reach the bridge
    if (response.status >= 500) return 'stopped';
    return response.status === 401 ? 'unpaired' : 'connecting';
  } catch {
    return 'stopped';
  }
}

export function connect() {
  useSessions.setState({ send });
  const open = () => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${location.host}/ws`);
    socket = ws;
    ws.onopen = () => {
      attempts = 0;
      useSessions.setState({ connection: 'live' });
    };
    ws.onmessage = (event) => {
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      if (message.t === 'hello' && message.build !== 'dev') {
        // the UI was rebuilt since this tab was opened: reload to get the matching code
        if (build && build !== message.build) { location.reload(); return; }
        build = message.build;
      }
      useSessions.getState().receive(message);
    };
    ws.onclose = async () => {
      attempts++;
      useSessions.setState({ connection: await diagnose() });
      setTimeout(open, Math.min(MAX_RETRY_MS, 300 * attempts));
    };
  };
  open();
}
