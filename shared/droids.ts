// The droid that keeps the automatons' company (Preferences.droid): a little rolling droid going from room to room, a
// click on it opens the automatons' panel. Its model and its colour, or none. Shared so the server can check what it
// stores; src/room/droid.ts draws it and moves it. It shows only while the settings name the automatons' folder.

/** A round dome on a barrel (an astromech), a square head on a barrel, or a ball rolling under a dome. */
export const DROID_MODELS = ['dome', 'square', 'sphere'] as const;
export const DROID_KINDS = [...DROID_MODELS, 'none'] as const;

export type DroidModel = (typeof DROID_MODELS)[number];
export type DroidKind = (typeof DROID_KINDS)[number];

/** `color`: its panels' colour ("#rrggbb"), over the model's own. */
export type DroidChoice = { kind: DroidModel; color?: string } | { kind: 'none' };

export const DEFAULT_DROID: DroidChoice = { kind: 'dome' };

const COLOR = /^#[0-9a-f]{6}$/;

/** A droid from untrusted JSON, or undefined when it is not one. */
export function parseDroid(raw: unknown): DroidChoice | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { kind, color } = raw as Record<string, unknown>;
  if (kind === 'none') return { kind };
  if (!DROID_MODELS.includes(kind as DroidModel)) return undefined;
  return typeof color === 'string' && COLOR.test(color) ? { kind: kind as DroidModel, color } : { kind: kind as DroidModel };
}
