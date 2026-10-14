/**
 * The blur tool's sharp spot on the image (W-484): drag it, or focus it and use the arrow keys.
 *
 * Follows photocn's `blur-center-overlay.tsx` (https://github.com/rbbydotdev/photocn,
 * apps/www/src/registry/image-editor), MIT License, Copyright (c) 2026 rbbydotdev. The keyboard
 * control is EmVB's.
 */
import * as React from "react";

type Center = { centerX: number; centerY: number };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pct = (v: number) => Math.round(v * 100);

export function BlurFocus({
  centerX,
  centerY,
  disabled = false,
  onChange,
  onCommit,
}: Center & {
  disabled?: boolean;
  onChange: (next: Center) => void;
  onCommit: (next: Center) => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const at = (event: { clientX: number; clientY: number }): Center | null => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      centerX: clamp01((event.clientX - rect.left) / rect.width),
      centerY: clamp01((event.clientY - rect.top) / rect.height),
    };
  };
  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    onCommit(at(event) ?? { centerX, centerY });
  };
  return (
    <div
      ref={ref}
      className="emvb-ie-blur-focus"
      data-disabled={disabled || undefined}
      data-emvb-image-blur-area=""
      onPointerDown={(event) => {
        if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
        const pos = at(event);
        if (!pos) return;
        // Dragging the spot must not flash the original (the stage's press-and-hold compare).
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
        onChange(pos);
      }}
      onPointerMove={(event) => {
        if (disabled || !dragging) return;
        const pos = at(event);
        if (pos) onChange(pos);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="emvb-ie-blur-handle"
        data-dragging={dragging || undefined}
        data-emvb-image-blur-focus=""
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Sharp spot (blur center)"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct(centerX)}
        aria-valuetext={`${pct(centerX)}% across, ${pct(centerY)}% down`}
        aria-disabled={disabled || undefined}
        style={{ left: `${centerX * 100}%`, top: `${centerY * 100}%` }}
        onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
        onKeyDown={(event) => {
          if (disabled) return;
          const step = event.shiftKey ? 0.1 : 0.01;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const move = moves[event.key];
          if (event.key === "Home") {
            event.preventDefault();
            onCommit({ centerX: 0.5, centerY: 0.5 });
            return;
          }
          if (!move) return;
          event.preventDefault();
          event.stopPropagation();
          onChange({
            centerX: Number(clamp01(centerX + move[0]).toFixed(2)),
            centerY: Number(clamp01(centerY + move[1]).toFixed(2)),
          });
        }}
        onKeyUp={(event) => {
          if (event.key.startsWith("Arrow")) onCommit({ centerX, centerY });
        }}
      >
        <span aria-hidden="true" />
      </div>
    </div>
  );
}
