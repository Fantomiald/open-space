// The channel to the macOS app (desktop/main.ts) when the bridge runs inside it, as an Electron utility process:
// the app learns where to open the page, and shows the notifications itself (its name, its icon, a click opens the
// session). Absent when the bridge runs on its own (npm start).

export type AppMessage =
  | { t: 'ready'; link: string }
  | { t: 'notify'; title: string; body: string; sessionId: string };

interface ParentPort { postMessage(message: AppMessage): void }

export const appPort: ParentPort | undefined = (process as { parentPort?: ParentPort }).parentPort;
