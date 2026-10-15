import type { PluginDescriptor } from "emdash";
import { ADMIN_ENTRY, PACKAGE_NAME, PLUGIN_ID, PLUGIN_VERSION } from "./constants.ts";
import { nodeFs } from "./server/node-fs.ts";
import { createPlugin } from "./server/plugin.ts";

export type EmvbOptions = {
  /**
   * The site's own stylesheet (a path from the project root, such as `./src/styles/global.css`).
   * The editor canvas adds it after EmVB's CSS, as the site's pages do, so blocks look the same
   * while editing. Plain CSS: it is not run through Vite.
   */
  canvasCss?: string;
};

/** Descriptor that host sites add to `emdash({ plugins: [...] })` in astro.config. */
export function emvb(options: EmvbOptions = {}): PluginDescriptor {
  return {
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    format: "native",
    entrypoint: PACKAGE_NAME,
    adminEntry: ADMIN_ENTRY,
    options: options.canvasCss ? canvasCssOptions(options.canvasCss) : {},
  };
}

/**
 * The stylesheet's path from the project root, and its text as it is now: a Worker can't read
 * the file later, so the built site keeps this copy. On Node the route reads the file again, so
 * changes show in the editor without a restart.
 */
function canvasCssOptions(file: string) {
  const fs = nodeFs();
  const cwd = (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? "";
  const path = file.startsWith("/") ? file : `${cwd}/${file.replace(/^\.\//, "")}`;
  let css = "";
  try {
    css = fs?.readFileSync(path, "utf8") ?? "";
  } catch {
    // A missing file leaves the canvas with EmVB's CSS only; the route says so in the log.
  }
  return { canvasCssPath: path, canvasCss: css };
}

export { createPlugin };
export default createPlugin;
