import { expect, test } from "bun:test";
import { emptyDesign, type DesignSystem } from "../schema/design.ts";
import { designChangeLabel, designChanges } from "./diff.ts";

const withClasses = (...ids: string[]): DesignSystem => ({
  ...emptyDesign(),
  classes: ids.map((id) => ({ id, name: id, style: { color: "#111111" } })),
});

test("W-641: reordering classes is listed as an unpublished change", () => {
  expect(designChanges(withClasses("a", "b"), withClasses("a", "b"))).toEqual([]);
  expect(
    designChanges(withClasses("a", "b"), withClasses("b", "a")).map(designChangeLabel),
  ).toEqual(["Change setting Class order"]);
  // Adding or removing a class alone is not a reorder.
  expect(
    designChanges(withClasses("a", "b"), withClasses("a", "c", "b")).map(designChangeLabel),
  ).toEqual(["Add class c"]);
});
