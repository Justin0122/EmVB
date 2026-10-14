import { describe, expect, test } from "bun:test";
import {
  blendViews,
  constrain,
  fitView,
  rectToStage,
  resizeRect,
  toNormalized,
  toStage,
} from "./crop-geometry.ts";

const oriented = { width: 640, height: 480 };
const whole = { x: 0, y: 0, width: 1, height: 1 };

describe("crop frame maths (W-483, from photocn)", () => {
  test("fitView centres the rect in the stage with padding", () => {
    const view = fitView(whole, oriented, { width: 1000, height: 1000 }, 50);
    expect(view.k).toBeCloseTo(900 / 640);
    expect(rectToStage(view, oriented, whole)).toEqual({
      left: 50,
      top: expect.closeTo(500 - (480 * view.k) / 2, 6),
      width: expect.closeTo(900, 6),
      height: expect.closeTo(480 * view.k, 6),
    });
  });

  test("toStage and toNormalized are inverses", () => {
    const view = { k: 1.5, ox: 20, oy: 30 };
    const point = toStage(view, oriented, [0.25, 0.75]);
    const back = toNormalized(view, oriented, point);
    expect(back[0]).toBeCloseTo(0.25);
    expect(back[1]).toBeCloseTo(0.75);
  });

  test("free resize moves only the dragged edges, never under the minimum", () => {
    const start = { x: 10, y: 10, w: 100, h: 100 };
    expect(resizeRect(start, "se", 20, 30, null, 32)).toEqual({ x: 10, y: 10, w: 120, h: 130 });
    expect(resizeRect(start, "nw", 20, 0, null, 32)).toEqual({ x: 30, y: 10, w: 80, h: 100 });
    expect(resizeRect(start, "w", 500, 0, null, 32)).toEqual({ x: 78, y: 10, w: 32, h: 100 });
  });

  test("a locked ratio is kept from corners and edges", () => {
    const start = { x: 0, y: 0, w: 200, h: 100 };
    const corner = resizeRect(start, "se", 40, 0, 2, 10);
    expect(corner.w / corner.h).toBeCloseTo(2);
    const edge = resizeRect(start, "s", 0, 50, 2, 10);
    expect(edge).toEqual({ x: -50, y: 0, w: 300, h: 150 });
  });

  test("constrain finds the largest valid step", () => {
    expect(
      constrain(
        (t) => t * 10,
        (v) => v <= 4,
      ),
    ).toBeCloseTo(4, 4);
    expect(
      constrain(
        (t) => t,
        () => true,
      ),
    ).toBe(1);
  });

  test("blendViews runs from one view to the other", () => {
    const stage = { width: 100, height: 100 };
    const from = { k: 1, ox: 0, oy: 0 };
    const to = { k: 2, ox: -50, oy: -50 };
    expect(blendViews(from, to, stage, 0)).toEqual(from);
    const end = blendViews(from, to, stage, 1);
    expect(end.k).toBeCloseTo(2);
    expect(end.ox).toBeCloseTo(-50);
  });
});
