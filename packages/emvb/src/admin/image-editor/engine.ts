/**
 * EmVB's only door into photocn (D-062): the image editor reaches photocn through this file, so a
 * photocn update touches one place and tests can swap the engine out. Lazily loaded with the
 * dialog; never in the main chunk.
 *
 * W-483 moved the dialog from `photocn/photo` to `photocn/react`: its `useImageEditorState` already
 * has the crop view (whole image under a frame), transient slider edits folded into one undo step,
 * the crop keyboard and the live histogram, which the photocn-style layout needs.
 */
import { hasWebGL2, planRendering, type RenderMode } from "./worker.ts";

export {
  type CurveChannels,
  type CurvePoint,
  fitRectInPolygon,
  rectInsidePolygon,
  type NormalizedRect,
  type Quad,
  type Vec2,
} from "photocn";
export {
  aspectRatioOptions,
  errorMessage,
  ImageEditorProvider,
  useImageEditor,
  useImageEditorState,
  type AdjustSection,
  type AdjustValue,
  type BlurValue,
  type ImageEditorGeometryApi,
} from "photocn/react";
export { drawRgbHistogram } from "photocn/dom";

export type EnginePlan =
  | { ok: true; renderMode: RenderMode; spawnWorker?: () => Worker; reason?: string }
  | { ok: false; message: string };

const NO_WEBGL =
  "This browser can't edit images: it has no WebGL 2. Try an up-to-date Chrome, Edge, Firefox or Safari.";

/**
 * Decides where the editor renders before its canvas mounts (worker first, D-059): a canvas handed
 * to the worker can't come back (W-480 #4).
 */
export async function planEngine(options: { force?: RenderMode } = {}): Promise<EnginePlan> {
  const plan = await planRendering(options.force ? { force: options.force } : {});
  // The worker has its own WebGL 2 (OffscreenCanvas); the main thread needs one here (W-480 #5).
  if (plan.renderMode === "main" && !hasWebGL2()) return { ok: false, message: NO_WEBGL };
  return {
    ok: true,
    renderMode: plan.renderMode,
    spawnWorker: plan.spawnWorker,
    reason: plan.reason,
  };
}
