import type { Box } from '../state/room-frame.ts';
import type { Guide } from '../state/windows.ts';
import { boxVariables } from './boxes.ts';

/** While something is carried or pulled: the place it would take (`zone`), and the lines its edges stick to. */
export function Guides({ guides, zone }: { guides: readonly Guide[]; zone: Box | null }) {
  return (
    <>
      {zone && <div className="cp-stack__zone" style={boxVariables(zone)} aria-hidden="true" />}
      {guides.map((guide) => (
        <div
          key={`${guide.axis}${guide.at}`} className="cp-stack__guide" data-axis={guide.axis} aria-hidden="true"
          style={boxVariables(guide.axis === 'x' ? { left: guide.at, top: guide.from, width: 1, height: guide.to - guide.from } : { left: guide.from, top: guide.at, width: guide.to - guide.from, height: 1 })}
        />
      ))}
    </>
  );
}
