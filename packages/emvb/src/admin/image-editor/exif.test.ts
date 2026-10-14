import { describe, expect, test } from "bun:test";
import { stripJpegGps } from "./exif.ts";

/** A minimal JPEG: SOI, APP1 Exif (IFD0 with Make + GPS pointer, GPS IFD with a rational), EOI. */
function jpegWithGps(le: boolean): ArrayBuffer {
  const tiff = new DataView(new ArrayBuffer(120));
  const u16 = (o: number, v: number) => tiff.setUint16(o, v, le);
  const u32 = (o: number, v: number) => tiff.setUint32(o, v, le);
  u16(0, le ? 0x4949 : 0x4d4d);
  u16(2, 42);
  u32(4, 8);
  // IFD0 at 8: 2 entries, then next-IFD = 0.
  u16(8, 2);
  u16(10, 0x010f); // Make, ASCII, 4 bytes inline "Cam\0"
  u16(12, 2);
  u32(14, 4);
  [0x43, 0x61, 0x6d, 0].forEach((b, i) => tiff.setUint8(18 + i, b));
  u16(22, 0x8825); // GPS pointer, LONG
  u16(24, 4);
  u32(26, 1);
  u32(30, 40);
  u32(34, 0);
  // GPS IFD at 40: 1 entry, latitude (RATIONAL x3 at 60).
  u16(40, 1);
  u16(42, 2);
  u16(44, 5);
  u32(46, 3);
  u32(50, 60);
  u32(54, 0);
  for (let i = 0; i < 6; i++) u32(60 + i * 4, 43 + i);
  const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...new Uint8Array(tiff.buffer)]);
  const len = exif.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...exif, 0xff, 0xd9]).buffer;
}

const tiffView = (bytes: ArrayBuffer) => new DataView(bytes, 12);

describe("stripJpegGps", () => {
  for (const le of [true, false]) {
    test(`removes the GPS IFD and pointer (${le ? "II" : "MM"})`, () => {
      const input = jpegWithGps(le);
      const { bytes, removed } = stripJpegGps(input);
      expect(removed).toBe(true);
      const t = tiffView(bytes);
      expect(t.getUint16(8, le)).toBe(1);
      expect(t.getUint16(10, le)).toBe(0x010f);
      expect(t.getUint32(22, le)).toBe(0); // next-IFD link moved up and still 0
      for (let i = 40; i < 84; i++) expect(t.getUint8(i)).toBe(0);
      expect(bytes.byteLength).toBe(input.byteLength);
      // The input is not mutated.
      expect(tiffView(input).getUint16(8, le)).toBe(2);
    });
  }

  test("leaves non-JPEG and GPS-free data alone", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    expect(stripJpegGps(png).removed).toBe(false);
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
    expect(stripJpegGps(bare).removed).toBe(false);
  });

  test("survives a truncated Exif segment", () => {
    const cut = jpegWithGps(true).slice(0, 30);
    expect(() => stripJpegGps(cut)).not.toThrow();
  });
});
