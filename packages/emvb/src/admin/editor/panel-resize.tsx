import * as React from "react";

/** Each side panel's width: its default, and how narrow and wide it may be dragged. */
export const PANEL_SIZES = {
  left: { initial: 256, min: 200, max: 480 },
  right: { initial: 288, min: 280, max: 640 },
} as const;

/** The canvas keeps at least this much room between the panels. */
export const MIN_CANVAS = 480;

type Side = keyof typeof PANEL_SIZES;
export type PanelWidths = Record<Side, number>;

/** Where the widths are remembered, per browser. */
const STORAGE_KEY = "emvb-panel-widths";

const clampTo = (side: Side, width: number) =>
  Math.round(Math.min(PANEL_SIZES[side].max, Math.max(PANEL_SIZES[side].min, width)));

const initialWidths = (): PanelWidths => {
  const widths: PanelWidths = { left: PANEL_SIZES.left.initial, right: PANEL_SIZES.right.initial };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<PanelWidths>;
    for (const side of ["left", "right"] as const) {
      const width = saved?.[side];
      if (typeof width === "number" && Number.isFinite(width)) widths[side] = clampTo(side, width);
    }
  } catch {
    // Storage refused or garbled: the default widths.
  }
  return widths;
};

/** The side panels' widths, remembered per browser. */
export function usePanelWidths() {
  const [widths, setWidths] = React.useState<PanelWidths>(initialWidths);
  const set = React.useCallback((side: Side, width: number) => {
    setWidths((current) => {
      const next = { ...current, [side]: clampTo(side, width) };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // A private window may refuse storage; the width still applies until the editor closes.
      }
      return next;
    });
  }, []);
  return { widths, set };
}

const KEY_STEP = 16;

/**
 * The handle on a side panel's inner edge: drag it to resize the panel, double-click for its
 * default width, or use the arrow keys (Shift for bigger steps), Home and End. The canvas never
 * gets narrower than MIN_CANVAS.
 */
export function PanelResizer({
  side,
  widths,
  frame,
  onResize,
}: {
  side: Side;
  widths: PanelWidths;
  frame: React.RefObject<HTMLElement | null>;
  onResize: (side: Side, width: number) => void;
}) {
  const other = side === "left" ? "right" : "left";
  const limit = () => {
    // A frame not laid out yet (width 0) sets no limit.
    const room = (frame.current?.clientWidth || Infinity) - widths[other] - MIN_CANVAS;
    return Math.max(PANEL_SIZES[side].min, Math.min(PANEL_SIZES[side].max, room));
  };
  const resize = (width: number) => onResize(side, Math.min(width, limit()));
  const label = side === "left" ? "Resize the Add and Layers panel" : "Resize the settings panel";
  return (
    <div
      className={`emvb-panel-resizer emvb-panel-resizer-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={widths[side]}
      aria-valuemin={PANEL_SIZES[side].min}
      aria-valuemax={PANEL_SIZES[side].max}
      tabIndex={0}
      title="Drag to resize; double-click to reset"
      data-emvb-panel-resizer={side}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        const box = frame.current?.getBoundingClientRect();
        if (!box) return;
        handle.setPointerCapture(event.pointerId);
        frame.current?.setAttribute("data-resizing", "");
        const move = (e: PointerEvent) =>
          resize(side === "left" ? e.clientX - box.left : box.right - e.clientX);
        const stop = () => {
          frame.current?.removeAttribute("data-resizing");
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", stop);
          handle.removeEventListener("pointercancel", stop);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", stop);
        handle.addEventListener("pointercancel", stop);
      }}
      onDoubleClick={() => resize(PANEL_SIZES[side].initial)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
        // Toward the canvas widens the panel: right for the left panel, left for the right one.
        const wider = side === "left" ? "ArrowRight" : "ArrowLeft";
        const narrower = side === "left" ? "ArrowLeft" : "ArrowRight";
        let next: number | undefined;
        if (event.key === wider) next = widths[side] + step;
        if (event.key === narrower) next = widths[side] - step;
        if (event.key === "Home") next = PANEL_SIZES[side].min;
        if (event.key === "End") next = PANEL_SIZES[side].max;
        if (next === undefined) return;
        event.preventDefault();
        resize(next);
      }}
    />
  );
}
