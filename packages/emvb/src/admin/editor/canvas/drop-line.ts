import type { Rect } from "../dnd/drop-target.ts";
import type { Box } from "./SelectionOverlay.tsx";

/** Insertion line for the drop index inside a container (DESIGN: brand accent). */
export function dropLineBox(
  direction: string,
  container: Rect,
  children: Rect[],
  index: number,
): Box {
  const row = direction.startsWith("row");
  // W-559: in a reversed flow (row-reverse, or a row in RTL) the first child is at the far end.
  const reverse = direction.endsWith("reverse");
  const [start, size] = row ? (["left", "width"] as const) : (["top", "height"] as const);
  const end = (rect: Rect) => rect[start] + rect[size];
  const first = children[0];
  const last = children.at(-1);
  const before = index > 0 ? children[index - 1] : undefined;
  const after = index < children.length ? children[index] : undefined;
  let at = container[start];
  if (first && index <= 0) at = reverse ? end(first) : first[start];
  else if (last && index >= children.length) at = reverse ? last[start] : end(last);
  else if (before && after) {
    at =
      before[start] <= after[start]
        ? (end(before) + after[start]) / 2
        : (end(after) + before[start]) / 2;
  }
  return row
    ? { top: container.top, left: at - 1, width: 2, height: container.height }
    : { top: at - 1, left: container.left, width: container.width, height: 2 };
}
