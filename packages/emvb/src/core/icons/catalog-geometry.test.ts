import { expect, test } from "bun:test";
import { BUNDLED_ICONS } from "./catalog.ts";

const REQUIRED: Record<string, string[]> = {
  path: ["d"],
  circle: ["cx", "cy", "r"],
  line: ["x1", "x2", "y1", "y2"],
  polyline: ["points"],
  polygon: ["points"],
  rect: ["width", "height"],
};

// W-699: Circle Alert's lines had no coordinates and drew nothing.
test("every bundled icon shape has the geometry it needs to draw", () => {
  const missing = BUNDLED_ICONS.flatMap((icon) =>
    icon.children.flatMap((shape, i) =>
      (REQUIRED[shape.tag] ?? [])
        .filter((attr) => !shape.attrs[attr])
        .map((attr) => `${icon.id}[${i}] ${shape.tag}.${attr}`),
    ),
  );
  expect(missing).toEqual([]);
});
