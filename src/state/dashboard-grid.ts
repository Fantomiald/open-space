// A dashboard's grid (src/command/Dashboards.tsx), as in Grafana: tiles fall up as far as they can, and a tile
// moved or resized pushes the ones in its way down. Pure functions over grid cells, and their size in pixels.
import { DASHBOARD_COLUMNS, DASHBOARD_ROW, TILE_MIN, type DashboardTile } from '../../shared/dashboards.ts';

/** the space between two tiles, in pixels */
export const DASHBOARD_GAP = 12;

const overlap = (a: DashboardTile, b: DashboardTile) => a.mod !== b.mod && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (value: number, min: number, max: number) => Math.min(Math.max(Math.round(value), min), Math.max(min, max));
/** top to bottom, then left to right; `first` before the others on its row */
const reading = (first?: string) => (a: DashboardTile, b: DashboardTile) => a.y - b.y || (a.mod === first ? -1 : b.mod === first ? 1 : a.x - b.x);
/** the tiles in their order of `tiles`, at the place `placed` gives them */
const inOrder = (tiles: readonly DashboardTile[], placed: readonly DashboardTile[]) => tiles.map((tile) => placed.find((each) => each.mod === tile.mod) ?? tile);

/** Each tile as high as it goes without covering another: the grid has no holes left above a tile. */
export function compact(tiles: readonly DashboardTile[], first?: string): DashboardTile[] {
  const placed: DashboardTile[] = [];
  for (const tile of [...tiles].sort(reading(first))) {
    let y = tile.y;
    while (y > 0 && !placed.some((each) => overlap({ ...tile, y: y - 1 }, each))) y--;
    placed.push({ ...tile, y });
  }
  return inOrder(tiles, placed);
}

/** `moved` where it is now, the others in its way pushed down below it (and below each other), then everything compacted. */
function settle(tiles: readonly DashboardTile[], moved: DashboardTile): DashboardTile[] {
  const placed = [moved];
  for (const tile of tiles.filter((each) => each.mod !== moved.mod).sort(reading())) {
    let next = tile;
    for (let hit = placed.find((each) => overlap(next, each)); hit; hit = placed.find((each) => overlap(next, each))) next = { ...next, y: hit.y + hit.h };
    placed.push(next);
  }
  return compact(inOrder(tiles, placed), moved.mod);
}

/** Tile `mod` carried to the cell (x, y), kept within the grid's width. */
export function moveTile(tiles: readonly DashboardTile[], mod: string, x: number, y: number): DashboardTile[] {
  const tile = tiles.find((each) => each.mod === mod);
  return tile ? settle(tiles, { ...tile, x: within(x, 0, DASHBOARD_COLUMNS - tile.w), y: Math.max(0, Math.round(y)) }) : [...tiles];
}

/** Tile `mod` given w columns and h rows from where it stands, no smaller than TILE_MIN nor past the grid's right edge. */
export function resizeTile(tiles: readonly DashboardTile[], mod: string, w: number, h: number): DashboardTile[] {
  const tile = tiles.find((each) => each.mod === mod);
  return tile ? settle(tiles, { ...tile, w: within(w, TILE_MIN.w, DASHBOARD_COLUMNS - tile.x), h: Math.max(TILE_MIN.h, Math.round(h)) }) : [...tiles];
}

/** A new tile of w × h for `mod`, in the first free spot reading the grid from the top left. */
export function addTile(tiles: readonly DashboardTile[], mod: string, w: number, h: number): DashboardTile[] {
  const size = { w: within(w, TILE_MIN.w, DASHBOARD_COLUMNS), h: Math.max(TILE_MIN.h, Math.round(h)) };
  for (let y = 0; ; y++) {
    for (let x = 0; x + size.w <= DASHBOARD_COLUMNS; x++) {
      const tile = { mod, x, y, ...size };
      if (!tiles.some((each) => overlap(tile, each))) return [...tiles, tile];
    }
  }
}

export const removeTile = (tiles: readonly DashboardTile[], mod: string) => compact(tiles.filter((tile) => tile.mod !== mod));

/** On a narrow page, one tile under the other in reading order, each the full width. */
export function stacked(tiles: readonly DashboardTile[]): DashboardTile[] {
  let y = 0;
  return inOrder(tiles, [...tiles].sort(reading()).map((tile) => { const each = { ...tile, x: 0, w: DASHBOARD_COLUMNS, y }; y += tile.h; return each; }));
}

/** The width of one column for a grid this wide. */
export const columnWidth = (width: number) => (width - DASHBOARD_GAP * (DASHBOARD_COLUMNS - 1)) / DASHBOARD_COLUMNS;

/** Where a tile sits in the grid's box, in pixels. */
export function tileBox(tile: Pick<DashboardTile, 'x' | 'y' | 'w' | 'h'>, column: number) {
  return {
    left: Math.round(tile.x * (column + DASHBOARD_GAP)), top: tile.y * (DASHBOARD_ROW + DASHBOARD_GAP),
    width: Math.round(tile.w * column + (tile.w - 1) * DASHBOARD_GAP), height: tile.h * DASHBOARD_ROW + (tile.h - 1) * DASHBOARD_GAP,
  };
}

/** How many columns (or rows, with `step` a row's height) a length in pixels is worth, to the nearest. */
export const cellsOf = (pixels: number, step: number) => Math.round((pixels + DASHBOARD_GAP) / (step + DASHBOARD_GAP));

/** The grid's height in pixels: its lowest tile, and `spare` rows under it to drop a tile there. */
export const gridHeight = (tiles: readonly DashboardTile[], spare = 0) => {
  const rows = Math.max(0, ...tiles.map((tile) => tile.y + tile.h)) + spare;
  return rows ? rows * (DASHBOARD_ROW + DASHBOARD_GAP) - DASHBOARD_GAP : 0;
};
