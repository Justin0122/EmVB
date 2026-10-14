/**
 * The Adjust (and Effects), Filters and Blur panels (W-484).
 *
 * Layout, wording and behaviour follow photocn's `adjustments-panel.tsx`, `filters-panel.tsx` and
 * `blur-panel.tsx` (https://github.com/rbbydotdev/photocn, apps/www/src/registry/image-editor),
 * MIT License, Copyright (c) 2026 rbbydotdev, rebuilt with Kumo components and EmVB tokens. Every
 * slider also takes a typed value.
 */
import { Button } from "@cloudflare/kumo";
import {
  ApertureIcon,
  ArrowCounterClockwiseIcon,
  CircleNotchIcon,
  PaletteIcon,
  RecordIcon,
  SparkleIcon,
  SunIcon,
  type Icon,
} from "@phosphor-icons/react";
import * as React from "react";
import { SOLID_PRIMARY } from "../ui.ts";
import { useImageEditor, type AdjustSection, type AdjustValue, type BlurValue } from "./engine.ts";
import { IconButton, PanelHeader, SectionTabs, ValueSlider } from "./parts.tsx";

type Control = { key: string; label: string };
type SectionConfig = {
  value: AdjustSection;
  label: string;
  description: string;
  icon: Icon;
  controls: readonly Control[];
};

/** photocn's adjustment sections; every slider runs from −1 to 1 in steps of 0.01. */
const ADJUST_SECTIONS: readonly SectionConfig[] = [
  {
    value: "lights",
    label: "Light",
    description: "Exposure, contrast, and tonal recovery",
    icon: SunIcon,
    controls: [
      { key: "brightness", label: "Brightness" },
      { key: "exposure", label: "Exposure" },
      { key: "gamma", label: "Gamma" },
      { key: "contrast", label: "Contrast" },
      { key: "shadows", label: "Shadows" },
      { key: "highlights", label: "Highlights" },
      { key: "bloom", label: "Bloom" },
    ],
  },
  {
    value: "colors",
    label: "Color",
    description: "Temperature, tint, and color intensity",
    icon: PaletteIcon,
    controls: [
      { key: "temperature", label: "Temperature" },
      { key: "tint", label: "Tint" },
      { key: "vibrance", label: "Vibrance" },
      { key: "saturation", label: "Saturation" },
      { key: "sepia", label: "Sepia" },
    ],
  },
  {
    value: "effects",
    label: "Effects",
    description: "Texture, grain, and edge falloff",
    icon: SparkleIcon,
    controls: [
      { key: "clarity", label: "Clarity" },
      { key: "noise", label: "Noise" },
      { key: "vignette", label: "Vignette" },
    ],
  },
];

/** "+0.25", "0.00", "−0.40" as photocn shows them (ASCII minus, so it can be typed back). */
function formatAdjust(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? `+${rounded.toFixed(2)}` : rounded.toFixed(2);
}

const tabLabel = (IconC: Icon, text: string) => (
  <span className="emvb-ie-tab-label">
    <IconC aria-hidden="true" />
    {text}
  </span>
);

