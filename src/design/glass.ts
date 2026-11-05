// The tint of the glass panes (--glass-opacity in tokens.css), from Preferences.glassOpacity.
export function applyGlassOpacity(percent: number) {
  document.documentElement.style.setProperty('--glass-opacity', String(percent / 100));
}
