import { describe, expect, test } from "bun:test";
import { formatBytes, metadataRows } from "./MetadataPanel.tsx";

describe("Metadata rows (W-486, photocn's metadata panel)", () => {
  test("follow photocn's order and leave out what's missing", () => {
    const rows = metadataRows({
      fileInfo: { name: "a.jpg", type: "image/jpeg", size: 1536 },
      image: { naturalWidth: 640, naturalHeight: 480 },
      metadata: {
        icc: { ColorProfile: ["sRGB IEC61966-2.1"] },
        tiff: { Model: { value: "Pixel 8" } },
        exif: { LensModel: { hvalue: "4.7 mm" } },
        gps: { GPSLatitude: { hvalue: 43.5 } },
      },
    });
    expect(rows).toEqual([
      { label: "Name", value: "a.jpg" },
      { label: "Type", value: "image/jpeg" },
      { label: "Size", value: "1.5 KB" },
      { label: "Dimensions", value: "640 x 480" },
      { label: "Color", value: "sRGB IEC61966-2.1" },
      { label: "Camera", value: "Pixel 8" },
      { label: "Lens", value: "4.7 mm" },
      { label: "GPS", value: "43.5" },
    ]);
  });
  test("a file without EXIF still lists the file and the blob type", () => {
    expect(
      metadataRows({ fileInfo: null, image: null, blobType: "image/webp", metadata: undefined }),
    ).toEqual([{ label: "Type", value: "image/webp" }]);
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("camera names and sizes read cleanly (W-698)", () => {
  const camera = (make: string, model: string) =>
    metadataRows({
      fileInfo: null,
      image: null,
      metadata: { tiff: { Make: { value: make }, Model: { value: model } } },
    }).find((r) => r.label === "Camera")?.value;

  test("a model that repeats the make shows once", () => {
    expect(camera("Canon", "Canon EOS R5")).toBe("Canon EOS R5");
    expect(camera("NIKON CORPORATION", "NIKON D850")).toBe("NIKON D850");
    expect(camera("Apple ", "iPhone 15 Pro\0")).toBe("Apple iPhone 15 Pro");
  });

  test("a size just under a megabyte reads 1.0 MB", () => {
    expect(formatBytes(1_048_575)).toBe("1.0 MB");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});
