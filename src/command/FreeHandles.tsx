import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Edge } from '../state/windows.ts';

const EDGES: readonly Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** The sides and corners of a window placed by hand (or only `edges`), pulled to resize it (invisible, the pointer's shape shows them). */
export function FreeHandles({ onPull, edges = EDGES }: { onPull: (edge: Edge, event: ReactPointerEvent<HTMLElement>) => void; edges?: readonly Edge[] }) {
  return edges.map((edge) => <div key={edge} className="cp-stack__handle" data-edge={edge} aria-hidden="true" onPointerDown={(event) => onPull(edge, event)} />);
}
