import { describe, expect, test } from "bun:test";
import { LOOP_FILTER } from "../schema/layout.ts";
import { parseLoopFilter } from "./dynamic.ts";

describe("Loop filter checks in linear time (W-391)", () => {
  test("a long filter with padded values that fails at the end is refused at once", () => {
    const hostile = `${"a=b".concat(" ".repeat(40), ";").repeat(6)}!`;
    const started = performance.now();
    expect(LOOP_FILTER.test(hostile)).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
  });

  test("ordinary filters still pass, with spaces around names and values", () => {
    for (const ok of ["category=news", " team = design ; team=sales ;", "plan=pro tier", "a=b;"]) {
      expect(LOOP_FILTER.test(ok)).toBe(true);
    }
    for (const bad of ["a=", "a= ", "a=<b>", "=b", "a=b;;c=d"])
      expect(LOOP_FILTER.test(bad)).toBe(false);
  });

  test("a field named like an Object method is a plain value", () => {
    expect(parseLoopFilter("constructor=x; constructor=y")).toEqual({ constructor: ["x", "y"] });
  });
});