/** Light, color and effects sliders. The Effects tool opens it on its Effects tab, as photocn does. */
export function AdjustPanel({ defaultSection = "lights" }: { defaultSection?: AdjustSection }) {
  const editor = useImageEditor();
  const [section, setSection] = React.useState<AdjustSection>(defaultSection);
  React.useEffect(() => setSection(defaultSection), [defaultSection]);
  const disabled = editor.disabled || !editor.hasImage;
  const config = ADJUST_SECTIONS.find((s) => s.value === section) ?? ADJUST_SECTIONS[0];
  if (!config) return null;
  const values = editor.adjust.value[section] as unknown as Record<string, number>;
  const set = (key: string, v: number) => {
    const next = { ...values, [key]: v };
    if (section === "lights") editor.adjust.setLights(next as unknown as AdjustValue["lights"]);
    else if (section === "colors")
      editor.adjust.setColors(next as unknown as AdjustValue["colors"]);
    else editor.adjust.setEffects(next as unknown as AdjustValue["effects"]);
  };
  const sectionDirty = Object.values(values).some((v) => v !== 0);
  return (
    <section aria-label="Adjustments" className="emvb-ie-panel" data-emvb-image-panel={editor.tool}>
      <PanelHeader
        title="Adjustments"
        description="Light, color, and effects"
        onReset={() => editor.adjust.reset()}
        resetDisabled={disabled}
      />
      <div className="emvb-ie-tabs-wrap">
        <SectionTabs
          name="adjust"
          label="Adjustment sections"
          value={section}
          items={ADJUST_SECTIONS.map((s) => ({ value: s.value, label: tabLabel(s.icon, s.label) }))}
          onChange={setSection}
        />
      </div>
      <hr className="emvb-ie-sep" />
      <fieldset className="emvb-ie-group emvb-ie-group-sliders" data-emvb-image-section={section}>
        <legend className="emvb-ie-sr">{config.label}</legend>
        <div className="emvb-ie-row emvb-ie-row-between emvb-ie-section-head">
          <div className="emvb-ie-section-titles">
            <span className="emvb-ie-section-title">{config.label}</span>
            <span className="emvb-ie-section-desc">{config.description}</span>
          </div>
          <IconButton
            label={`Reset ${config.label.toLowerCase()}`}
            icon={<ArrowCounterClockwiseIcon aria-hidden="true" />}
            disabled={disabled || !sectionDirty}
            onClick={() => editor.adjust.resetSection(section)}
            data-emvb-image-section-reset={section}
          />
        </div>
        {config.controls.map((control) => (
          <ValueSlider
            key={`${section}-${control.key}`}
            name={control.key}
            label={control.label}
            min={-1}
            max={1}
            step={0.01}
            value={values[control.key] ?? 0}
            disabled={disabled}
            format={formatAdjust}
            onChange={(v) => set(control.key, v)}
            onCommit={() => editor.commit()}
          />
        ))}
      </fieldset>
    </section>
  );
}

/** photocn names its looks in lower case ("crema"); the button says "Crema". */
const title = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);

const pct = (v: number) => `${Math.round(v)}%`;
const toPct = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100);

/** photocn's 13 looks (9 LUTs, 4 colour matrices) and a strength slider once one is chosen. */
export function FiltersPanel() {
  const editor = useImageEditor();
  const [loading, setLoading] = React.useState<string | null>(null);
  const disabled = editor.disabled || !editor.hasImage;
  const active = editor.filters.value.label;
  const busy = loading !== null;
  const choose = async (preset: (typeof editor.filters.presets)[number]) => {
    if (disabled || busy) return;
    setLoading(preset.label);
    try {
      const opt = await preset.load();
      editor.patch("filters", { opt, mix: 0 });
    } finally {
      setLoading(null);
    }
  };
  const chip = (label: string, selected: boolean, onClick: () => void, isLoading = false) => (
    <Button
      key={label}
      type="button"
      size="sm"
      variant={selected ? "primary" : "outline"}
      className="emvb-ie-btn emvb-ie-chip"
      style={selected ? SOLID_PRIMARY : undefined}
      aria-pressed={selected}
      disabled={disabled || (busy && !isLoading)}
      onClick={onClick}
      data-emvb-image-filter={label}
    >
      {isLoading ? (
        <>
          <CircleNotchIcon aria-hidden="true" className="emvb-ie-spin" />
          <span className="emvb-ie-sr">Loading {title(label)}</span>
        </>
      ) : (
        title(label)
      )}
    </Button>
  );
  return (
    <section aria-label="Filters" className="emvb-ie-panel" data-emvb-image-panel="filters">
      <PanelHeader
        title="Filters"
        description="Film-style looks"
        onReset={() => editor.filters.reset()}
        resetDisabled={disabled}
      />
      <div className="emvb-ie-group emvb-ie-group-sliders">
        <div className="emvb-ie-chips" role="group" aria-label="Looks">
          {chip("None", active === null, () => {
            if (!disabled && !busy) void editor.filters.select(null);
          })}
          {editor.filters.presets.map((preset) =>
            chip(
              preset.label,
              active === preset.label,
              () => void choose(preset),
              loading === preset.label,
            ),
          )}
        </div>
        {active !== null ? (
          <ValueSlider
            name="filter-strength"
            label="Strength"
            min={0}
            max={100}
            step={1}
            value={toPct(editor.filters.value.strength)}
            disabled={disabled}
            format={pct}
            onChange={(v) => editor.filters.setStrength(v / 100)}
            onCommit={() => editor.commit()}
          />
        ) : null}
      </div>
    </section>
  );
}

