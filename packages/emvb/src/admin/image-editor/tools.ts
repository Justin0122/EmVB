/** The image editor's tools, in rail order (W-482). Panels fill in with W-483 and W-484. */
export const IMAGE_EDITOR_TOOLS = [
  {
    id: "crop",
    label: "Crop",
    title: "Crop & rotate",
    blurb: "Frame the picture, straighten the horizon and fix perspective.",
    hints: [
      "Aspect ratios, including the size of this element",
      "Rotate, flip and straighten",
      "Perspective",
    ],
  },
  {
    id: "adjust",
    label: "Adjust",
    title: "Adjust",
    blurb: "Light and colour, slider by slider.",
    hints: [
      "Exposure, contrast, highlights and shadows",
      "Temperature, tint, vibrance and saturation",
      "Clarity, grain and vignette",
    ],
  },
  {
    id: "filters",
    label: "Filters",
    title: "Filters",
    blurb: "One-click looks you can dial back.",
    hints: ["13 film-style looks with live previews", "A strength slider for each look"],
  },
  {
    id: "curves",
    label: "Curves",
    title: "Curves",
    blurb: "Fine tonal control for each colour channel.",
    hints: ["RGB, red, green and blue curves", "Drag points or type exact values"],
  },
  {
    id: "blur",
    label: "Blur",
    title: "Blur",
    blurb: "Soften the background around a sharp focus area.",
    hints: ["Lens (bokeh) and Gaussian blur", "Move the focus point"],
  },
] as const;

export type ImageEditorToolId = (typeof IMAGE_EDITOR_TOOLS)[number]["id"];

/** Rail keyboard: arrows move, Home and End jump; returns the next index or undefined. */
export function moveTool(key: string, index: number, count: number): number | undefined {
  if (key === "ArrowDown" || key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowUp" || key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return undefined;
}

/** Undo/redo/compare shortcuts, platform-neutral. */
export function shortcutFor(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): "undo" | "redo" | undefined {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return undefined;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return undefined;
}

/** "4032 × 3024 px". */
export const sizeLabel = (width: number, height: number) => `${width} × ${height} px`;

/** Media-library keys look like ULIDs; the alt text says more about the picture than that. */
const STORAGE_KEY = /^[0-9A-HJKMNP-TV-Z]{26}\.[a-z0-9]+$/i;

/** The name shown under "Edit image": the file name, unless it is a storage key. */
export function displayName(fileName: string, alt: unknown): string {
  if (!STORAGE_KEY.test(fileName)) return fileName;
  return typeof alt === "string" && alt.trim() ? alt.trim() : "Library picture";
}
