/**
 * Pixel art as crisp SVG squares, one path per letter of the rows ("." is empty). Each path carries its letter as
 * `data-ink` and takes its colour from the CSS, so it scales with no blur and stays on the design tokens.
 */
function PixelArt({ rows, className, ink }: { rows: readonly string[]; className: string; ink?: string }) {
  const paths = new Map<string, string>();
  for (const [y, row] of rows.entries()) {
    for (const [x, letter] of [...row].entries()) if (letter !== '.') paths.set(letter, `${paths.get(letter) ?? ''}M${x} ${y}h1v1h-1z`);
  }
  const width = Math.max(...rows.map((row) => row.length));
  return (
    <svg className={className} data-ink={ink} viewBox={`0 0 ${width} ${rows.length}`} width={width} height={rows.length} shapeRendering="crispEdges" aria-hidden="true">
      {[...paths].map(([letter, d]) => <path key={letter} d={d} data-ink={letter} />)}
    </svg>
  );
}

/** A marker lying on the tray, nib to the left: k outline, c its colour, h a glint on the cap, w and s the barrel. */
const MARKER = [
  '..kkkkkkkk..............',
  '..kchhhhckkkkkkkkkkkkkk.',
  '.kkcccccckwwccwwwwwwwkck',
  'cckcccccckwwccwwwwwwwkck',
  '.kkcccccckssccssssssskck',
  '..kcccccckkkkkkkkkkkkkk.',
  '..kkkkkkkk..............',
];
/** The eraser: l and g its grip, f its felt. */
const ERASER = [
  '.kkkkkkkkkkkkkk.',
  'kllllllllllllllk',
  'kggggggggggggggk',
  'kggggggggggggggk',
  'kkkkkkkkkkkkkkkk',
  'kffffffffffffffk',
  'kffffffffffffffk',
  '.kkkkkkkkkkkkkk.',
];
const INKS = ['black', 'blue', 'red', 'green'] as const;

/** The whiteboard's tray along its bottom edge, with its markers and eraser: decoration only. */
export function BoardTray() {
  return (
    <div className="cp-board__tray" aria-hidden="true">
      <div className="cp-board__tools">
        {INKS.map((ink) => <PixelArt key={ink} rows={MARKER} className="cp-board__marker" ink={ink} />)}
        <PixelArt rows={ERASER} className="cp-board__eraser" />
      </div>
    </div>
  );
}
