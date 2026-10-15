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

describe("site styles merge respects the 100-class limit (W-647)", () => {
  test("two tabs that each add classes past the limit report the extra as conflicts", () => {
    const mk = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `${prefix}${i}`,
        name: `${prefix}-${i}`,
        style: {},
      }));
    const base = { ...emptyDesign(), classes: mk("base", 90) };
    const ours = { ...base, classes: [...base.classes, ...mk("ours", 8)] };
    const theirs = { ...base, classes: [...base.classes, ...mk("theirs", 8)] };
    const merged = mergeDesign(base as never, ours as never, theirs as never);
    expect(merged.design.classes?.length).toBe(100);
    expect(merged.conflicts.length).toBe(6);
    expect(merged.design.classes?.filter((c) => c.id.startsWith("theirs")).length).toBe(8);
  });
});
