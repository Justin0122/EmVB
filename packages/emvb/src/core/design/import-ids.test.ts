import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { designFromJson, designToJson } from "./transfer.ts";

describe("design import with a repeated id (W-619)", () => {
  test("two classes with one id are refused", () => {
    const design = emptyDesign();
    design.classes = [
      { id: "c1", name: "Card", style: {} },
      { id: "c1", name: "Other", style: {} },
    ] as never;
    const result = designFromJson(designToJson(design));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('two classes with the id "c1"');
  });

  test("two colours with one id are refused; the same id in two kinds is fine", () => {
    const design = emptyDesign();
    design.variables.colors = [
      { id: "v1", name: "Ink", value: "#000" },
      { id: "v1", name: "Paper", value: "#fff" },
    ] as never;
    expect(designFromJson(designToJson(design)).ok).toBe(false);
    design.variables.colors = [{ id: "v1", name: "Ink", value: "#000" }] as never;
    design.variables.spacings = [
      { id: "v1", name: "Gap", value: { value: 8, unit: "px" } },
    ] as never;
    expect(designFromJson(designToJson(design)).ok).toBe(true);
  });
});
