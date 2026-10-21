import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** One column: its label under the axis, and its value in each colour slot (stacked in the order of `slots`). */
export interface Column { key: string; label: string; values: Record<string, number> }

const HEIGHT = 168;
const AXIS_WIDTH = 44;
const BOTTOM = 22;
const TOP = 8;
/** bars stay thin, whatever the room: the rest of the band is air */
const MAX_BAR = 22;
const GAP = 2;

/** A bar whose top corners are rounded (4px), square at its base. */
function roundedTop(x: number, top: number, width: number, height: number) {
  const r = Math.min(4, width / 2, height);
  const bottom = top + height;
  return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${bottom} Z`;
}

/** Round steps for the y axis: 0, a nice step, up to just above the highest column. */
function ticksFor(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, index) => index * step);
}

function useWidth() {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [box, width] as const;
}

/**
 * Columns of stacked bars over a hairline grid, one y axis, the labels thinned out to fit; hovering a column shows its
 * values in a card (`describe`). The colour of each slot comes from the stylesheet (`data-slot`, see .cp-chart).
 */
export function BarChart({ columns, slots, format, describe, label, labelWidth = 60 }: {
  columns: readonly Column[]; slots: readonly string[]; format: (value: number) => string;
  describe: (column: Column) => ReactNode; label: string;
  /** the room a label under the axis needs, in pixels: fewer are shown when the columns are narrower */
  labelWidth?: number;
}) {
  const [box, width] = useWidth();
  const [hovered, setHovered] = useState<number | null>(null);
  const totals = columns.map((column) => slots.reduce((sum, slot) => sum + (column.values[slot] ?? 0), 0));
  const ticks = ticksFor(Math.max(0, ...totals));
  const top = ticks.at(-1) || 1;
  const plot = Math.max(0, width - AXIS_WIDTH);
  const band = columns.length ? plot / columns.length : 0;
  const bar = Math.max(2, Math.min(MAX_BAR, band - 4));
  const y = (value: number) => TOP + (HEIGHT - TOP - BOTTOM) * (1 - value / top);
  // as many labels as fit, evenly spaced, the last day always among them
  const every = Math.max(1, Math.ceil(labelWidth / Math.max(band, 1)));
  const shown = (index: number) => (columns.length - 1 - index) % every === 0;

  return (
    <div className="cp-chart" ref={box}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={label} onMouseLeave={() => setHovered(null)}>
          {ticks.map((tick) => (
            <g key={tick} className="cp-chart__tick">
              <line x1={AXIS_WIDTH} x2={width} y1={y(tick)} y2={y(tick)} />
              <text x={AXIS_WIDTH - 8} y={y(tick)} dy="0.32em" textAnchor="end">{format(tick)}</text>
            </g>
          ))}
          {columns.map((column, index) => {
            const x = AXIS_WIDTH + index * band + (band - bar) / 2;
            let base = 0;
            const filled = slots.filter((slot) => (column.values[slot] ?? 0) > 0);
            return (
              <g key={column.key} className="cp-chart__column" data-hovered={hovered === index}>
                <rect className="cp-chart__hit" x={AXIS_WIDTH + index * band} y={TOP} width={band} height={HEIGHT - TOP - BOTTOM} onMouseEnter={() => setHovered(index)} />
                {filled.map((slot, at) => {
                  const value = column.values[slot] ?? 0;
                  const from = y(base);
                  base += value;
                  const to = y(base);
                  // a 2px gap of the surface between stacked segments; the top one gets the rounded end
                  const height = Math.max(1, from - to - (at > 0 ? GAP : 0));
                  const last = at === filled.length - 1;
                  return last
                    ? <path key={slot} data-slot={slot} d={roundedTop(x, to, bar, height)} />
                    : <rect key={slot} data-slot={slot} x={x} y={to} width={bar} height={height} />;
                })}
                {shown(index) && <text className="cp-chart__label" x={x + bar / 2} y={HEIGHT - 6} textAnchor="middle">{column.label}</text>}
              </g>
            );
          })}
        </svg>
      )}
      {hovered !== null && columns[hovered] && (
        <div className="cp-chart__card" data-side={hovered > columns.length / 2 ? 'left' : 'right'} style={{ '--at': `${AXIS_WIDTH + (hovered + 0.5) * band}px` } as CSSProperties}>
          {describe(columns[hovered])}
        </div>
      )}
    </div>
  );
}
