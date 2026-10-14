/**
 * W-495: JPEG has no transparency, and photocn's JPEG export leaves transparent pixels black.
 * Pictures that may have transparency (anything but a JPEG) are exported as PNG and then
 * flattened onto white before the single JPEG encode.
 */

/** True when a JPEG copy of this source must be flattened onto a background first. */
export function needsFlatten(format: string, sourceType: string): boolean {
  return format === "jpeg" && !/^image\/jpe?g$/i.test(sourceType);
}

/** Draws a PNG export onto white and encodes it as JPEG. */
export async function flattenToJpeg(png: Blob, quality: number | undefined): Promise<Blob> {
  const bitmap = await createImageBitmap(png);
  try {
    const { width, height } = bitmap;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Export failed.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0);
      return await canvas.convertToBlob({ type: "image/jpeg", quality });
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Export failed.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Export failed."))),
        "image/jpeg",
        quality,
      ),
    );
  } finally {
    bitmap.close();
  }
}

/** Saves a blob under a name, for Download when the file was flattened here. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
