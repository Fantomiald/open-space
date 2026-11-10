import { useEffect } from 'react';
import { applyGlassOpacity } from '../design/glass.ts';
import { applyTagColors } from '../design/tag-colors.ts';
import { shownWindowStyle } from '../design/window-style.ts';
import { useSessions } from '../state/sessions.ts';

/** The look the settings give the page: motion, glass, tag colours and window style (Open Space's page and the windows out). */
export function usePageStyle() {
  const theme = useSessions((s) => s.preferences.theme);
  const reduceMotion = useSessions((s) => s.preferences.reduceMotion);
  const glassOpacity = useSessions((s) => s.preferences.glassOpacity);
  const windowStyle = useSessions((s) => s.preferences.windowStyle);
  const tagColors = useSessions((s) => s.preferences.tagColors);
  useEffect(() => { document.documentElement.dataset.motion = reduceMotion ? 'reduced' : 'full'; }, [reduceMotion]);
  useEffect(() => { applyGlassOpacity(glassOpacity); }, [glassOpacity]);
  useEffect(() => { applyTagColors(tagColors); }, [tagColors]);
  useEffect(() => { document.documentElement.dataset.windowStyle = shownWindowStyle(windowStyle, theme); }, [windowStyle, theme]);
}
