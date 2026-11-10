// A window taken out of Open Space: a session, a mod or a browser in a window of its own, over the other apps (in the Mac
// app, see desktop/main.ts; a popup in a browser). Its page is Open Space's own on /?out=<key>, showing that window alone.
import { MOD_HEAD } from './mods.ts';

export type OutTarget =
  | { kind: 'session'; sessionId: string }
  | { kind: 'mod'; modId: string }
  | { kind: 'browser'; sessionId: string; lane: number };

const ID = /^[\w-]+$/;

/** "session:<id>", "mod:<id>", "browser:<session id>:<lane>": one window per key, wherever it is asked for. */
export function outKey(target: OutTarget): string {
  switch (target.kind) {
    case 'session': return `session:${target.sessionId}`;
    case 'mod': return `mod:${target.modId}`;
    case 'browser': return `browser:${target.sessionId}:${target.lane}`;
  }
}

export function parseOut(key: string | null | undefined): OutTarget | null {
  const [kind, id, lane, ...rest] = (key ?? '').split(':');
  if (!id || !ID.test(id) || rest.length) return null;
  if (kind === 'session' && lane === undefined) return { kind, sessionId: id };
  if (kind === 'mod' && lane === undefined) return { kind, modId: id };
  if (kind === 'browser' && lane !== undefined && /^\d{1,2}$/.test(lane)) return { kind, sessionId: id, lane: Number(lane) };
  return null;
}

/** The page of that window. */
export const outPath = (target: OutTarget) => `/?out=${encodeURIComponent(outKey(target))}`;

/** The link that puts it back in Open Space's window: #session=<id>, #mod=<id>, #browser=<id>:<lane> (see App). */
export const backHash = (target: OutTarget) => outKey(target).replace(':', '=');

export const parseBackHash = (hash: string) => parseOut(/^#?(\w+)=(.+)$/.exec(hash)?.slice(1).join(':'));

/** Whether the window is about that session: its conversation or one of its browsers. */
export const isOfSession = (target: OutTarget, sessionId: string) => target.kind !== 'mod' && target.sessionId === sessionId;

/** The size a window opens at, before the user resizes it (then kept by the app). */
export function outSize(target: OutTarget, mod?: { width: number; height: number }): { width: number; height: number } {
  switch (target.kind) {
    case 'session': return { width: 520, height: 720 };
    case 'mod': return { width: mod?.width ?? 360, height: (mod?.height ?? 280) + MOD_HEAD };
    case 'browser': return { width: 640, height: 396 };
  }
}

/** The window this page is, when it is one taken out; null for Open Space itself. */
export const outTarget: OutTarget | null = typeof location === 'undefined' ? null : parseOut(new URLSearchParams(location.search).get('out'));
