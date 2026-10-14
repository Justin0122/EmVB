/**
 * The sidebar panels: the crop tool's controls (W-483), the tone tools (W-484, in tone-panels.tsx
 * CurvesPanel.tsx and MetadataPanel.tsx), and a placeholder for the blender tool.
 *
 * The crop panel follows photocn's `crop-panel.tsx` (https://github.com/rbbydotdev/photocn,
 * apps/www/src/registry/image-editor), MIT License, Copyright (c) 2026 rbbydotdev, rebuilt with
 * Kumo components and EmVB tokens.
 */
import { Button, Select } from "@cloudflare/kumo";
import {
  ArrowCounterClockwiseIcon,
  ClockCountdownIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  RectangleIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { SOLID_PRIMARY } from "../ui.ts";
import { useImageEditor } from "./engine.ts";
import {
  CenteredSlider,
  IconButton,
  PanelHeader,
  RotateSquareIcon,
  SkewIcon,
  TOOL_ICONS,
} from "./parts.tsx";
import { CurvesPanel } from "./CurvesPanel.tsx";
import { AdjustPanel, BlurPanel, FiltersPanel } from "./tone-panels.tsx";
import { MetadataPanel } from "./MetadataPanel.tsx";
import { COMING_SOON, IMAGE_EDITOR_TOOLS, type ImageEditorToolId } from "./tools.ts";

/** Keys handled by photocn while the crop tool is active (its `handleCropKey`). */
const CROP_SHORTCUTS: readonly [keys: string, action: string][] = [
  ["R / ⇧R", "Rotate right / left"],
  ["H · V", "Flip horizontal · vertical"],
  ["X", "Portrait ⇄ landscape"],
  ["[ ]", "Straighten ±0.5° (⇧ ±5°)"],
  ["← → ↑ ↓", "Move the image (⇧ faster)"],
  ["Scroll", "Zoom inside the frame"],
  ["Esc", "Cancel a drag / leave corners"],
  ["⌫", "Reset crop"],
  ["↵", "Done"],
];

const degrees = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°`;
const percent = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;

/** Quarter turns, flips, ratio, straighten and perspective. Cropping happens on the canvas. */
function CropPanel() {
  const editor = useImageEditor();
  const g = editor.geometry;
  const disabled = editor.disabled || !editor.hasImage;
  const canToggleOrientation = g.aspectRatio !== "1:1";
  const ratioId = React.useId();
  return (
    <section aria-label="Crop" className="emvb-ie-panel" data-emvb-image-panel="compose">
      <PanelHeader
        title="Crop"
        description="Drag the frame on the image to crop"
        onReset={() => g.reset()}
        resetDisabled={disabled || g.isDefault}
      />
      <div className="emvb-ie-group">
        <div className="emvb-ie-row" role="group" aria-label="Rotate and flip">
          <IconButton
            label="Rotate left"
            icon={<RotateSquareIcon direction="left" />}
            disabled={disabled}
            onClick={() => g.rotate(-1)}
            data-emvb-image-rotate="left"
          />
          <IconButton
            label="Rotate right"
            icon={<RotateSquareIcon direction="right" />}
            disabled={disabled}
            onClick={() => g.rotate(1)}
            data-emvb-image-rotate="right"
          />
          <span className="emvb-ie-vsep" aria-hidden="true" />
          <IconButton
            label="Flip horizontal"
            icon={<FlipHorizontalIcon aria-hidden="true" />}
            disabled={disabled}
            onClick={() => g.flip("horizontal")}
            data-emvb-image-flip="horizontal"
          />
          <IconButton
            label="Flip vertical"
            icon={<FlipVerticalIcon aria-hidden="true" />}
            disabled={disabled}
            onClick={() => g.flip("vertical")}
            data-emvb-image-flip="vertical"
          />
        </div>
        <div className="emvb-ie-field">
          <span className="emvb-ie-label" id={ratioId}>
            Aspect ratio
          </span>
          <div className="emvb-ie-row emvb-ie-row-fill">
            <Select
              aria-labelledby={ratioId}
              className="emvb-ie-select"
              disabled={disabled}
              value={g.aspectRatio}
              items={Object.fromEntries(g.aspectRatioOptions.map((o) => [o.value, o.label]))}
              onValueChange={(next) => {
                if (typeof next === "string" && next) g.setAspectRatio(next);
              }}
            >
              {g.aspectRatioOptions.map((option) => (
                <Select.Option key={option.value} value={option.value}>
                  {option.label}
                </Select.Option>
              ))}
            </Select>
            <IconButton
              variant="outline"
              label={g.portrait ? "Switch to landscape" : "Switch to portrait"}
              icon={
                <RectangleIcon
                  aria-hidden="true"
                  style={g.portrait ? { transform: "rotate(90deg)" } : undefined}
                />
              }
              disabled={disabled || !canToggleOrientation}
              onClick={() => g.toggleOrientation()}
              data-emvb-image-orientation={g.portrait ? "portrait" : "landscape"}
            />
          </div>
        </div>
        <CenteredSlider
          name="straighten"
          label="Straighten"
          min={-45}
          max={45}
          step={0.1}
          value={g.value.straighten}
          disabled={disabled}
          format={degrees}
          onChange={(v) => g.setStraighten(v, { transient: true })}
          onCommit={() => g.commit()}
        />
      </div>
      <hr className="emvb-ie-sep" />
      <fieldset className="emvb-ie-group">
        <div className="emvb-ie-row emvb-ie-row-between">
          <legend className="emvb-ie-label">Perspective</legend>
          <div className="emvb-ie-row">
            {g.value.corners ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="emvb-ie-btn"
                icon={<ArrowCounterClockwiseIcon aria-hidden="true" />}
                disabled={disabled}
                onClick={() => g.resetCorners()}
              >
                Corners
              </Button>
            ) : null}
            <IconButton
              variant="outline"
              label="Adjust corners"
              icon={<SkewIcon />}
              aria-pressed={g.editingCorners}
              disabled={disabled}
              onClick={() => g.setEditingCorners(!g.editingCorners)}
              data-emvb-image-corners=""
            />
          </div>
        </div>
        <CenteredSlider
          name="perspective-y"
          label="Vertical"
          min={-1}
          max={1}
          step={0.01}
          value={g.value.perspectiveY}
          disabled={disabled}
          format={percent}
          onChange={(y) => g.setPerspective({ y }, { transient: true })}
          onCommit={() => g.commit()}
        />
        <CenteredSlider
          name="perspective-x"
          label="Horizontal"
          min={-1}
          max={1}
          step={0.01}
          value={g.value.perspectiveX}
          disabled={disabled}
          format={percent}
          onChange={(x) => g.setPerspective({ x }, { transient: true })}
          onCommit={() => g.commit()}
        />
      </fieldset>
      <hr className="emvb-ie-sep" />
      <div className="emvb-ie-group emvb-ie-group-tight">
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="emvb-ie-btn emvb-ie-done"
          style={SOLID_PRIMARY}
          disabled={disabled}
          onClick={() => g.done()}
          data-emvb-image-crop-done=""
        >
          Done
        </Button>
        <details className="emvb-ie-shortcuts">
          <summary>Keyboard shortcuts</summary>
          <dl>
            {CROP_SHORTCUTS.map(([keys, action]) => (
              <div key={keys}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </section>
  );
}

/** A tool whose controls arrive in a later update: its header and what it will do. */
function ComingSoonPanel({ tool }: { tool: keyof typeof COMING_SOON }) {
  const meta = IMAGE_EDITOR_TOOLS.find((t) => t.id === tool) ?? IMAGE_EDITOR_TOOLS[0];
  const ToolIcon = TOOL_ICONS[tool];
  return (
    <section aria-label={meta.label} className="emvb-ie-panel" data-emvb-image-panel={tool}>
      <PanelHeader title={meta.label} description={meta.blurb} />
      <div className="emvb-ie-group">
        <div className="emvb-ie-soon">
          <span className="emvb-ie-soon-icon" aria-hidden="true">
            <ToolIcon />
          </span>
          <div>
            <p className="emvb-ie-soon-title">
              <ClockCountdownIcon aria-hidden="true" /> Coming in the next update
            </p>
            <ul>
              {COMING_SOON[tool].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="emvb-ie-note">
          Saving makes a new copy in the media library; the picture you started from is never
          changed.
        </p>
      </div>
    </section>
  );
}

/** The active tool's panel. */
export function ToolPanel() {
  const editor = useImageEditor();
  const tool = editor.tool as ImageEditorToolId;
  switch (tool) {
    case "compose":
      return <CropPanel />;
    case "adjust":
      return <AdjustPanel />;
    case "effects":
      return <AdjustPanel defaultSection="effects" />;
    case "filters":
      return <FiltersPanel />;
    case "curves":
      return <CurvesPanel />;
    case "blur":
      return <BlurPanel />;
    case "metadata":
      return <MetadataPanel />;
    case "blender":
      return <ComingSoonPanel tool={tool} />;
    default:
      return null;
  }
}
