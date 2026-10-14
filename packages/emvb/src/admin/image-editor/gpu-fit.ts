/**
 * W-496: photocn renders with WebGL, which can't hold a picture wider or taller than the GPU's
 * texture limit (often 8192 or 16384 px). Past it the preview stayed empty and Save copy wrote a
 * flat grey file. Such pictures are scaled down to the limit before editing, and the editor says
 * so. Crops in the recipe are fractions of the picture, so a re-open still lines up.
 */
import type { LoadedSource } from "./load.ts";

type Size = { width: number; height: number };

/** The largest side this device's WebGL can render, or null without WebGL. */
function gpuMaxSide(): number | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ??
      canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | null;
    const limits = [
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
      viewport?.[0] ?? Infinity,
      viewport?.[1] ?? Infinity,
    ].filter((n) => Number.isFinite(n) && n > 0);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return limits.length ? Math.min(...limits) : null;
  } catch {
    return null;
  }
}

/** The size to edit at: null when the picture already fits. */
export function fitWithin(size: Size, maxSide: number | null): Size | null {
  if (!maxSide || (size.width <= maxSide && size.height <= maxSide)) return null;
  const scale = maxSide / Math.max(size.width, size.height);
  return {
    width: Math.max(1, Math.min(maxSide, Math.floor(size.width * scale))),
    height: Math.max(1, Math.min(maxSide, Math.floor(size.height * scale))),
  };
}

type Ready = Extract<LoadedSource, { ok: true }>;

/** Scales a picture past the GPU limit down to it; other pictures are returned as they are. */
export async function fitSourceToGpu(
  source: Ready,
  maxSide: number | null = gpuMaxSide(),
): Promise<Ready> {
  if (!maxSide || typeof createImageBitmap !== "function") return source;
  const full = await createImageBitmap(source.blob);
  const original = { width: full.width, height: full.height };
  full.close();
  const target = fitWithin(original, maxSide);
  if (!target) return source;
  const bitmap = await createImageBitmap(source.blob, {
    resizeWidth: target.width,
    resizeHeight: target.height,
    resizeQuality: "high",
  });
  const jpeg = /^image\/jpe?g$/i.test(source.type);
  const type = jpeg ? "image/jpeg" : "image/png";
  let blob: Blob;
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(target.width, target.height);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      blob = await canvas.convertToBlob({ type, quality: 0.95 });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = target.width;
      canvas.height = target.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("too large"))), type, 0.95),
      );
    }
  } finally {
    bitmap.close();
  }
  return { ...source, blob, type, reducedFrom: original };
}
