// Per-browser preferences (theme, notifications, last view). Storage can be missing or blocked: every access is guarded.
export function readPreference<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`poste:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: unknown) {
  try {
    localStorage.setItem(`poste:${key}`, JSON.stringify(value));
  } catch { /* private mode: the preference lasts until reload */ }
}
