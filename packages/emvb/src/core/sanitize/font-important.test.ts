import { describe, expect, test } from "bun:test";
import { styleDeclarations } from "./css.ts";

const fonts = (value: string) =>
  styleDeclarations({ fontFamily: value }).declarations.map((d) => d.value);

describe("font-family output (W-648)", () => {
  test("drops !important, which would let a class beat the element's own font", () => {
    expect(fonts("Arial !important")).toEqual([]);
  });
  test("drops control characters", () => {
    expect(fonts("Arial\u0000")).toEqual([]);
  });
  test("ordinary stacks still pass", () => {
    expect(fonts(`"Fira Sans", Arial, sans-serif`)).toEqual([`"Fira Sans", Arial, sans-serif`]);
  });
});
