/** Open Space's version (package.json), set by Vite at build time. */
declare const __APP_VERSION__: string;

interface Window {
  /** Available only in the desktop app, through its isolated preload: the folder picker on Windows alone. */
  openSpaceDesktop?: {
    pickFolder?: () => Promise<string | null>;
    /** a window taken out (src/state/out.ts) goes back into Open Space's window, which opens if it was closed */
    putBack: () => Promise<void>;
    /** keeps that window over the other apps or not; without `on`, only says whether it is */
    keepOnTop: (on?: boolean) => Promise<boolean>;
  };
}
