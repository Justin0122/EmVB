import type { PluginRoute } from "emdash";
import { nodeFs } from "./node-fs.ts";

/** What `emvb({ canvasCss })` hands the plugin: the file's path and its text at config time. */
export type CanvasCssOptions = { canvasCssPath?: string; canvasCss?: string };

/** The most site CSS the canvas takes. */
const MAX_CANVAS_CSS = 2 * 1024 * 1024;

/**
 * The site's stylesheet for the editor canvas (`emvb({ canvasCss })`). On Node it is read again
 * on each request, so edits show after a reload; elsewhere the copy taken at config time.
 */
export const canvasCssRoute = (options: CanvasCssOptions): PluginRoute => ({
  permission: "content:edit_any",
  handler: async (ctx) => {
    const path = options.canvasCssPath;
    if (!path) return { css: "" };
    let css = options.canvasCss ?? "";
    try {
      const fresh = nodeFs()?.readFileSync(path, "utf8");
      if (typeof fresh === "string") css = fresh;
    } catch {
      if (!css) ctx.log.warn("emvb: canvasCss file can't be read", { path });
    }
    return { css: css.slice(0, MAX_CANVAS_CSS) };
  },
});
