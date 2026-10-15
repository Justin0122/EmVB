import { describe, expect, test } from "bun:test";
import { impossibleRangeFields } from "../index.ts";

describe("fields no answer can satisfy (W-577)", () => {
  test("min length above max length, or min above max, is reported", () => {
    expect(
      impossibleRangeFields([
        { name: "a", label: "Name", validation: { minLength: 10, maxLength: 5 } },
        { name: "b", label: "", validation: { min: 9, max: 1 } },
        { name: "c", label: "Ok", validation: { minLength: 2, maxLength: 2, min: 1, max: 3 } },
        { name: "d", label: "None" },
      ]),
    ).toEqual([
      { name: "a", label: "Name", kind: "length" },
      { name: "b", label: "b", kind: "value" },
    ]);
  });
});
