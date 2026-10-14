import { describe, expect, test } from "bun:test";
import {
  buildSmoothPath,
  getActivePoints,
  hasAnyEdits,
  IDENTITY_POINTS,
  insertPoint,
  MAX_CURVE_POINTS,
  movePoint,
  POINT_EPSILON,
  removePoint,
  withChannel,
} from "./curve-math.ts";
import type { CurvePoint } from "./engine.ts";

describe("curve maths (W-484, ported from photocn)", () => {
  test("a channel without points starts on the quarter-grid identity", () => {
    expect(getActivePoints(null, "g")).toEqual(IDENTITY_POINTS.map((p) => [...p] as CurvePoint));
    expect(hasAnyEdits(null)).toBe(false);
    expect(
      hasAnyEdits(
        withChannel(null, "b", [
          [0, 0],
          [0.5, 0.5],
          [1, 1],
        ]),
      ),
    ).toBe(false);
    expect(
      hasAnyEdits(
        withChannel(null, "b", [
          [0, 0],
          [0.5, 0.7],
          [1, 1],
        ]),
      ),
    ).toBe(true);
  });

  test("the identity path is a straight line from bottom-left to top-right", () => {
    const d = buildSmoothPath(IDENTITY_POINTS, 240);
    expect(d.startsWith("M 0.00 240.00")).toBe(true);
    expect(d.endsWith("240.00 0.00")).toBe(true);
  });

  test("points stay between their neighbours; the ends only move up and down", () => {
    const pts = [...IDENTITY_POINTS];
    expect(movePoint(pts, 2, 0.9, 0.6)[2]).toEqual([0.75 - POINT_EPSILON, 0.6]);
    expect(movePoint(pts, 0, 0.3, 0.2)[0]).toEqual([0, 0.2]);
    expect(movePoint(pts, 4, 0.3, 1.4)[4]).toEqual([1, 1]);
  });

  test("insert lands on the curve and stops at the record's 32-point limit", () => {
    const added = insertPoint(IDENTITY_POINTS, 0.375);
    expect(added?.index).toBe(2);
    expect(added?.points[2]).toEqual([0.375, 0.375]);
    let pts: CurvePoint[] = [
      [0, 0],
      [1, 1],
    ];
    for (let i = 1; pts.length < MAX_CURVE_POINTS; i++)
      pts = insertPoint(pts, i / 40)?.points ?? pts;
    expect(pts).toHaveLength(MAX_CURVE_POINTS);
    expect(insertPoint(pts, 0.99)).toBeNull();
  });

  test("the end points can't be removed", () => {
    expect(removePoint(IDENTITY_POINTS, 0)).toBeNull();
    expect(removePoint(IDENTITY_POINTS, 4)).toBeNull();
    expect(removePoint(IDENTITY_POINTS, 1)).toHaveLength(4);
  });
});
