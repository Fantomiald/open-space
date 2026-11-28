// A project's own icon in the sessions' panel (Preferences.projectIcons), as the user chose it: a Lucide icon in one of
// the colours, an emoji, one or two letters, or a small picture (a file the server stores, named here by its id). Kept
// by the project's folder (src/state/projects.ts projectOf); a project without one shows the picture found in its
// folder (server/project-icon.ts), else a folder.
// Checked here for the server (settings.json, the page's messages) and the page (the dialog) alike.
import { isAbsolutePath, isFullPath } from './paths.ts';

/** The colours an icon or letters may wear, by name (their shades are in src/design/tokens.css, --project-<name>). */
export const PROJECT_COLORS = ['gray', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export type ProjectIcon =
  | { kind: 'icon'; name: string; color: ProjectColor }
  | { kind: 'emoji'; value: string }
  | { kind: 'mono'; letters: string; color: ProjectColor }
  /** `id`: the picture's stored name, served under /project-icon?id= (the preferences keep no picture of their own) */
  | { kind: 'image'; id: string };

/** At most this many projects keep an icon: the oldest choices go first. */
export const MAX_PROJECT_ICONS = 100;
/** The heaviest picture kept, in bytes (a 64 px picture is far under it). */
export const MAX_ICON_IMAGE = 32_768;
/** A stored picture's name: the SHA-256 of what it holds, and its type (PNG, JPEG or WebP). */
export const ICON_IMAGE_ID = /^[0-9a-f]{64}\.(?:png|jpg|webp)$/;
/** A Lucide icon's name ("FolderCode"); one the page does not know shows the folder instead. */
export const ICON_NAME = /^[A-Za-z0-9]{1,64}$/;
/** One letter or digit of any script, with its accents (a combining mark: "é" typed as e + ´, the vowel signs of Devanagari). */
const MONO_LETTER = /^[\p{L}\p{N}]\p{M}*$/u;

const isColor = (value: unknown): value is ProjectColor => PROJECT_COLORS.some((color) => color === value);

/** Each character as the eye sees it (a flag, a family, a skin tone are one). */
const graphemes = (text: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((part) => part.segment);

/** One emoji, alone: a single character drawn as a picture (with its skin tone, flag or joined family). */
export function isEmoji(value: string): boolean {
  return value.length <= 16 && graphemes(value).length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value);
}

/** One or two letters or digits as the eye sees them, of any script. */
export const isMonoLetters = (value: string) => {
  const parts = value.length <= 16 ? graphemes(value) : [];
  return parts.length >= 1 && parts.length <= 2 && parts.every((part) => MONO_LETTER.test(part));
};

/** The letters as typed, cut to what an icon shows: two letters or digits, in capitals. */
export const monoLetters = (typed: string) => graphemes(typed.toLocaleUpperCase()).filter((part) => MONO_LETTER.test(part)).slice(0, 2).join('');

/** A project icon found in untrusted JSON, or null. */
export function parseProjectIcon(raw: unknown): ProjectIcon | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  switch (value.kind) {
    case 'icon': return typeof value.name === 'string' && ICON_NAME.test(value.name) && isColor(value.color) ? { kind: 'icon', name: value.name, color: value.color } : null;
    case 'emoji': return typeof value.value === 'string' && isEmoji(value.value) ? { kind: 'emoji', value: value.value } : null;
    case 'mono': return typeof value.letters === 'string' && isMonoLetters(value.letters) && isColor(value.color) ? { kind: 'mono', letters: value.letters, color: value.color } : null;
    // a picture kept in the settings before it was stored apart (a data URL) is dropped: the project shows its automatic one
    case 'image': return typeof value.id === 'string' && ICON_IMAGE_ID.test(value.id) ? { kind: 'image', id: value.id } : null;
    default: return null;
  }
}

/** The icons of untrusted JSON, by absolute folder: what is valid is kept, the latest MAX_PROJECT_ICONS; undefined when it is no object. */
export function parseProjectIcons(raw: unknown): Record<string, ProjectIcon> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const kept = Object.entries(raw).flatMap(([folder, value]) => {
    const icon = isFullPath(folder) && isAbsolutePath(folder) ? parseProjectIcon(value) : null;
    return icon ? [[folder, icon] as const] : [];
  });
  return Object.fromEntries(kept.slice(-MAX_PROJECT_ICONS));
}

/** The icons once this project's is chosen (null: back to the automatic one); chosen again, it counts as the latest. */
export function withProjectIcon(icons: Readonly<Record<string, ProjectIcon>> | undefined, folder: string, icon: ProjectIcon | null): Record<string, ProjectIcon> {
  const others = Object.entries(icons ?? {}).filter(([key]) => key !== folder);
  return Object.fromEntries([...others, ...(icon ? [[folder, icon] as const] : [])].slice(-MAX_PROJECT_ICONS));
}

/** The stored pictures these icons show (server/project-icon.ts keeps those and removes the others). */
export const pictureIdsOf = (icons: Readonly<Record<string, ProjectIcon>> | undefined): string[] =>
  Object.values(icons ?? {}).flatMap((icon) => (icon.kind === 'image' ? [icon.id] : []));
