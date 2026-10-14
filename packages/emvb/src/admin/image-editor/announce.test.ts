import { describe, expect, test } from "bun:test";
import { ANNOUNCE_DELAY_MS, editSummary, toolLabel } from "./announce.tsx";

describe("the plain-text edit summary (W-487)", () => {
  test("reads a recipe, and anything else as no changes", () => {
    expect(
      editSummary({ version: 1, geometry: { crop: { x: 0, y: 0, width: 0.5, height: 1 } } }),
    ).toBe("Cropped");
    expect(editSummary(null)).toBe("No changes");
    expect(editSummary("not a recipe")).toBe("No changes");
  });
  test("names the tools, and waits before announcing a change", () => {
    expect(toolLabel("compose")).toBe("Crop");
    expect(toolLabel("adjust")).toBe("Adjust");
    expect(ANNOUNCE_DELAY_MS).toBeGreaterThanOrEqual(500);
  });
});
