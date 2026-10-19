// The name tags above people: when two would overlap, the one further back moves up until it is clear, so a tag
// never hides another (the ones in front, lower on the canvas, keep their place over their head).

export interface LabelBox {
  left: number;
  /** where the tag would be, just above the head */
  top: number;
  width: number;
  height: number;
}

/** Room pixels kept between two tags. */
const GAP = 1;

/** The top of each tag once none overlaps another, in the order given. */
export function stackLabels(boxes: readonly LabelBox[]): number[] {
  const tops = boxes.map((box) => box.top);
  const placed: LabelBox[] = [];
  const frontFirst = boxes.map((_, index) => index).sort((first, second) => boxes[second].top + boxes[second].height - (boxes[first].top + boxes[first].height));
  for (const index of frontFirst) {
    const box = boxes[index];
    let top = box.top;
    const hits = (other: LabelBox) => box.left < other.left + other.width + GAP && other.left < box.left + box.width + GAP
      && top < other.top + other.height + GAP && other.top < top + box.height + GAP;
    let blocker = placed.find(hits);
    while (blocker) {
      top = blocker.top - GAP - box.height;
      blocker = placed.find(hits);
    }
    tops[index] = top;
    placed.push({ ...box, top });
  }
  return tops;
}
