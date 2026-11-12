// Dashboards: pages of mods laid out on a grid, as in Grafana (src/command/Dashboards.tsx). Kept in the settings
// (Preferences.dashboards), so every browser sees the same ones. Here: their shape, and how they are read back.
import { isModId } from './mods.ts';

/** The grid's columns; a tile's x and w count in them, its y and h in rows (DASHBOARD_ROW pixels each). */
export const DASHBOARD_COLUMNS = 12;
export const DASHBOARD_ROW = 32;
/** the smallest tile: under this a mod's page has no room left under its title bar */
export const TILE_MIN = { w: 2, h: 3 } as const;
const TILE_MAX_H = 60;
export const MAX_DASHBOARDS = 20;
const MAX_TILES = 40;
export const MAX_DASHBOARD_NAME = 40;

/** One mod on a dashboard, in grid cells. */
export interface DashboardTile { mod: string; x: number; y: number; w: number; h: number }
export interface Dashboard { id: string; name: string; tiles: DashboardTile[] }

const isDashboardId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,40}$/.test(value);
const cell = (value: unknown, min: number, max: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(Math.max(value, min), max)) : null);

function parseTile(raw: unknown): DashboardTile | null {
  if (!raw || typeof raw !== 'object') return null;
  const given = raw as Record<string, unknown>;
  if (!isModId(given.mod)) return null;
  const w = cell(given.w, TILE_MIN.w, DASHBOARD_COLUMNS), h = cell(given.h, TILE_MIN.h, TILE_MAX_H);
  const x = w === null ? null : cell(given.x, 0, DASHBOARD_COLUMNS - w), y = cell(given.y, 0, 10_000);
  return w === null || h === null || x === null || y === null ? null : { mod: given.mod, x, y, w, h };
}

/** The dashboards found in untrusted JSON: what is valid is kept, a mod at most once per dashboard. */
export function parseDashboards(raw: unknown): Dashboard[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  return raw.flatMap((each): Dashboard[] => {
    if (!each || typeof each !== 'object') return [];
    const given = each as Record<string, unknown>;
    if (!isDashboardId(given.id) || seen.has(given.id)) return [];
    seen.add(given.id);
    const name = typeof given.name === 'string' ? given.name.replace(/\s+/g, ' ').trim().slice(0, MAX_DASHBOARD_NAME) : '';
    const mods = new Set<string>();
    const tiles = (Array.isArray(given.tiles) ? given.tiles : []).map(parseTile).filter((tile): tile is DashboardTile => {
      if (!tile || mods.has(tile.mod)) return false;
      mods.add(tile.mod);
      return true;
    }).slice(0, MAX_TILES);
    return [{ id: given.id, name, tiles }];
  }).slice(0, MAX_DASHBOARDS);
}
