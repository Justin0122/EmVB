/**
 * Crop-frame maths for the image editor's crop view (W-483).
 *
 * Ported from photocn's `crop-overlay.tsx` (https://github.com/rbbydotdev/photocn,
 * apps/www/src/registry/image-editor), MIT License, Copyright (c) 2026 rbbydotdev.
 * Split out of the component so it can be unit tested.
 */
import type { NormalizedRect, Vec2 } from "./engine.ts";

/** Maps oriented px (X, Y) to stage px: (ox + X·k, oy + Y·k). */
export interface StageView {
  k: number;
  ox: number;
  oy: number;
}

export interface StageSize {
  width: number;
  height: number;
}

type Size = { width: number; height: number };

/** View that fits `rect` (normalized oriented) inside the stage with padding. */
export function fitView(
  rect: NormalizedRect,
  oriented: Size,
  stage: StageSize,
  padding: number,
): StageView {
  const rw = Math.max(1e-6, rect.width * oriented.width);
  const rh = Math.max(1e-6, rect.height * oriented.height);
  const k = Math.max(
    1e-6,
    Math.min((stage.width - padding * 2) / rw, (stage.height - padding * 2) / rh),
  );
  return {
    k,
    ox: stage.width / 2 - (rect.x * oriented.width + rw / 2) * k,
    oy: stage.height / 2 - (rect.y * oriented.height + rh / 2) * k,
  };
}

export function toStage(view: StageView, oriented: Size, [x, y]: Vec2): Vec2 {
  return [view.ox + x * oriented.width * view.k, view.oy + y * oriented.height * view.k];
}

export function toNormalized(view: StageView, oriented: Size, [x, y]: Vec2): Vec2 {
  return [(x - view.ox) / (oriented.width * view.k), (y - view.oy) / (oriented.height * view.k)];
}

export function rectToStage(view: StageView, oriented: Size, rect: NormalizedRect) {
  const [left, top] = toStage(view, oriented, [rect.x, rect.y]);
  return {
    left,
    top,
    width: rect.width * oriented.width * view.k,
    height: rect.height * oriented.height * view.k,
  };
}

/**
 * Blend two views so the point under the stage center travels in a straight line and the zoom
 * changes geometrically (no wobble).
 */
export function blendViews(from: StageView, to: StageView, stage: StageSize, t: number): StageView {
  const cx = stage.width / 2;
  const cy = stage.height / 2;
  const fromX = (cx - from.ox) / from.k;
  const fromY = (cy - from.oy) / from.k;
  const toX = (cx - to.ox) / to.k;
  const toY = (cy - to.oy) / to.k;
  const k = from.k * (to.k / from.k) ** t;
  const x = fromX + (toX - fromX) * t;
  const y = fromY + (toY - fromY) * t;
  return { k, ox: cx - x * k, oy: cy - y * k };
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const HANDLES: readonly { id: Handle; label: string }[] = [
  { id: "nw", label: "Resize from top left" },
  { id: "n", label: "Resize from top" },
  { id: "ne", label: "Resize from top right" },
  { id: "e", label: "Resize from right" },
  { id: "se", label: "Resize from bottom right" },
  { id: "s", label: "Resize from bottom" },
  { id: "sw", label: "Resize from bottom left" },
  { id: "w", label: "Resize from left" },
];

export type PxRect = { x: number; y: number; w: number; h: number };

/** Resize a px rect by a pointer delta from one handle, honoring a locked ratio. */
export function resizeRect(
  start: PxRect,
  handle: Handle,
  dx: number,
  dy: number,
  ratio: number | null,
  min: number,
): PxRect {
  let { x, y, w, h } = start;
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");

  if (!ratio) {
    if (east) w = Math.max(min, start.w + dx);
    if (west) {
      w = Math.max(min, start.w - dx);
      x = start.x + start.w - w;
    }
    if (south) h = Math.max(min, start.h + dy);
    if (north) {
      h = Math.max(min, start.h - dy);
      y = start.y + start.h - h;
    }
    return { x, y, w, h };
  }

  const isCorner = (east || west) && (north || south);
  if (isCorner) {
    // Follow whichever axis moved more, keep the opposite corner anchored.
    const dw = east ? dx : -dx;
    const dh = south ? dy : -dy;
    w = Math.max(min, Math.abs(dw) >= Math.abs(dh * ratio) ? start.w + dw : start.w + dh * ratio);
    h = w / ratio;
    if (h < min) {
      h = min;
      w = h * ratio;
    }
    x = west ? start.x + start.w - w : start.x;
    y = north ? start.y + start.h - h : start.y;
  } else if (east || west) {
    w = Math.max(min, start.w + (east ? dx : -dx));
    h = w / ratio;
    x = west ? start.x + start.w - w : start.x;
    y = start.y + start.h / 2 - h / 2;
  } else {
    h = Math.max(min, start.h + (south ? dy : -dy));
    w = h * ratio;
    y = north ? start.y + start.h - h : start.y;
    x = start.x + start.w / 2 - w / 2;
  }
  return { x, y, w, h };
}

/** Largest t in [0, 1] for which `candidate(t)` is valid (binary search). */
export function constrain<T>(candidate: (t: number) => T, valid: (value: T) => boolean): T {
  if (valid(candidate(1))) return candidate(1);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (valid(candidate(mid))) lo = mid;
    else hi = mid;
  }
  return candidate(lo);
}
