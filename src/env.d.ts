/** Open Space's version (package.json), set by Vite at build time. */
declare const __APP_VERSION__: string;

interface Window {
  /** Available only in the Windows desktop app, through its isolated preload. */
  openSpaceDesktop?: { pickFolder: () => Promise<string | null> };
}
