import { describe, expect, test } from "bun:test";
import { fieldNumber } from "./number-input.ts";

describe("numbers typed in settings fields (W-436)", () => {
  test("the field's own unit is allowed", () => {
    expect(fieldNumber("16px", "px")).toBe(16);
    expect(fieldNumber(" 1.5 REM ", "rem")).toBe(1.5);
    expect(fieldNumber("12", "px")).toBe(12);
  });
  test("other units and number spellings are not numbers", () => {
    expect(fieldNumber("16em", "px")).toBeNaN();
    expect(fieldNumber("0x10")).toBeNaN();
    expect(fieldNumber("1e3")).toBeNaN();
    expect(fieldNumber("Infinity")).toBeNaN();
    expect(fieldNumber("")).toBeNaN();
  });
});
