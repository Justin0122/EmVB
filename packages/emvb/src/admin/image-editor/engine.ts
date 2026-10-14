/**
 * EmVB's only door into photocn (D-062): the image editor talks to `Photo` through this file, so
 * a photocn update touches one place. Lazily loaded with the dialog; never in the main chunk.
 */
import { createPhoto, type Photo } from "photocn/photo";
import { hasWebGL2, planRendering, type RenderMode } from "./worker.ts";

export type { Photo };

export type OpenedPhoto =
  | { ok: true; photo: Photo; renderMode: RenderMode; reason?: string }
  | { ok: false; message: string };

const NO_WEBGL =
  "This browser can't edit images: it has no WebGL 2. Try an up-to-date Chrome, Edge, Firefox or Safari.";

/** Loads the picture into photocn and decides where it renders (worker first, D-059). */
export async function openPhoto(
  blob: Blob,
  name: string,
  type: string,
  options: { force?: RenderMode } = {},
): Promise<OpenedPhoto> {
  const plan = await planRendering(options.force ? { force: options.force } : {});
  // The worker has its own WebGL 2 (OffscreenCanvas); the main thread needs one here (W-480 #5).
  if (plan.renderMode === "main" && !hasWebGL2()) return { ok: false, message: NO_WEBGL };
  try {
    const photo = await createPhoto(blob, {
      renderMode: plan.renderMode,
      spawnWorker: plan.spawnWorker,
      decodeOptions: { name, type },
    });
    return { ok: true, photo, renderMode: plan.renderMode, reason: plan.reason };
  } catch (error) {
    return {
      ok: false,
      message: `Couldn't open this picture${error instanceof Error && error.message ? `: ${error.message}` : "."}`,
    };
  }
}
