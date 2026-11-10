// How Open Space's page and the windows taken out of it (src/state/out.ts) keep track of each other: a BroadcastChannel
// between the pages of this browser or of the Mac app. A window says it is out when it opens and when asked, and that it
// is gone when it closes; Open Space's page then shows it nowhere else.
import { outKey, outPath, type OutTarget } from '../state/out.ts';

type OutMessage =
  | { t: 'who' }
  | { t: 'out' | 'gone'; key: string }
  | { t: 'back'; key: string }
  | { t: 'seen'; sessionId: string };

// opened at the first use: the store's tests import this file, and an open channel would keep Node running
let opened: BroadcastChannel | null | undefined;
const open = () => {
  if (opened === undefined) opened = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('open-space-out');
  return opened;
};
const post = (message: OutMessage) => open()?.postMessage(message);
/** the popups this page opened (in a browser; the Mac app opens its own windows): focused again, not loaded again */
const popups = new Map<string, Window>();

/** Opens that window, or brings it forward when it is open already (the Mac app finds it by its address). */
export function openOut(target: OutTarget, size: { width: number; height: number }) {
  const key = outKey(target);
  const popup = popups.get(key);
  if (popup && !popup.closed) { popup.focus(); return; }
  const opened = window.open(outPath(target), `open-space-${key.replaceAll(':', '-')}`, `popup,width=${Math.round(size.width)},height=${Math.round(size.height)}`);
  if (opened) popups.set(key, opened);
}

/** Open Space's page: what the windows out say, from now on and from those already open. */
export function followOutWindows(on: { out: (key: string) => void; gone: (key: string) => void; back: (key: string) => void; seen: (sessionId: string) => void }) {
  const channel = open();
  if (!channel) return () => {};
  const listen = ({ data }: MessageEvent<OutMessage>) => {
    switch (data?.t) {
      case 'out': on.out(data.key); break;
      case 'gone': on.gone(data.key); break;
      case 'back': on.back(data.key); break;
      case 'seen': on.seen(data.sessionId); break;
    }
  };
  channel.addEventListener('message', listen);
  post({ t: 'who' });
  return () => channel.removeEventListener('message', listen);
}

/** A window out: tells Open Space's pages it is, until it closes. */
export function announceOut(target: OutTarget) {
  const key = outKey(target);
  const listen = ({ data }: MessageEvent<OutMessage>) => { if (data?.t === 'who') post({ t: 'out', key }); };
  const gone = () => post({ t: 'gone', key });
  const channel = open();
  channel?.addEventListener('message', listen);
  window.addEventListener('pagehide', gone);
  post({ t: 'out', key });
  return () => {
    channel?.removeEventListener('message', listen);
    window.removeEventListener('pagehide', gone);
  };
}

/** What the user saw in a window out is seen in Open Space's page too (the seen marks are kept by it). */
export const tellSeen = (sessionId: string) => post({ t: 'seen', sessionId });

/** Back into Open Space's window: the Mac app reopens it if it was closed; a browser tells its open page. */
export function putBack(target: OutTarget) {
  const desktop = window.openSpaceDesktop;
  if (desktop) { void desktop.putBack(); return; }
  post({ t: 'back', key: outKey(target) });
  window.close();
}
