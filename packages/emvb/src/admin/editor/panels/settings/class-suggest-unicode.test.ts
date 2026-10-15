import { describe, expect, test } from "bun:test";
import { appliedByName, classOptions } from "./class-suggest.ts";

const catalog = [{ id: "cafe", name: "Café", style: {} }];

describe("W-570: the class picker compares names as Site styles does", () => {
  test("no Create class for a name that only differs by accent form or a hidden mark", () => {
    expect(classOptions(catalog, [], "Cafe\u0301").some((o) => o.kind === "create")).toBe(false);
    expect(classOptions(catalog, [], "Café\u200B").some((o) => o.kind === "create")).toBe(false);
    expect(classOptions(catalog, [], "Cafe\u0301").some((o) => o.kind === "class")).toBe(true);
    expect(appliedByName(catalog, ["cafe"], "Cafe\u0301")?.id).toBe("cafe");
  });
});
