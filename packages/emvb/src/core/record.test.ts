import { describe, expect, test } from "bun:test";
import { isRecord } from "./record.ts";

describe("isRecord (W-377)", () => {
  test("a plain object is a record; an array and null are not", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("x")).toBe(false);
  });
});
