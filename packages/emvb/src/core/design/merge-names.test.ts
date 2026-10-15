import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { mergeDesign } from "./merge.ts";

describe("site styles merge keeps names unique (W-620)", () => {
  test("two tabs adding a class with one name is a conflict", () => {
    const base = emptyDesign();
    const ours = { ...base, classes: [{ id: "a1", name: "Card", style: {} }] };
    const theirs = { ...base, classes: [{ id: "b1", name: "card", style: {} }] };
    const merged = mergeDesign(base, ours as never, theirs as never);
    expect(merged.conflicts).toEqual([{ kind: "class", name: "Card" }]);
    expect(merged.design.classes?.map((c) => c.id)).toEqual(["b1"]);
  });

  test("a rename here onto a name added there is a conflict too", () => {
    const base = { ...emptyDesign(), classes: [{ id: "a1", name: "Box", style: {} }] };
    const ours = { ...base, classes: [{ id: "a1", name: "Hero", style: {} }] };
    const theirs = {
      ...base,
      classes: [
        { id: "a1", name: "Box", style: {} },
        { id: "b1", name: "Hero", style: {} },
      ],
    };
    const merged = mergeDesign(base as never, ours as never, theirs as never);
    expect(merged.conflicts.map((c) => c.name)).toEqual(["Hero"]);
    expect(merged.design.classes?.map((c) => c.name)).toEqual(["Box", "Hero"]);
  });

  test("different names merge cleanly", () => {
    const base = emptyDesign();
    const ours = { ...base, classes: [{ id: "a1", name: "Card", style: {} }] };
    const theirs = { ...base, classes: [{ id: "b1", name: "Hero", style: {} }] };
    const merged = mergeDesign(base, ours as never, theirs as never);
    expect(merged.conflicts).toEqual([]);
    expect(merged.design.classes?.map((c) => c.id)).toEqual(["b1", "a1"]);
  });
});
