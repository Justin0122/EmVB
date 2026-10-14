import { describe, expect, test } from "bun:test";
import {
  COMING_SOON,
  displayName,
  elementAspectOption,
  IMAGE_EDITOR_TOOLS,
  sizeLabel,
} from "./tools.ts";

describe("image editor tools (W-482, W-483)", () => {
  test("photocn's tools in photocn's order, crop as its compose tool", () => {
    expect(IMAGE_EDITOR_TOOLS.map((t) => t.id)).toEqual([
      "adjust",
      "compose",
      "curves",
      "effects",
      "filters",
      "blender",
      "blur",
      "metadata",
    ]);
    expect(IMAGE_EDITOR_TOOLS.find((t) => t.id === "compose")?.label).toBe("Crop");
    // After W-486 only the blender tool says what's coming.
    expect(Object.keys(COMING_SOON)).toEqual(["blender"]);
  });

  test("size labels and display names", () => {
    expect(sizeLabel(4032, 3024)).toBe("4032 × 3024 px");
    expect(displayName("01M4W9MN34FA0WDWHB5FS8YSGJ.jpg", " A garden ")).toBe("A garden");
    expect(displayName("01M4W9MN34FA0WDWHB5FS8YSGJ.jpg", "")).toBe("Library picture");
    expect(displayName("holiday.jpg", "A garden")).toBe("holiday.jpg");
  });

  test("Fit this element: the element's ratio, reduced and landscape-first", () => {
    expect(elementAspectOption(1200, 800)).toEqual({
      value: "3:2",
      label: "Fit this element (1200 × 800)",
    });
    // Portrait elements are written landscape-first; photocn's toggle turns the crop.
    expect(elementAspectOption(300, 600)?.value).toBe("2:1");
    expect(elementAspectOption(299.6, 100)?.value).toBe("3:1");
    expect(elementAspectOption(undefined, 100)).toBeUndefined();
    expect(elementAspectOption(0, 100)).toBeUndefined();
    expect(elementAspectOption("640", "480")).toBeUndefined();
  });
});

describe("Fit this element for very long strips (W-494)", () => {
  test("is offered up to 100:1 and left out beyond, where the edit couldn't be saved", async () => {
    const { elementAspectOption: fit } = await import("./tools.ts");
    expect(fit(1000, 10)?.value).toBe("100:1");
    expect(fit(10, 1000)?.value).toBe("100:1");
    expect(fit(2000, 10)).toBeUndefined();
    expect(fit(10, 2000)).toBeUndefined();
  });
  test("the widest offered ratio is one the edit record accepts", async () => {
    const { ImageEditRecipe } = await import("../../core/image-edit/schema.ts");
    const { MAX_ASPECT } = await import("./tools.ts");
    expect(
      ImageEditRecipe.safeParse({ version: 1, geometry: { aspectRatio: MAX_ASPECT } }).success,
    ).toBe(true);
    expect(
      ImageEditRecipe.safeParse({ version: 1, geometry: { aspectRatio: MAX_ASPECT + 1 } }).success,
    ).toBe(false);
  });
});
