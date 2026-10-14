/**
 * The crop frame over the whole image, and the advanced perspective corners (W-483).
 *
 * Ported from photocn's `crop-overlay.tsx` (https://github.com/rbbydotdev/photocn,
 * apps/www/src/registry/image-editor), MIT License, Copyright (c) 2026 rbbydotdev. Tailwind
 * classes became EmVB CSS (image-editor-css.ts); the behaviour is unchanged.
 */
import * as React from "react";
import {
  constrain,
  HANDLES,
  rectToStage,
  resizeRect,
  toNormalized,
  toStage,
  type Handle,
  type PxRect,
  type StageSize,
  type StageView,
} from "./crop-geometry.ts";
import {
  fitRectInPolygon,
  rectInsidePolygon,
  type ImageEditorGeometryApi,
  type NormalizedRect,
  type Quad,
  type Vec2,
} from "./engine.ts";

type Drag =
  | {
      kind: "resize";
      handle: Handle;
      pointerId: number;
      start: Vec2;
      rect: NormalizedRect;
      view: StageView;
    }
  | { kind: "pan"; pointerId: number; start: Vec2; rect: NormalizedRect; view: StageView }
  | { kind: "pinch"; pointerId: number; distance: number; rect: NormalizedRect; view: StageView };

type OverlayProps = {
  geometry: ImageEditorGeometryApi;
  view: StageView;
  stage: StageSize;
  disabled?: boolean;
  /** Freeze the view during a handle drag (null to release). */
  onFreezeView: (view: StageView | null) => void;
};

const MIN_CROP_PX = 32;

/**
 * Dimmed outside, rule-of-thirds inside, 8 handles. Drag a handle to resize, drag inside to move
 * the image under the frame, scroll or pinch to zoom. Everything is limited to the warped image.
 */
