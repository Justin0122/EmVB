import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { mergeDesign } from "./merge.ts";

const cls = (id: string, name = id, style = {}) => ({ id, name, style });

describe("site styles merge keeps a class reorder (W-621)", () => {
  test("our reorder survives the other tab adding a class", () => {
    const base = { ...emptyDesign(), classes: [cls("a"), cls("b")] };
    const ours = { ...base, classes: [cls("b"), cls("a")] };
    const theirs = { ...base, classes: [cls("a"), cls("b"), cls("c")] };
    const merged = mergeDesign(base as never, ours as never, theirs as never);
    expect(merged.conflicts).toEqual([]);
    expect(merged.design.classes?.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  test("both tabs reordering differently is a conflict", () => {
    const base = { ...emptyDesign(), classes: [cls("a"), cls("b"), cls("c")] };
    const ours = { ...base, classes: [cls("c"), cls("a"), cls("b")] };
    const theirs = { ...base, classes: [cls("b"), cls("a"), cls("c")] };
    const merged = mergeDesign(base as never, ours as never, theirs as never);
    expect(merged.conflicts).toEqual([{ kind: "setting", name: "Class order" }]);
  });

  test("their reorder stays when we only edited a style", () => {
    const base = { ...emptyDesign(), classes: [cls("a"), cls("b")] };
    const ours = { ...base, classes: [cls("a", "a", { color: "red" }), cls("b")] };
    const theirs = { ...base, classes: [cls("b"), cls("a")] };
    const merged = mergeDesign(base as never, ours as never, theirs as never);
    expect(merged.design.classes?.map((c) => c.id)).toEqual(["b", "a"]);
  });
});
