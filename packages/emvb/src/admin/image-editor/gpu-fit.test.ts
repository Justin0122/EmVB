import { describe, expect, test } from "bun:test";
import { fitWithin } from "./gpu-fit.ts";

describe("pictures over the GPU limit (W-496)", () => {
  test("a 12000 px panorama is edited at the 8192 px limit, keeping its ratio", () => {
    expect(fitWithin({ width: 12000, height: 600 }, 8192)).toEqual({ width: 8192, height: 409 });
    expect(fitWithin({ width: 500, height: 20000 }, 16384)).toEqual({ width: 409, height: 16384 });
  });
  test("pictures that fit, or a device without WebGL, are left alone", () => {
    expect(fitWithin({ width: 8192, height: 8192 }, 8192)).toBeNull();
    expect(fitWithin({ width: 640, height: 480 }, 4096)).toBeNull();
    expect(fitWithin({ width: 12000, height: 600 }, null)).toBeNull();
  });
});