export function CropFrameOverlay({ geometry, view, stage, disabled, onFreezeView }: OverlayProps) {
  const oriented = geometry.orientedSize;
  const polygon = geometry.polygon;
  const drag = React.useRef<Drag | null>(null);
  // Fingers currently down inside the frame (two = pinch to zoom).
  const pointers = React.useRef(new Map<number, Vec2>());
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const escRef = React.useRef<((event: KeyboardEvent) => void) | null>(null);
  const wheelRef = React.useRef<(event: WheelEvent) => void>(() => undefined);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Native and non-passive so zooming the crop doesn't also scroll the page.
    const onWheel = (event: WheelEvent) => wheelRef.current(event);
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [oriented, polygon]);
  if (!oriented || !polygon) return null;

  const frame = rectToStage(view, oriented, geometry.crop);
  const ratio = geometry.value.aspectRatio;
  const inside = (rect: NormalizedRect) => rectInsidePolygon(rect, polygon, oriented);
  const toNorm = (r: PxRect): NormalizedRect => ({
    x: r.x / oriented.width,
    y: r.y / oriented.height,
    width: r.w / oriented.width,
    height: r.h / oriented.height,
  });
  const toPx = (r: NormalizedRect): PxRect => ({
    x: r.x * oriented.width,
    y: r.y * oriented.height,
    w: r.width * oriented.width,
    h: r.height * oriented.height,
  });
  const resizeBy = (handle: Handle, rect: NormalizedRect, k: number, dx: number, dy: number) =>
    constrain(
      (t) =>
        toNorm(resizeRect(toPx(rect), handle, (dx * t) / k, (dy * t) / k, ratio, MIN_CROP_PX / k)),
      inside,
    );
  const panBy = (rect: NormalizedRect, k: number, dx: number, dy: number) =>
    constrain(
      (t) => ({
        ...rect,
        x: rect.x - (dx * t) / k / oriented.width,
        y: rect.y - (dy * t) / k / oriented.height,
      }),
      inside,
    );
  /** Scale the crop about its center (factor > 1 = zoom out), limited to the image. */
  const zoomBy = (rect: NormalizedRect, factor: number, k: number) => {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const minW = MIN_CROP_PX / k / oriented.width;
    const width = Math.max(minW, rect.width * factor);
    const height = (rect.height * width) / rect.width;
    const next: NormalizedRect = { x: cx - width / 2, y: cy - height / 2, width, height };
    return inside(next) ? next : fitRectInPolygon(next, polygon, oriented);
  };
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
  };
  const stopEsc = () => {
    if (escRef.current) window.removeEventListener("keydown", escRef.current, true);
    escRef.current = null;
  };

  const begin = (event: React.PointerEvent<HTMLElement>, handle: Handle | null) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!handle) {
      pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
      if (pointers.current.size === 2) {
        // Second finger: switch the move into a pinch.
        drag.current = {
          kind: "pinch",
          pointerId: event.pointerId,
          distance: distance(),
          rect: geometry.crop,
          view,
        };
        return;
      }
    }
    const common = {
      pointerId: event.pointerId,
      start: [event.clientX, event.clientY] as Vec2,
      rect: geometry.crop,
      view,
    };
    drag.current = handle ? { kind: "resize", handle, ...common } : { kind: "pan", ...common };
    if (handle) onFreezeView(view);
    // Esc puts the crop back where the drag started (no undo step), before the dialog sees it.
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape" || !drag.current) return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      drag.current = null;
      geometry.cancel();
      onFreezeView(null);
      stopEsc();
    };
    stopEsc();
    escRef.current = onKey;
    window.addEventListener("keydown", onKey, true);
  };

  const move = (event: React.PointerEvent<HTMLElement>) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
    }
    const d = drag.current;
    if (d?.kind === "pinch") {
      const now = distance();
      if (now > 0)
        geometry.setCrop(zoomBy(d.rect, d.distance / now, d.view.k), { transient: true });
      return;
    }
    if (!d || d.pointerId !== event.pointerId) return;
    const dx = event.clientX - d.start[0];
    const dy = event.clientY - d.start[1];
    const next =
      d.kind === "resize"
        ? resizeBy(d.handle, d.rect, d.view.k, dx, dy)
        : panBy(d.rect, view.k, dx, dy);
    geometry.setCrop(next, { transient: true });
  };

  const end = (event: React.PointerEvent<HTMLElement>) => {
    const wasPointer = pointers.current.delete(event.pointerId);
    const d = drag.current;
    if (d?.kind === "pinch" && wasPointer) {
      // Lifting either finger ends the pinch.
      drag.current = null;
      pointers.current.clear();
      geometry.commit();
      return;
    }
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    stopEsc();
    geometry.commit();
    onFreezeView(null);
  };

  wheelRef.current = (event: WheelEvent) => {
    if (disabled) return;
    event.preventDefault();
    geometry.setCrop(zoomBy(geometry.crop, Math.exp(event.deltaY * 0.002), view.k), {
      transient: true,
    });
  };

  const onHandleKey = (handle: Handle) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 20 : 4;
    const delta: Record<string, Vec2> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[event.key];
    if (!d || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    geometry.setCrop(resizeBy(handle, geometry.crop, view.k, d[0], d[1]), { transient: true });
  };

  /** W-487: the frame itself takes the keyboard: arrows move the picture, + and − zoom. */
  const onFrameKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.target !== event.currentTarget) return;
    const step = event.shiftKey ? 20 : 4;
    const pan: Record<string, Vec2> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const zoom: Record<string, number> = { "+": 0.9, "=": 0.9, "-": 1.1, _: 1.1 };
    const d = pan[event.key];
    const z = zoom[event.key];
    if (d) geometry.setCrop(panBy(geometry.crop, view.k, d[0], d[1]), { transient: true });
    else if (z) geometry.setCrop(zoomBy(geometry.crop, z, view.k), { transient: true });
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const maskPath = `M0 0H${stage.width}V${stage.height}H0Z M${frame.left} ${frame.top}v${frame.height}h${frame.width}v${-frame.height}Z`;

  return (
    <div className="emvb-ie-crop" data-slot="image-editor-crop-overlay" ref={rootRef}>
      <svg
        aria-hidden="true"
        className="emvb-ie-crop-mask"
        height={stage.height}
        width={stage.width}
      >
        <path d={maskPath} fillRule="evenodd" />
      </svg>
      <div
        aria-label="Crop area. Drag or use the arrow keys to move the picture; scroll, pinch or press + and − to zoom."
        className="emvb-ie-crop-frame"
        data-disabled={disabled || undefined}
        data-emvb-image-crop-frame=""
        onPointerCancel={end}
        onPointerDown={(event) => begin(event, null)}
        onPointerMove={move}
        onPointerUp={end}
        onKeyDown={onFrameKey}
        onKeyUp={(event) => {
          if (event.target === event.currentTarget) geometry.commit();
        }}
        role="group"
        tabIndex={disabled ? -1 : 0}
        style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
      >
        <div aria-hidden="true" className="emvb-ie-crop-thirds">
          <i style={{ left: "33.333%" }} />
          <i style={{ left: "66.667%" }} />
          <b style={{ top: "33.333%" }} />
          <b style={{ top: "66.667%" }} />
        </div>
        {HANDLES.map((handle) => (
          <button
            aria-label={handle.label}
            className="emvb-ie-crop-handle"
            data-handle={handle.id}
            disabled={disabled}
            key={handle.id}
            onKeyDown={onHandleKey(handle.id)}
            onKeyUp={() => geometry.commit()}
            onPointerCancel={end}
            onPointerDown={(event) => begin(event, handle.id)}
            onPointerMove={move}
            onPointerUp={end}
            type="button"
          >
            <span />
          </button>
        ))}
      </div>
    </div>
  );
}

