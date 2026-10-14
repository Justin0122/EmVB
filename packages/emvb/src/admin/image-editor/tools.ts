/**
 * The image editor's tools, in photocn's order (W-483). The ids are photocn's tool ids, so the
 * crop tool is "compose" (its crop view) and the panels can come straight from its hook.
 */
export const IMAGE_EDITOR_TOOLS = [
  { id: "adjust", label: "Adjust", blurb: "Light, color, and effects" },
  { id: "compose", label: "Crop", blurb: "Drag the frame on the image to crop" },
  { id: "curves", label: "Curves", blurb: "Tone curves for RGB and each channel" },
  { id: "effects", label: "Effects", blurb: "Clarity, grain, vignette and more" },
  { id: "filters", label: "Filters", blurb: "Looks with a strength slider" },
  { id: "blender", label: "Blender", blurb: "Blend a second picture into this one" },
  { id: "blur", label: "Blur", blurb: "Soften everything around a sharp spot" },
  { id: "metadata", label: "Metadata", blurb: "File details and camera data" },
] as const;

export type ImageEditorToolId = (typeof IMAGE_EDITOR_TOOLS)[number]["id"];

/** Tools whose panels land in later work items (W-484 to W-486); they show what's coming. */
export const COMING_SOON: Record<Exclude<ImageEditorToolId, "compose">, readonly string[]> = {
  adjust: [
    "Brightness, exposure, contrast",
    "Shadows, highlights, bloom",
    "Temperature, tint, saturation",
  ],
  curves: ["RGB, red, green and blue curves", "Drawn over a live histogram"],
  effects: ["Clarity, dehaze, grain", "Vignette that follows the crop"],
  filters: ["13 looks with live previews", "A strength slider for each look"],
  blender: ["Blend a picture from your media library", "A mix slider"],
  blur: ["Lens (bokeh) and Gaussian blur", "Drag the dot to choose what stays sharp"],
  metadata: ["File name, size and type", "Camera details, with GPS removed when saving"],
};

/** "4032 × 3024 px". */
export const sizeLabel = (width: number, height: number) => `${width} × ${height} px`;

/** Media-library keys look like ULIDs; the alt text says more about the picture than that. */
const STORAGE_KEY = /^[0-9A-HJKMNP-TV-Z]{26}\.[a-z0-9]+$/i;

/** The name shown in the editor: the file name, unless it is a storage key. */
export function displayName(fileName: string, alt: unknown): string {
  if (!STORAGE_KEY.test(fileName)) return fileName;
  return typeof alt === "string" && alt.trim() ? alt.trim() : "Library picture";
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * W-483 "Fit this element": a crop preset with the Image element's own width and height, so the
 * saved picture fills it without being cut. Landscape-first like photocn's presets (its portrait
 * toggle turns it); undefined when the element has no usable size or it equals a square.
 */
export function elementAspectOption(
  width: unknown,
  height: unknown,
): { value: string; label: string } | undefined {
  if (typeof width !== "number" || typeof height !== "number") return undefined;
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < 1 || h < 1 || w > 100_000 || h > 100_000) return undefined;
  const d = gcd(w, h);
  const [a, b] = w >= h ? [w / d, h / d] : [h / d, w / d];
  // Ratios like 1279:719 read as noise; the label keeps the element size instead.
  return { value: `${a}:${b}`, label: `Fit this element (${w} × ${h})` };
}
