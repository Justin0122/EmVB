/**
 * The Curves panel (W-484): RGB, red, green and blue tone curves drawn over the live histogram.
 *
 * Follows photocn's `curves-panel.tsx` (https://github.com/rbbydotdev/photocn,
 * apps/www/src/registry/image-editor), MIT License, Copyright (c) 2026 rbbydotdev, rebuilt with
 * Kumo and EmVB tokens. EmVB adds keyboard control: every point is a focusable slider (arrows move
 * it, + adds a point after it, Delete removes it) with Input and Output number fields.
 */
import * as React from "react";
import {
  buildSmoothPath,
  CHANNEL_INDEX,
  CHANNEL_ORDER,
  getActivePoints,
  hasAnyEdits,
  insertPoint,
  isIdentity,
  MAX_CURVE_POINTS,
  movePoint,
  removePoint,
  toLevel,
  fromLevel,
  withChannel,
  type CurvesChannel,
} from "./curve-math.ts";
import { drawRgbHistogram, useImageEditor, type CurvePoint } from "./engine.ts";
import { PanelHeader, SectionTabs } from "./parts.tsx";

const SIZE = 240;
const LABEL: Record<CurvesChannel, string> = { rgb: "RGB", r: "R", g: "G", b: "B" };
const NAME: Record<CurvesChannel, string> = { rgb: "RGB", r: "Red", g: "Green", b: "Blue" };
const STROKE: Record<CurvesChannel, string> = {
  rgb: "currentColor",
  r: "#ef4444",
  g: "#22c55e",
  b: "#3b82f6",
};

