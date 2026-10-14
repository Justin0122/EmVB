/**
 * Screen reader announcements and the plain-text summary of edits (W-487). A polite live region
 * says which tool opened and, after a pause, what the picture's edits now are (so undo, redo and
 * Reset all are heard too). Slider drags are not announced on every step.
 */
import * as React from "react";
import { summarizeImageEdit } from "../../core/image-edit/summary.ts";
import type { ImageEditRecipe } from "../../core/image-edit/schema.ts";
import { useImageEditor } from "./engine.ts";
import { IMAGE_EDITOR_TOOLS } from "./tools.ts";

/** How long the edits must stay unchanged before they are announced. */
export const ANNOUNCE_DELAY_MS = 700;

/** "Cropped · Exposure +20 · …", or "No changes", for whatever recipe the editor holds. */
export function editSummary(recipe: unknown): string {
  if (!recipe || typeof recipe !== "object") return "No changes";
  try {
    return summarizeImageEdit(recipe as ImageEditRecipe, 12);
  } catch {
    return "No changes";
  }
}

export function toolLabel(tool: string): string {
  return IMAGE_EDITOR_TOOLS.find((t) => t.id === tool)?.label ?? tool;
}

/** The current edits as text, for the Metadata panel. */
export function useEditSummary(): string {
  return editSummary(useImageEditor().recipes.current);
}

export function Announcer() {
  const editor = useImageEditor();
  const summary = editSummary(editor.recipes.current);
  const tool = editor.tool;
  const [text, setText] = React.useState("");
  const seen = React.useRef({ tool, summary, ready: editor.isReady });
  React.useEffect(() => {
    if (seen.current.tool === tool) return;
    seen.current.tool = tool;
    setText(`${toolLabel(tool)} tool`);
  }, [tool]);
  React.useEffect(() => {
    // The first summary after loading (a re-applied recipe) is part of opening, not news.
    if (!editor.isReady) return;
    if (!seen.current.ready) {
      seen.current = { ...seen.current, ready: true, summary };
      if (summary !== "No changes") setText(`Edits: ${summary}`);
      return;
    }
    if (seen.current.summary === summary) return;
    const timer = window.setTimeout(() => {
      seen.current.summary = summary;
      setText(`Edits: ${summary}`);
    }, ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [summary, editor.isReady]);
  return (
    <div className="emvb-ie-sr" role="status" aria-live="polite" data-emvb-image-live="">
      {text}
    </div>
  );
}
