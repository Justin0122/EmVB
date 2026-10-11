import { describe, expect, test } from "bun:test";
import { FEATURE_CSS } from "./feature-css.ts";

describe("feature CSS colors (W-380)", () => {
  test("status colors are Kumo roles, not hex", () => {
    expect(/#[0-9a-fA-F]{3,8}\b/.test(FEATURE_CSS)).toBe(false);
  });
});