const CORNER_LABELS = ["top left", "top right", "bottom right", "bottom left"] as const;

/** Advanced perspective: drag each corner of the image. */
export function CornerHandlesOverlay({
  geometry,
  view,
  stage,
  disabled,
  onFreezeView,
}: OverlayProps) {
  const oriented = geometry.orientedSize;
  const polygon = geometry.polygon;
  const drag = React.useRef<{
    index: 0 | 1 | 2 | 3;
    pointerId: number;
    view: StageView;
    origin: Vec2;
  } | null>(null);
  const cleanupRef = React.useRef<(() => void) | null>(null);
  if (!oriented || !polygon) return null;
  const points = polygon.map((p) => toStage(view, oriented, p)) as Quad;

  const begin = (index: 0 | 1 | 2 | 3) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const parent = event.currentTarget.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    drag.current = { index, pointerId: event.pointerId, view, origin: [rect.left, rect.top] };
    onFreezeView(view);
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape" || !drag.current) return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      drag.current = null;
      geometry.cancel();
      onFreezeView(null);
      window.removeEventListener("keydown", onKey, true);
    };
    window.addEventListener("keydown", onKey, true);
    cleanupRef.current = () => window.removeEventListener("keydown", onKey, true);
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const stagePoint: Vec2 = [event.clientX - d.origin[0], event.clientY - d.origin[1]];
    geometry.setCorner(d.index, toNormalized(d.view, oriented, stagePoint), { transient: true });
  };
  const end = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    cleanupRef.current?.();
    geometry.commit();
    onFreezeView(null);
  };

  return (
    <div className="emvb-ie-crop" data-slot="image-editor-corner-overlay">
      <svg
        aria-hidden="true"
        className="emvb-ie-corner-outline"
        height={stage.height}
        width={stage.width}
      >
        <polygon points={points.map((p) => p.join(",")).join(" ")} strokeWidth={1.5} />
      </svg>
      {points.map((point, index) => (
        <button
          aria-label={`Move ${CORNER_LABELS[index]} corner`}
          className="emvb-ie-corner-handle"
          disabled={disabled}
          key={CORNER_LABELS[index]}
          onPointerCancel={end}
          onPointerDown={begin(index as 0 | 1 | 2 | 3)}
          onPointerMove={move}
          onPointerUp={end}
          style={{ left: point[0], top: point[1] }}
          type="button"
        >
          <span />
        </button>
      ))}
    </div>
  );
}
