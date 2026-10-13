import { describe, expect, test } from "bun:test";
import { hexInput, parseRgb } from "./color-space.ts";
import { parseValue } from "./variable-values.ts";

describe("hex without # (W-434)", () => {
  test("design-tool hex is accepted and gets its #", () => {
    expect(hexInput("1A2B3C")).toBe("#1A2B3C");
    expect(hexInput(" #abc ")).toBe("#abc");
    expect(hexInput("ffffff80")).toBe("#ffffff80");
    expect(parseValue("color", "1a2b3c")).toEqual({ ok: true, value: "#1a2b3c" });
  });
  test("other text is still refused", () => {
    expect(hexInput("red")).toBeUndefined();
    expect(hexInput("12345")).toBeUndefined();
    expect(hexInput("##abc")).toBeUndefined();
    expect(parseValue("color", "red").ok).toBe(false);
  });
});

describe("modern rgb() syntax (W-435)", () => {
  test("a slash before alpha is read", () => {
    expect(parseRgb("rgb(0 0 0 / 50%)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseRgb("rgb(10 20 30/0.25)")).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
  });
});
