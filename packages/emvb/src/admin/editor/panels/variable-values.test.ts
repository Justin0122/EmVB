import { describe, expect, test } from "bun:test";
import { lengthPx, parseLength, parseValue, pickerHex, valueText } from "./variable-values.ts";

describe("variable values (W-087)", () => {
  test("parseLength reads a number with an optional unit, px by default", () => {
    expect(parseLength("16")).toEqual({ value: 16, unit: "px" });
    expect(parseLength(" 16 PX ")).toEqual({ value: 16, unit: "px" });
    expect(parseLength("1.5rem")).toEqual({ value: 1.5, unit: "rem" });
    expect(parseLength(".5em")).toEqual({ value: 0.5, unit: "em" });
    expect(parseLength("50%")).toEqual({ value: 50, unit: "%" });
    for (const bad of ["", "-1", "1vw", "abc", "1.2.3", "10001"])
      expect(parseLength(bad)).toBe(undefined);
    expect(parseLength("10000")).toEqual({ value: 10_000, unit: "px" });
  });

  test("lengthPx converts rem and em at 16 px, and % of 16 px", () => {
    expect(lengthPx({ value: 12, unit: "px" })).toBe(12);
    expect(lengthPx({ value: 1.5, unit: "rem" })).toBe(24);
    expect(lengthPx({ value: 2, unit: "em" })).toBe(32);
    expect(lengthPx({ value: 50, unit: "%" })).toBe(8);
  });

  test("valueText shows strings as is and lengths with their unit", () => {
    expect(valueText("#112233")).toBe("#112233");
    expect(valueText({ value: 1.25, unit: "rem" })).toBe("1.25rem");
    expect(valueText(undefined)).toBe("");
  });

  test("parseValue validates each kind and explains the fix", () => {
    expect(parseValue("color", " #AbC ")).toEqual({ ok: true, value: "#AbC" });
    expect(parseValue("color", "red")).toEqual({
      ok: false,
      error: "Enter a hex color such as #1a2b3c.",
    });
    expect(parseValue("font", " Inter, sans-serif ")).toEqual({
      ok: true,
      value: "Inter, sans-serif",
    });
    expect(parseValue("font", "  ").ok).toBe(false);
    expect(parseValue("font", "x".repeat(201)).ok).toBe(false);
    expect(parseValue("spacing", "2em")).toEqual({ ok: true, value: { value: 2, unit: "em" } });
    expect(parseValue("fontSize", "big")).toEqual({
      ok: false,
      error: "Enter a size such as 16, 16px or 1.5rem.",
    });
  });

  test("pickerHex gives the colour input a 6-digit hex", () => {
    expect(pickerHex("#AABBCC")).toBe("#aabbcc");
    expect(pickerHex("#abc")).toBe("#aabbcc");
    expect(pickerHex("#abcd")).toBe("#aabbcc");
    expect(pickerHex("#11223344")).toBe("#112233");
    expect(pickerHex("#12")).toBe("#000000");
  });
});

test("a font stack the site CSS would drop is refused (W-547)", () => {
  expect(parseValue("font", "Inter; color: red").ok).toBe(false);
  expect(parseValue("font", "Cooper's Font").ok).toBe(false);
  expect(parseValue("font", '"Open Sans", system-ui, sans-serif')).toEqual({
    ok: true,
    value: '"Open Sans", system-ui, sans-serif',
  });
});

test("W-687: a comma decimal in a size variable says to use a dot, like the style fields", () => {
  expect(parseValue("fontSize", "1,5rem")).toEqual({
    ok: false,
    error: "Use a dot for decimals, such as 1.5.",
  });
  expect(parseValue("spacing", "2,25")).toEqual({
    ok: false,
    error: "Use a dot for decimals, such as 1.5.",
  });
});
