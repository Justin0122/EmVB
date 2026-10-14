/**
 * Tone-curve maths for the Curves panel (W-484): the smooth path, point insertion, moves and
 * removal, plus the keyboard nudges EmVB adds.
 *
 * Ported from photocn's `curves-panel.tsx` (https://github.com/rbbydotdev/photocn,
 * apps/www/src/registry/image-editor), MIT License, Copyright (c) 2026 rbbydotdev.
 */
import type { CurveChannels, CurvePoint } from "./engine.ts";

export type CurvesChannel = "rgb" | "r" | "g" | "b";
export const CHANNEL_ORDER: readonly CurvesChannel[] = ["rgb", "r", "g", "b"];
export const CHANNEL_INDEX: Record<CurvesChannel, 0 | 1 | 2 | 3> = { rgb: 0, r: 1, g: 2, b: 3 };

/** Handles on the quarter grid, on y = x, so there is something to drag before any click. */
export const IDENTITY_POINTS: readonly CurvePoint[] = [
  [0, 0],
  [0.25, 0.25],
  [0.5, 0.5],
  [0.75, 0.75],
  [1, 1],
];
/** One byte of LUT precision: neighbours never collide. */
export const POINT_EPSILON = 1 / 255;
/** The image edit record keeps at most 32 points per channel (W-481). */
export const MAX_CURVE_POINTS = 32;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const at = (a: number[], i: number) => a[i] ?? 0;
const sortPoints = (points: readonly CurvePoint[]): CurvePoint[] =>
  points.map((p): CurvePoint => [p[0], p[1]]).toSorted((a, b) => a[0] - b[0]);

export function getActivePoints(value: CurveChannels | null, channel: CurvesChannel): CurvePoint[] {
  const existing = value?.[CHANNEL_INDEX[channel]];
  return sortPoints(existing && existing.length >= 2 ? existing : IDENTITY_POINTS);
}

/** Every point on y = x. */
export function isIdentity(points: readonly CurvePoint[] | null | undefined): boolean {
  return !points || points.every(([x, y]) => Math.abs(y - x) < POINT_EPSILON);
}

export function hasAnyEdits(value: CurveChannels | null): boolean {
  return Boolean(value?.some((channel) => channel !== null && !isIdentity(channel)));
}

/** `value` with one channel's points replaced. */
export function withChannel(
  value: CurveChannels | null,
  channel: CurvesChannel,
  points: CurvePoint[],
): CurveChannels {
  const next: CurveChannels = value
    ? [value[0], value[1], value[2], value[3]]
    : [null, null, null, null];
  next[CHANNEL_INDEX[channel]] = points;
  return next;
}

/** A monotonic cubic (Fritsch–Carlson) through the points: smooth, never overshooting. */
export function buildSmoothPath(points: readonly CurvePoint[], size: number): string {
  if (points.length < 2) return "";
  const sorted = sortPoints(points);
  const n = sorted.length;
  const xs = sorted.map((p) => p[0]);
  const ys = sorted.map((p) => p[1]);
  const dx: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = at(xs, i + 1) - at(xs, i) || 1e-9;
    slopes[i] = (at(ys, i + 1) - at(ys, i)) / at(dx, i);
  }
  const t: number[] = [];
  t[0] = at(slopes, 0);
  t[n - 1] = at(slopes, n - 2);
  for (let i = 1; i < n - 1; i++) {
    const a = at(slopes, i - 1);
    const b = at(slopes, i);
    t[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const s = at(slopes, i);
    if (s === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = at(t, i) / s;
    const b = at(t, i + 1) / s;
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * s;
      t[i + 1] = k * b * s;
    }
  }
  const sx = (x: number) => (x * size).toFixed(2);
  const sy = (y: number) => (size - y * size).toFixed(2);
  let d = `M ${sx(at(xs, 0))} ${sy(at(ys, 0))}`;
  for (let i = 0; i < n - 1; i++) {
    const h = at(dx, i);
    const x0 = at(xs, i);
    const x1 = at(xs, i + 1);
    const y0 = at(ys, i);
    const y1 = at(ys, i + 1);
    d += ` C ${sx(x0 + h / 3)} ${sy(y0 + (at(t, i) * h) / 3)}, ${sx(x1 - h / 3)} ${sy(y1 - (at(t, i + 1) * h) / 3)}, ${sx(x1)} ${sy(y1)}`;
  }
  return d;
}

/** Straight-line y at x between the neighbouring points, so a new point starts on the curve. */
function interpolateY(points: readonly CurvePoint[], x: number): number {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return x;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a && b && x >= a[0] && x <= b[0])
      return a[1] + ((x - a[0]) / (b[0] - a[0] || 1)) * (b[1] - a[1]);
  }
  return x;
}

/** Adds a point (on the curve unless `y` is given); null when the channel is full. */
export function insertPoint(
  points: readonly CurvePoint[],
  x: number,
  y?: number,
): { points: CurvePoint[]; index: number } | null {
  if (points.length >= MAX_CURVE_POINTS) return null;
  const sorted = sortPoints(points);
  const lo = POINT_EPSILON;
  const hi = 1 - POINT_EPSILON;
  let ix = clamp(x, lo, hi);
  while (sorted.some((p) => Math.abs(p[0] - ix) < POINT_EPSILON / 2)) {
    ix = clamp(ix + POINT_EPSILON, lo, hi);
    if (ix >= hi) break;
  }
  const point: CurvePoint = [ix, clamp(y ?? interpolateY(sorted, ix), 0, 1)];
  const next = sortPoints([...sorted, point]);
  return { points: next, index: next.findIndex((p) => p[0] === ix) };
}

/** Moves one point, keeping it between its neighbours; the end points only move up and down. */
export function movePoint(
  points: readonly CurvePoint[],
  index: number,
  x: number,
  y: number,
): CurvePoint[] {
  const next = sortPoints(points);
  const last = next.length - 1;
  if (index < 0 || index > last) return next;
  const prev = next[index - 1];
  const after = next[index + 1];
  const nx =
    index === 0
      ? 0
      : index === last
        ? 1
        : clamp(x, (prev?.[0] ?? 0) + POINT_EPSILON, (after?.[0] ?? 1) - POINT_EPSILON);
  next[index] = [nx, clamp(y, 0, 1)];
  return next;
}

/** Removes a point; null for the two end points, which hold the curve's ends. */
export function removePoint(points: readonly CurvePoint[], index: number): CurvePoint[] | null {
  const sorted = sortPoints(points);
  if (index <= 0 || index >= sorted.length - 1) return null;
  return sorted.filter((_, i) => i !== index);
}

/** 0..1 as the 0..255 level photo apps show. */
export const toLevel = (v: number) => Math.round(clamp(v, 0, 1) * 255);
export const fromLevel = (level: number) => clamp(level, 0, 255) / 255;
