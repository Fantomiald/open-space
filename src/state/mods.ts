// The mods' windows over the office (ModWindows.tsx): where each one sits, how it is resized, and what Open Space
// tells a mod's page when it asks (the kit's OpenSpace.watch). Pure functions.
import { MOD_SIZE, type ModInfo } from '../../shared/mods.ts';
import type { Quota, SessionInfo } from '../../shared/protocol.ts';
import { costOf, dayOf, modelName, type CostReport } from '../../shared/usage.ts';
import { PIP_MARGIN, placePip, type Surface } from './pip.ts';
import type { Box } from './room-frame.ts';
import type { Edge } from './windows.ts';

type Size = { width: number; height: number };

/** the height of a window's title bar, over the mod's page */
export const MOD_HEAD = 51;
/** the first window opens at the top left, under the header; the next ones beside it */
const OPENING_TOP = 72;
const STEP = 32;

/** Where the user left a mod's window: `size` once they resized it (until then the mod's own size), folded to its title or not. */
export interface ModPlacement { left: number | null; top: number | null; size: Size | null; folded: boolean }
export const NOT_PLACED: ModPlacement = { left: null, top: null, size: null, folded: false };
/** where a mod's placement is kept in this browser */
export const modPlacementKey = (id: string) => `mod-placement:${id}`;

const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** The size of a mod's window, title bar included, no bigger than the page nor taller than its content (`tallest`, once its page told it). */
function sized(size: Size, surface: Surface, tallest = Number.POSITIVE_INFINITY): Size {
  return {
    width: Math.round(within(size.width, Math.min(MOD_SIZE.width.min, surface.width - 2 * PIP_MARGIN), Math.min(MOD_SIZE.width.max, surface.width - 2 * PIP_MARGIN))),
    height: Math.round(within(size.height, Math.min(MOD_SIZE.height.min, tallest), Math.min(MOD_SIZE.height.max, surface.height - (surface.top ?? PIP_MARGIN) - PIP_MARGIN - MOD_HEAD, tallest)) + MOD_HEAD),
  };
}

/** The windows not placed yet, of these sizes (title bars aside): side by side from the top left, a new row when the page is full. */
export function openingSpots(sizes: readonly Size[], surface: Surface): { left: number; top: number }[] {
  const first = Math.max(OPENING_TOP, surface.top ?? 0);
  let left = PIP_MARGIN, top = first, row = 0;
  return sizes.map((each) => {
    const size = sized(each, surface);
    if (left > PIP_MARGIN && left + size.width > surface.width - PIP_MARGIN) { left = PIP_MARGIN; top += row + PIP_MARGIN; row = 0; }
    // past the bottom: they start over at the top, a step aside, so none hides another's title
    if (top + MOD_HEAD > surface.height - PIP_MARGIN) { top = first + STEP; left = PIP_MARGIN + STEP; }
    const spot = { left, top };
    left += size.width + PIP_MARGIN;
    row = Math.max(row, size.height);
    return spot;
  });
}

/**
 * A mod's window: where the user left it, else at `spot` (see openingSpots); always within the page. `content`: the
 * height its page says its content needs; the window is never taller (smaller, the page scrolls).
 */
export function modBox(mod: Pick<ModInfo, 'width' | 'height'>, placement: ModPlacement, spot: { left: number; top: number }, surface: Surface, content?: number | null): Box {
  const size = sized(placement.size ?? { width: mod.width, height: content ?? mod.height }, surface, content ?? undefined);
  return placePip({ left: placement.left ?? spot.left, top: placement.top ?? spot.top, ...size }, surface);
}

/** `start` pulled by `edge` by dx, dy: the opposite side or corner stays where it is. */
export function resizeMod(start: Box, edge: Edge, dx: number, dy: number, surface: Surface, content?: number | null): Box {
  const pulled = { width: start.width + (edge.includes('e') ? dx : edge.includes('w') ? -dx : 0), height: start.height - MOD_HEAD + (edge.includes('s') ? dy : edge.includes('n') ? -dy : 0) };
  const size = sized(pulled, surface, content ?? undefined);
  const left = edge.includes('w') ? start.left + start.width - size.width : start.left;
  const top = edge.includes('n') ? start.top + start.height - size.height : start.top;
  return { left: Math.round(within(left, 0, surface.width - size.width)), top: Math.round(within(top, surface.top ?? 0, surface.height - size.height)), ...size };
}

/** The pages waiting for the variables of a mod (the kit's OpenSpace.env): the server's answer goes to each. */
const envAsked = new Map<string, Set<(env: Record<string, string>) => void>>();

