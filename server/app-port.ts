// The channel to the desktop app (desktop/main.ts) when the bridge runs inside it, as an Electron utility process:
// the app learns where to open the page, shows the notifications itself (its name, its icon, a click opens the
// session) and restarts on a new version when asked; it tells the bridge about that new version. Absent when the
// bridge runs on its own (npm start).
import type { AppUpdate } from '../shared/protocol.ts';

/** From the bridge to the app. */
export type AppMessage =
  | { t: 'ready'; link: string }
  | { t: 'notify'; title: string; body: string; sessionId: string }
  | { t: 'restart' }
  | { t: 'check' };

/** From the app to the bridge. */
export type AppNews = { t: 'update'; update: AppUpdate } | { t: 'shutdown' };

interface ParentPort {
  postMessage(message: AppMessage): void;
  on(event: 'message', listener: (event: { data: AppNews }) => void): void;
}

export const appPort: ParentPort | undefined = (process as { parentPort?: ParentPort }).parentPort;

