// The mods' windows over the office (ModWindows.tsx): where each one sits, how it is resized, and what Open Space
// tells a mod's page when it asks (the kit's OpenSpace.watch). Pure functions.
import { MOD_SIZE, type ModInfo } from '../../shared/mods.ts';
import type { Quota, SessionInfo } from '../../shared/protocol.ts';
import { costOf, dayOf, modelName, type CostReport } from '../../shared/usage.ts';
import { PIP_MARGIN, placePip } from './pip.ts';
import type { Box } from './room-frame.ts';
import type { Edge } from './windows.ts';

type Size = { width: number; height: number };

/** the height of a window's title bar, over the mod's page */
export const MOD_HEAD = 36;
/** the first window opens at the top left, under the header; the next ones beside it */
const OPENING_TOP = 72;
const STEP = 32;

/** Where the user left a mod's window: `size` once they resized it (until then the mod's own size), folded to its title or not. */
export interface ModPlacement { left: number | null; top: number | null; size: Size | null; folded: boolean }
export const NOT_PLACED: ModPlacement = { left: null, top: null, size: null, folded: false };

const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** The size of a mod's window, title bar included, no bigger than the page. */
function sized(size: Size, surface: Size): Size {
  return {
    width: Math.round(within(size.width, Math.min(MOD_SIZE.width.min, surface.width - 2 * PIP_MARGIN), Math.min(MOD_SIZE.width.max, surface.width - 2 * PIP_MARGIN))),
    height: Math.round(within(size.height, MOD_SIZE.height.min, Math.min(MOD_SIZE.height.max, surface.height - 2 * PIP_MARGIN - MOD_HEAD)) + MOD_HEAD),
  };
}

/** The windows not placed yet, of these sizes (title bars aside): side by side from the top left, a new row when the page is full. */
export function openingSpots(sizes: readonly Size[], surface: Size): { left: number; top: number }[] {
  let left = PIP_MARGIN, top = OPENING_TOP, row = 0;
  return sizes.map((each) => {
    const size = sized(each, surface);
    if (left > PIP_MARGIN && left + size.width > surface.width - PIP_MARGIN) { left = PIP_MARGIN; top += row + PIP_MARGIN; row = 0; }
    // past the bottom: they start over at the top, a step aside, so none hides another's title
    if (top + MOD_HEAD > surface.height - PIP_MARGIN) { top = OPENING_TOP + STEP; left = PIP_MARGIN + STEP; }
    const spot = { left, top };
    left += size.width + PIP_MARGIN;
    row = Math.max(row, size.height);
    return spot;
  });
}

/** A mod's window: where the user left it, else at `spot` (see openingSpots); always within the page. */
export function modBox(mod: Pick<ModInfo, 'width' | 'height'>, placement: ModPlacement, spot: { left: number; top: number }, surface: Size): Box {
  const size = sized(placement.size ?? { width: mod.width, height: mod.height }, surface);
  return placePip({ left: placement.left ?? spot.left, top: placement.top ?? spot.top, ...size }, surface);
}

/** `start` pulled by `edge` by dx, dy: the opposite side or corner stays where it is. */
export function resizeMod(start: Box, edge: Edge, dx: number, dy: number, surface: Size): Box {
  const pulled = { width: start.width + (edge.includes('e') ? dx : edge.includes('w') ? -dx : 0), height: start.height - MOD_HEAD + (edge.includes('s') ? dy : edge.includes('n') ? -dy : 0) };
  const size = sized(pulled, surface);
  const left = edge.includes('w') ? start.left + start.width - size.width : start.left;
  const top = edge.includes('n') ? start.top + start.height - size.height : start.top;
  return { left: Math.round(within(left, 0, surface.width - size.width)), top: Math.round(within(top, 0, surface.height - size.height)), ...size };
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