type BlurKind = "bokeh" | "gaussian";
const BLUR_KINDS: readonly {
  value: BlurKind;
  label: string;
  icon: Icon;
  strength: "bokehStrength" | "gaussianStrength";
  radius: "bokehLensOut" | "gaussianLensOut";
}[] = [
  {
    value: "bokeh",
    label: "Bokeh",
    icon: ApertureIcon,
    strength: "bokehStrength",
    radius: "bokehLensOut",
  },
  {
    value: "gaussian",
    label: "Gaussian",
    icon: RecordIcon,
    strength: "gaussianStrength",
    radius: "gaussianLensOut",
  },
];

const BLUR_DEFAULT: BlurValue = {
  bokehStrength: 0,
  bokehLensOut: 0.5,
  gaussianStrength: 0,
  gaussianLensOut: 0.5,
  centerX: 0.5,
  centerY: 0.5,
};

const isBlurDefault = (v: BlurValue) =>
  (Object.keys(BLUR_DEFAULT) as (keyof BlurValue)[]).every((k) => v[k] === BLUR_DEFAULT[k]);

/** Bokeh or Gaussian strength and radius, and the sharp spot (also draggable on the image). */
export function BlurPanel() {
  const editor = useImageEditor();
  const [kind, setKind] = React.useState<BlurKind>("bokeh");
  const disabled = editor.disabled || !editor.hasImage;
  const value = editor.blur.value;
  const config = BLUR_KINDS.find((k) => k.value === kind) ?? BLUR_KINDS[0];
  if (!config) return null;
  const set = (key: keyof BlurValue, percent: number) =>
    editor.blur.set({ ...value, [key]: percent / 100 });
  const slider = (name: string, label: string, key: keyof BlurValue) => (
    <ValueSlider
      key={name}
      name={name}
      label={label}
      min={0}
      max={100}
      step={1}
      value={toPct(value[key])}
      disabled={disabled}
      format={pct}
      onChange={(v) => set(key, v)}
      onCommit={() => editor.commit()}
    />
  );
  return (
    <section aria-label="Blur" className="emvb-ie-panel" data-emvb-image-panel="blur">
      <PanelHeader
        title="Blur"
        description="Bokeh and gaussian blur"
        onReset={() => editor.blur.reset()}
        resetDisabled={disabled || isBlurDefault(value)}
      />
      <div className="emvb-ie-tabs-wrap">
        <SectionTabs
          name="blur"
          label="Blur kind"
          value={kind}
          items={BLUR_KINDS.map((k) => ({ value: k.value, label: tabLabel(k.icon, k.label) }))}
          onChange={setKind}
        />
      </div>
      <hr className="emvb-ie-sep" />
      <div className="emvb-ie-group emvb-ie-group-sliders" data-emvb-image-section={kind}>
        {slider(`${kind}-strength`, "Strength", config.strength)}
        {slider(`${kind}-radius`, "Radius", config.radius)}
        <hr className="emvb-ie-sep" />
        <fieldset className="emvb-ie-subgroup">
          <legend className="emvb-ie-caps">Center</legend>
          {slider("center-x", "X", "centerX")}
          {slider("center-y", "Y", "centerY")}
        </fieldset>
      </div>
    </section>
  );
}
