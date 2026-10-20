import type { PointerEvent as ReactPointerEvent } from 'react';
import { t } from '../i18n/index.ts';
import type { Box } from '../state/room-frame.ts';
import type { Columns, Tiling } from '../state/stack.ts';
import { equal, GAP, heightsOf, MIN_WINDOW, resizeTrack, widthsOf, type GridSizes } from '../state/windows.ts';
import { boxVariables } from './boxes.ts';

interface Props {
  columns: Columns;
  boxes: Record<string, Box>;
  /** where the grid sits in the stack */
  area: Box;
  tiling: Tiling;
  sizes: GridSizes | null;
  onResize: (sizes: GridSizes | null) => void;
  /** the edge of the windows on the room's side, pulled to make them wider (over the room only) */
  edge?: { width: number; min: number; max: number; onResize: (width: number | null) => void };
}

/** Follows the pointer from a press on a gutter, giving how far it went from there. */
function pull(event: ReactPointerEvent<HTMLElement>, onMove: (dx: number, dy: number) => void) {
  if (event.button !== 0) return;
  event.preventDefault();
  const handle = event.currentTarget, start = { x: event.clientX, y: event.clientY };
  handle.setPointerCapture(event.pointerId);
  handle.dataset.pulling = '';
  const move = (pointer: PointerEvent) => onMove(pointer.clientX - start.x, pointer.clientY - start.y);
  const end = () => {
    delete handle.dataset.pulling;
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

/**
 * The gutters of the grid, pulled to share the room between two columns or two windows of a column; a double click
 * shares it out evenly again.
 */
export function GridHandles({ columns, boxes, area, tiling, sizes, onResize, edge }: Props) {
  const words = t.room.stack;
  const widths = widthsOf(columns, sizes);
  const heights = (column: number) => heightsOf(columns, sizes, column);
  const withRows = (column: number, next: number[] | null) => ({ columns: widths, rows: columns.map((_, at) => (at === column ? (next ?? []) : heights(at))) });
  // the columns from the left (over the room the first one is on the right)
  const fromLeft = columns.map((_, visual) => (tiling.side === 'right' ? columns.length - 1 - visual : visual));
  const freeWidth = area.width - (columns.length - 1) * GAP;

  const between = fromLeft.slice(0, -1).map((column, visual) => {
    const box = boxes[columns[column][0]];
    const resize = (dx: number) => {
      const visualWidths = resizeTrack(fromLeft.map((each) => widths[each]), visual, dx, freeWidth, tiling.minColumn);
      onResize({ columns: columns.map((_, at) => visualWidths[fromLeft.indexOf(at)]), rows: columns.map((_, at) => heights(at)) });
    };
    return (
      <div
        key={`column-${columns[column][0]}`} className="cp-stack__gutter" data-axis="x" role="separator" aria-orientation="vertical" aria-label={words.resizeColumns} title={words.resizeTitle}
        style={boxVariables({ left: box.left + box.width, top: area.top, width: GAP, height: area.height })}
        onPointerDown={(event) => pull(event, resize)}
        onDoubleClick={() => onResize({ columns: equal(columns.length), rows: columns.map((_, at) => heights(at)) })}
      />
    );
  });

  const within = columns.flatMap((ids, column) => ids.slice(0, -1).map((id, row) => {
    const box = boxes[id];
    return (
      <div
        key={`row-${id}`} className="cp-stack__gutter" data-axis="y" role="separator" aria-orientation="horizontal" aria-label={words.resizeRows} title={words.resizeTitle}
        style={boxVariables({ left: box.left, top: box.top + box.height, width: box.width, height: GAP })}
        onPointerDown={(event) => pull(event, (_, dy) => onResize(withRows(column, resizeTrack(heights(column), row, dy, area.height - (ids.length - 1) * GAP, MIN_WINDOW.height))))}
        onDoubleClick={() => onResize(withRows(column, null))}
      />
    );
  }));

  return (
    <>
      {between}
      {within}
      {edge && (
        <div
          className="cp-stack__gutter" data-axis="x" data-edge role="separator" aria-orientation="vertical" aria-label={words.resizeStack} title={words.resizeTitle}
          style={boxVariables({ left: area.left - GAP, top: area.top, width: GAP, height: area.height })}
          onPointerDown={(event) => pull(event, (dx) => edge.onResize(Math.min(Math.max(edge.width - dx, edge.min), edge.max)))}
          onDoubleClick={() => edge.onResize(null)}
        />
      )}
    </>
  );
}
