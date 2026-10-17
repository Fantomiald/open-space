// The room in a small window that stays above the others (Document Picture-in-Picture, Chromium browsers only: Chrome,
// Arc, Edge). The page's styles are copied into it; RoomView renders the room there through a portal, so clicks work.
// It opens from a click (browsers refuse it otherwise) and closes when the user comes back to the tab (useSmallWindow).
import { useCallback, useEffect, useState } from 'react';

interface DocumentPictureInPicture { requestWindow(options?: { width?: number; height?: number }): Promise<Window>; window: Window | null }
const api = () => (window as Window & { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;

export const pictureInPictureSupported = () => api() !== undefined;

/** Opens the window (from a click: browsers refuse it otherwise), with the page's styles. */
export async function openPictureInPicture(width: number, height: number): Promise<Window> {
  const opened = await api()!.requestWindow({ width, height });
  for (const sheet of [...document.styleSheets]) {
    // a linked sheet is linked again, so its fonts keep resolving against its own address
    if (sheet.href) {
      const link = opened.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      opened.document.head.append(link);
      continue;
    }
    const style = opened.document.createElement('style');
    style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
    opened.document.head.append(style);
  }
  opened.document.title = 'Open Space';
  opened.document.body.className = 'cp-pip';
  return opened;
}

const SIZE = { width: 600, height: 450 };

/** The small window of the room, or null. `open` must run from a click; coming back to the tab closes it. */
export function useSmallWindow() {
  const [smallWindow, setSmallWindow] = useState<Window | null>(null);
  const open = useCallback(async () => {
    if (!pictureInPictureSupported() || api()!.window) return;
    try {
      const opened = await openPictureInPicture(SIZE.width, SIZE.height);
      opened.addEventListener('pagehide', () => setSmallWindow(null), { once: true });
      setSmallWindow(opened);
    } catch { /* refused by the browser: the room stays in the page */ }
  }, []);

  useEffect(() => {
    if (!pictureInPictureSupported()) return;
    const onVisibility = () => { if (!document.hidden) api()!.window?.close(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return { smallWindow, open };
}
