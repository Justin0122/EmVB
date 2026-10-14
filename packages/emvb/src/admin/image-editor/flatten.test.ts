import { describe, expect, test } from "bun:test";
import { needsFlatten } from "./flatten.ts";

describe("JPEG copies of transparent pictures (W-495)", () => {
  test("anything but a JPEG source is flattened onto white for a JPEG copy", () => {
    expect(needsFlatten("jpeg", "image/png")).toBe(true);
    expect(needsFlatten("jpeg", "image/webp")).toBe(true);
    expect(needsFlatten("jpeg", "")).toBe(true);
  });
  test("JPEG sources, and WebP or PNG copies, go straight through", () => {
    expect(needsFlatten("jpeg", "image/jpeg")).toBe(false);
    expect(needsFlatten("jpeg", "image/JPG")).toBe(false);
    expect(needsFlatten("webp", "image/png")).toBe(false);
    expect(needsFlatten("png", "image/png")).toBe(false);
  });
});