/** Waits for the next `modEnv` of mod `id`; returns what stops waiting. */
export function awaitModEnv(id: string, heard: (env: Record<string, string>) => void) {
  const waiting = envAsked.get(id) ?? new Set();
  envAsked.set(id, waiting);
  waiting.add(heard);
  return () => { waiting.delete(heard); };
}

export function heardModEnv(id: string, env: Record<string, string>) {
  const waiting = envAsked.get(id);
  envAsked.delete(id);
  for (const heard of waiting ?? []) heard(env);
}

/** The windows showing each mod, told every value its page saved (the kit's OpenSpace.store), wherever it was saved. */
const storeHeard = new Map<string, Set<(name: string, value: unknown) => void>>();

/** Hears the values saved for mod `id`; returns what stops it. */
export function onModStore(id: string, heard: (name: string, value: unknown) => void) {
  const hearing = storeHeard.get(id) ?? new Set();
  storeHeard.set(id, hearing);
  hearing.add(heard);
  return () => { hearing.delete(heard); };
}

export function heardModStore(id: string, name: string, value: unknown) {
  for (const heard of storeHeard.get(id) ?? []) heard(name, value);
}

/** What a mod may ask Open Space for (OpenSpace.watch in the kit). */
export const MOD_DATA = ['sessions', 'quota', 'costs'] as const;
export type ModData = (typeof MOD_DATA)[number];
export const isModData = (name: unknown): name is ModData => MOD_DATA.some((each) => each === name);

const folderName = (folder: string) => folder.split(/[\\/]/).filter(Boolean).pop() ?? folder;

/** The sessions as a mod sees them: what the office shows of each, without its conversation. */
export function sessionsForMods(sessions: readonly SessionInfo[]) {
  return sessions.map((session) => ({
    id: session.id, name: session.name, state: session.state, resting: !!session.resting, folder: folderName(session.checkout ?? session.cwd), tags: session.tags ?? [],
    model: modelName(session.activeModel || session.model), turns: session.turns, createdAt: session.createdAt, stateSince: session.stateSince,
    busySince: session.busySince ?? null, subagents: session.subagents.length, context: session.context ?? null,
  }));
}

/** The quota as a mod sees it: each window's share used (0 to 1) and when it starts again. */
export function quotaForMods(quota: Quota | null) {
  return quota ? { fiveHour: quota.fiveHour, resetsAt: quota.resetsAt, windows: quota.windows } : null;
}

const round = (dollars: number) => Math.round(dollars * 100) / 100;

/**
 * What Claude Code spent, as a mod sees it: dollars at the API's list prices per day (oldest first, every day of the
 * last `days` there, even an empty one), per project and per model over those days.
 */
export function costsForMods(report: CostReport | null, now: number, days = 30) {
  if (!report) return null;
  const wanted = Array.from({ length: days }, (_, back) => dayOf(now - (days - 1 - back) * 86_400_000));
  const kept = new Set(wanted);
  const perDay = new Map(wanted.map((day) => [day, { day, usd: 0, turns: 0 }]));
  const perModel = new Map<string, number>(), perProject = new Map<string, number>();
  for (const row of report.models) {
    const day = perDay.get(row.day);
    if (!day) continue;
    const usd = costOf(row.model, row.tokens, row.fast);
    day.usd += usd;
    day.turns += row.turns;
    perModel.set(modelName(row.model), (perModel.get(modelName(row.model)) ?? 0) + usd);
  }
  for (const row of report.projects) {
    if (!kept.has(row.day)) continue;
    const project = folderName(row.project);
    perProject.set(project, (perProject.get(project) ?? 0) + costOf(row.model, row.tokens, row.fast));
  }
  const ranked = (totals: Map<string, number>) => [...totals].map(([name, usd]) => ({ name, usd: round(usd) })).filter((row) => row.usd > 0).sort((a, b) => b.usd - a.usd);
  const daily = [...perDay.values()].map((day) => ({ ...day, usd: round(day.usd) }));
  return { scanning: report.scanning, days: daily, today: daily[daily.length - 1]?.usd ?? 0, total: round(daily.reduce((sum, day) => sum + day.usd, 0)), models: ranked(perModel), projects: ranked(perProject) };
}

/** The design tokens a mod's page is dressed with: the ones of the user's window style, read from Open Space's page. */
export const MOD_TOKENS = [
  '--font-ui', '--font-mono', '--radius-sm', '--radius-md', '--color-text', '--color-text-muted', '--color-accent', '--color-accent-text', '--color-accent-soft',
  '--color-focus', '--color-border', '--color-border-strong', '--glass-tint', '--glass-edge', '--menu-solid', '--track', '--chart-grid',
] as const;
