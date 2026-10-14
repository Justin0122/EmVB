import type { ImageEditRecipe } from "./schema.ts";

const LABELS: Record<string, string> = {
  brightness: "Brightness",
  exposure: "Exposure",
  gamma: "Gamma",
  contrast: "Contrast",
  shadows: "Shadows",
  highlights: "Highlights",
  bloom: "Bloom",
  temperature: "Temperature",
  tint: "Tint",
  vibrance: "Vibrance",
  saturation: "Saturation",
  sepia: "Sepia",
  clarity: "Clarity",
  noise: "Grain",
  vignette: "Vignette",
};

const signed = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 100)}`;
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One line for the "Edited" badge tooltip and the Info panel, e.g.
 * "Juno 80% · Cropped · Rotated · Exposure +20 · Saturation -15".
 * At most `max` parts; the rest are counted ("+2 more").
 */
export function summarizeImageEdit(recipe: ImageEditRecipe, max = 5): string {
  const parts: string[] = [];
  if (recipe.filters) {
    const s = recipe.filters.strength;
    parts.push(
      s === undefined || s >= 1
        ? title(recipe.filters.label)
        : `${title(recipe.filters.label)} ${Math.round(s * 100)}%`,
    );
  }
  const g = recipe.geometry;
  if (g) {
    if (g.crop || g.aspectRatio) parts.push("Cropped");
    if (g.quarterTurns || (g.straighten !== undefined && g.straighten !== 0)) parts.push("Rotated");
    if (g.flipX) parts.push("Flipped");
    if (g.perspectiveX || g.perspectiveY || g.corners) parts.push("Perspective");
  }
  for (const section of [recipe.lights, recipe.colors, recipe.effects]) {
    for (const [key, value] of Object.entries(section ?? {})) {
      if (typeof value === "number" && value !== 0)
        parts.push(`${LABELS[key] ?? key} ${signed(value)}`);
    }
  }
  if (recipe.curves?.some((c) => c !== null)) parts.push("Curves");
  if (recipe.blur && Object.values(recipe.blur).some((v) => v)) parts.push("Blur");
  if (recipe.blend) parts.push("Blend");
  if (parts.length === 0) return "No changes";
  if (parts.length <= max) return parts.join(" · ");
  return `${parts.slice(0, max).join(" · ")} · +${parts.length - max} more`;
}
