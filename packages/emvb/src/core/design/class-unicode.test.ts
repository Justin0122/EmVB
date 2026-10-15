import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../index.ts";
import type { DesignSystem } from "../index.ts";
import { classNameTaken, cleanClassName } from "./classes.ts";
import { variableNameTaken } from "./variables.ts";

const design: DesignSystem = {
  ...emptyDesign(),
  classes: [{ id: "cafe", name: "Café", style: {} }],
};

describe("W-568: class and variable names compare as they look", () => {
  test("hidden marks (zero-width, bidi overrides, C1 controls) are dropped", () => {
    expect(cleanClassName("Card\u200B")).toBe("Card");
    expect(cleanClassName("\u202ECard\u202C")).toBe("Card");
    expect(cleanClassName("Ca\u0085rd")).toBe("Ca rd");
    expect(cleanClassName("\uFEFFCard\u2060")).toBe("Card");
  });
  test("emoji joiners stay", () => {
    expect(cleanClassName("👩‍💻 Dev")).toBe("👩‍💻 Dev");
  });
  test("decomposed accents match the composed name", () => {
    expect(cleanClassName("Cafe\u0301")).toBe("Café");
    expect(classNameTaken(design, "Cafe\u0301")).toBe(true);
    expect(classNameTaken(design, "Café\u200B")).toBe(true);
  });
  test("variables too", () => {
    const base = emptyDesign();
    const d = {
      ...base,
      variables: { ...base.variables, colors: [{ id: "cafe", name: "Café", value: "#000" }] },
    } as DesignSystem;
    expect(variableNameTaken(d, "color", "Cafe\u0301")).toBe(true);
  });
});

describe("W-570: the class picker and Import compare names the same way", () => {
  test("Import renames a name that only differs by accent form", async () => {
    const { uniqueImportNames } = await import("./transfer.ts");
    const out = uniqueImportNames({
      ...design,
      classes: [...(design.classes ?? []), { id: "cafe2", name: "Cafe\u0301", style: {} }],
    });
    expect(out.renamed.length).toBe(1);
  });
});
