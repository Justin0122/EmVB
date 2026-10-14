/**
 * GPS stripping for exported JPEGs (D-060).
 *
 * photocn copies the source EXIF block into JPEG exports
 * (`preserveExif`, default on) and keeps GPS. We remove the GPS IFD
 * pointer (tag 0x8825) and zero its IFD so no location survives, while
 * keeping orientation, camera and date tags. WebP/PNG exports carry no
 * EXIF from photocn, so only JPEG needs this.
 */

const GPS_POINTER = 0x8825;

/** Returns a copy of the JPEG with GPS removed, and whether any was found. */
export function stripJpegGps(input: ArrayBuffer): { bytes: ArrayBuffer; removed: boolean } {
  const out = input.slice(0);
  const view = new DataView(out);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return { bytes: out, removed: false };
  let offset = 2;
  let removed = false;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end
    const size = view.getUint16(offset + 2);
    if (size < 2) break;
    const start = offset + 4;
    const end = Math.min(offset + 2 + size, view.byteLength);
    if (marker === 0xe1 && end - start >= 6 && readAscii(view, start, 6) === "Exif\0\0") {
      removed = stripTiffGps(view, start + 6, end) || removed;
    }
    offset = offset + 2 + size;
  }
  return { bytes: out, removed };
}

function stripTiffGps(view: DataView, tiff: number, end: number): boolean {
  if (tiff + 8 > end) return false;
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return false;
  const le = order === 0x4949;
  const ifd0 = tiff + view.getUint32(tiff + 4, le);
  if (ifd0 + 2 > end) return false;
  const count = view.getUint16(ifd0, le);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > end) return false;
    if (view.getUint16(entry, le) !== GPS_POINTER) continue;
    const gps = tiff + view.getUint32(entry + 8, le);
    wipeIfd(view, gps, tiff, end, le);
    // Drop the pointer entry; the entries after it and the next-IFD link move up 12 bytes.
    const last = ifd0 + 2 + count * 12 + 4;
    if (last > end) return false;
    const bytes = new Uint8Array(view.buffer, view.byteOffset);
    bytes.copyWithin(entry, entry + 12, last);
    bytes.fill(0, last - 12, last);
    view.setUint16(ifd0, count - 1, le);
    return true;
  }
  return false;
}

function wipeIfd(view: DataView, ifd: number, tiff: number, end: number, le: boolean): void {
  if (ifd + 2 > end) return;
  const count = view.getUint16(ifd, le);
  const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    const bytes = (sizes[view.getUint16(entry + 2, le)] ?? 1) * view.getUint32(entry + 4, le);
    if (bytes > 4) {
      const at = tiff + view.getUint32(entry + 8, le);
      for (let p = at; p < at + bytes && p < end; p++) view.setUint8(p, 0);
    }
  }
  for (let p = ifd; p < ifd + 2 + count * 12 + 4 && p < end; p++) view.setUint8(p, 0);
}

function readAscii(view: DataView, at: number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(at + i));
  return s;
}