export function CurvesPanel() {
  const editor = useImageEditor();
  const disabled = editor.disabled || !editor.hasImage;
  const value = editor.curves.value;
  const histogram = editor.curves.histogram;
  const [channel, setChannel] = React.useState<CurvesChannel>("rgb");
  const [selected, setSelected] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const histRef = React.useRef<HTMLCanvasElement | null>(null);
  const pointRefs = React.useRef<(SVGCircleElement | null)[]>([]);
  const focusNext = React.useRef<number | null>(null);
  const drag = React.useRef<{ pointerId: number; index: number } | null>(null);
  const hintId = React.useId();

  React.useEffect(() => {
    const ctx = histRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (histogram?.pixels) {
      drawRgbHistogram(ctx, histogram, {
        red: STROKE.r,
        green: STROKE.g,
        blue: STROKE.b,
        alpha: 0.35,
      });
    }
  }, [histogram]);

  const points = React.useMemo(() => getActivePoints(value, channel), [value, channel]);
  const last = points.length - 1;
  React.useEffect(() => {
    if (focusNext.current === null) return;
    pointRefs.current[focusNext.current]?.focus();
    focusNext.current = null;
  });
  React.useEffect(() => setSelected(null), [channel]);

  const write = (next: CurvePoint[]) => editor.curves.set(withChannel(value, channel, next));
  const commit = () => editor.curves.commit();
  const add = (x: number, y?: number, focus = false) => {
    if (disabled) return;
    const result = insertPoint(points, x, y);
    if (!result) return;
    write(result.points);
    commit();
    setSelected(result.index);
    if (focus) focusNext.current = result.index;
  };
  const remove = (index: number) => {
    if (disabled) return;
    const next = removePoint(points, index);
    if (!next) return;
    write(next);
    commit();
    setSelected(index - 1);
    focusNext.current = index - 1;
  };
  const coords = (event: { clientX: number; clientY: number }): CurvePoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return [0, 0];
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return [x, y];
  };

  const onPointKey = (event: React.KeyboardEvent<SVGCircleElement>, index: number) => {
    const point = points[index];
    if (!point || disabled) return;
    const step = (event.shiftKey ? 10 : 1) / 255;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      write(movePoint(points, index, point[0] + move[0], point[1] + move[1]));
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(index);
    } else if (event.key === "+" || event.key === "=" || event.key === "Insert") {
      event.preventDefault();
      const other = points[index === last ? index - 1 : index + 1];
      if (other) add((point[0] + other[0]) / 2, undefined, true);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      pointRefs.current[event.key === "Home" ? 0 : last]?.focus();
    }
  };

  const ghosts = CHANNEL_ORDER.filter((c) => c !== channel).flatMap((c) => {
    const pts = value?.[CHANNEL_INDEX[c]];
    return pts && !isIdentity(pts) ? [{ channel: c, d: buildSmoothPath(pts, SIZE) }] : [];
  });
  const stroke = STROKE[channel];
  const selectedPoint = selected === null ? undefined : points[selected];
  const full = points.length >= MAX_CURVE_POINTS;

  return (
    <section aria-label="Curves" className="emvb-ie-panel" data-emvb-image-panel="curves">
      <PanelHeader
        title="Curves"
        description="RGB and per-channel tone curves"
        onReset={() => editor.curves.reset()}
        resetDisabled={disabled || !hasAnyEdits(value)}
      />
      <div className="emvb-ie-group emvb-ie-group-curves">
        <SectionTabs
          name="curves"
          variant="segmented"
          label="Channel"
          value={channel}
          items={CHANNEL_ORDER.map((c) => ({
            value: c,
            label: (
              <span
                className="emvb-ie-tab-label"
                title={c === "rgb" ? "Composite (applied first)" : `${NAME[c]} channel`}
              >
                <span
                  aria-hidden="true"
                  className="emvb-ie-dot"
                  style={{ background: STROKE[c] }}
                  data-channel={c}
                />
                {LABEL[c]}
                <span className="emvb-ie-sr"> channel</span>
              </span>
            ),
          }))}
          onChange={setChannel}
        />
        <div className="emvb-ie-curves">
          <div className="emvb-ie-curves-box" style={{ width: SIZE, height: SIZE }}>
            <canvas ref={histRef} aria-hidden="true" width={SIZE} height={SIZE} />
            <svg
              ref={svgRef}
              role="group"
              aria-label={`${NAME[channel]} curve editor`}
              aria-describedby={hintId}
              data-emvb-image-curve={channel}
              data-disabled={disabled || undefined}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              width={SIZE}
              height={SIZE}
              onPointerDown={(event) => {
                if (disabled || event.target !== event.currentTarget || event.button !== 0) return;
                add(coords(event)[0]);
              }}
              onContextMenu={(event) => {
                // photocn's context menu: right-click a point to remove it, the grid to add one there.
                event.preventDefault();
                if (disabled) return;
                const index = (event.target as Element).getAttribute("data-curve-index");
                if (index !== null) remove(Number(index));
                else {
                  const [x, y] = coords(event);
                  add(x, y);
                }
              }}
            >
              <g aria-hidden="true" pointerEvents="none" stroke="currentColor" strokeOpacity={0.12}>
                {[1, 2, 3].map((i) => (
                  <React.Fragment key={i}>
                    <line x1={(i * SIZE) / 4} y1={0} x2={(i * SIZE) / 4} y2={SIZE} />
                    <line x1={0} y1={(i * SIZE) / 4} x2={SIZE} y2={(i * SIZE) / 4} />
                  </React.Fragment>
                ))}
              </g>
              <line
                aria-hidden="true"
                pointerEvents="none"
                stroke="currentColor"
                strokeOpacity={0.2}
                strokeDasharray="4 4"
                x1={0}
                y1={SIZE}
                x2={SIZE}
                y2={0}
              />
              {ghosts.map((g) => (
                <path
                  key={g.channel}
                  d={g.d}
                  fill="none"
                  pointerEvents="none"
                  stroke={STROKE[g.channel]}
                  strokeOpacity={0.25}
                  strokeWidth={1.5}
                />
              ))}
              <path
                d={buildSmoothPath(points, SIZE)}
                fill="none"
                pointerEvents="none"
                stroke={stroke}
                strokeWidth={2}
              />
              {points.map((p, i) => {
                const end = i === 0 || i === last;
                return (
                  <circle
                    // Points keep their index: a point never passes its neighbours.
                    key={i}
                    ref={(el) => {
                      pointRefs.current[i] = el;
                    }}
                    data-curve-index={i}
                    className="emvb-ie-curve-point"
                    data-selected={selected === i || undefined}
                    cx={p[0] * SIZE}
                    cy={SIZE - p[1] * SIZE}
                    r={6}
                    stroke={stroke}
                    strokeWidth={2}
                    tabIndex={disabled ? -1 : 0}
                    role="slider"
                    aria-label={`Point ${i + 1} of ${points.length}${end ? (i === 0 ? ", shadows end" : ", highlights end") : ""}`}
                    aria-valuemin={0}
                    aria-valuemax={255}
                    aria-valuenow={toLevel(p[1])}
                    aria-valuetext={`input ${toLevel(p[0])}, output ${toLevel(p[1])}`}
                    aria-disabled={disabled || undefined}
                    style={{ cursor: disabled ? "not-allowed" : end ? "ns-resize" : "grab" }}
                    onFocus={() => setSelected(i)}
                    onKeyDown={(event) => onPointKey(event, i)}
                    onKeyUp={(event) => {
                      if (event.key.startsWith("Arrow")) commit();
                    }}
                    onPointerDown={(event) => {
                      if (disabled) return;
                      event.stopPropagation();
                      setSelected(i);
                      if (event.shiftKey) {
                        remove(i);
                        return;
                      }
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      drag.current = { pointerId: event.pointerId, index: i };
                    }}
                    onPointerMove={(event) => {
                      const d = drag.current;
                      if (!d || d.pointerId !== event.pointerId) return;
                      const [x, y] = coords(event);
                      write(movePoint(points, d.index, x, y));
                    }}
                    onPointerUp={(event) => {
                      const d = drag.current;
                      if (!d || d.pointerId !== event.pointerId) return;
                      drag.current = null;
                      commit();
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                      commit();
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      remove(i);
                    }}
                  />
                );
              })}
            </svg>
          </div>
          <p className="emvb-ie-hint" id={hintId}>
            Click to add. Drag to move. Double-click or right-click to remove.
            <span className="emvb-ie-hint-keys">
              Tab to a point: arrows move it (⇧ ×10), <kbd>+</kbd> adds one, <kbd>Delete</kbd>{" "}
              removes it.
            </span>
          </p>
          {full ? (
            <p className="emvb-ie-hint">A curve can have up to {MAX_CURVE_POINTS} points.</p>
          ) : null}
        </div>
        {selectedPoint && selected !== null ? (
          <div className="emvb-ie-point-fields" role="group" aria-label={`Point ${selected + 1}`}>
            <LevelField
              label="Input"
              value={toLevel(selectedPoint[0])}
              disabled={disabled || selected === 0 || selected === last}
              onChange={(level) => {
                write(movePoint(points, selected, fromLevel(level), selectedPoint[1]));
                commit();
              }}
            />
            <LevelField
              label="Output"
              value={toLevel(selectedPoint[1])}
              disabled={disabled}
              onChange={(level) => {
                write(movePoint(points, selected, selectedPoint[0], fromLevel(level)));
                commit();
              }}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** A 0–255 level field for the selected point. */
function LevelField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (level: number) => void;
}) {
  const id = React.useId();
  const [draft, setDraft] = React.useState<string | null>(null);
  const apply = (raw: string) => {
    setDraft(null);
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && raw.trim() !== "" && n !== value)
      onChange(Math.min(255, Math.max(0, n)));
  };
  return (
    <label className="emvb-ie-level" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="number"
        min={0}
        max={255}
        step={1}
        inputMode="numeric"
        disabled={disabled}
        data-emvb-image-level={label.toLowerCase()}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => {
          if (draft !== null) apply(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply(event.currentTarget.value);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDraft(null);
          }
        }}
      />
    </label>
  );
}
