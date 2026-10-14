/**
 * The Metadata tool (W-486): photocn's `metadata-panel.tsx`
 * (https://github.com/rbbydotdev/photocn, apps/www/src/registry/image-editor), MIT License,
 * Copyright (c) 2026 rbbydotdev: a title with the EXIF status badge, an alert when EXIF can't be
 * read, a rule, then Name, Type, Size, Dimensions, Modified, Format, Color, Captured, Camera,
 * Lens and GPS. Rebuilt with Kumo and EmVB tokens. EmVB adds what a saved copy keeps (D-060): a
 * photo with a location gets a note that JPEG copies drop it and WebP/PNG copies carry no EXIF.
 */
import { Badge } from "@cloudflare/kumo";
import { MapPinIcon } from "@phosphor-icons/react";
import * as React from "react";
import { useImageEditor } from "./engine.ts";

type Tag = { hvalue?: unknown; value?: unknown } | undefined;
type Meta = {
  format?: string;
  icc?: Record<string, unknown>;
  exif?: Record<string, Tag>;
  tiff?: Record<string, Tag>;
  gps?: Record<string, Tag>;
};
type FileInfo = { name?: string; type?: string; size?: number; lastModified?: number };
type Engine = {
  imageInput: {
    fileInfo: FileInfo | null;
    image: HTMLImageElement | null;
    blob: Blob | null;
  };
  exif: { status: string; metadata: unknown; error: unknown };
};

export type MetadataRow = { label: string; value: string };

/** photocn's rows, in its order; empty values are left out. */
export function metadataRows(input: {
  fileInfo: FileInfo | null;
  image: { naturalWidth: number; naturalHeight: number } | null;
  blobType?: string;
  metadata: Meta | undefined;
  displayName?: string;
}): MetadataRow[] {
  const { fileInfo, image, metadata } = input;
  const rows: MetadataRow[] = [];
  add(rows, "Name", input.displayName ?? fileInfo?.name);
  add(rows, "Type", fileInfo?.type || input.blobType);
  add(rows, "Size", fileInfo?.size ? formatBytes(fileInfo.size) : undefined);
  add(rows, "Dimensions", image ? `${image.naturalWidth} x ${image.naturalHeight}` : undefined);
  add(rows, "Modified", fileInfo?.lastModified ? formatDate(fileInfo.lastModified) : undefined);
  add(rows, "Format", metadata?.format);
  add(rows, "Color", colorProfile(metadata?.icc));
  add(rows, "Captured", tagValue(metadata?.exif?.["DateTimeOriginal"]));
  add(rows, "Camera", camera(metadata?.tiff?.["Make"], metadata?.tiff?.["Model"]));
  add(rows, "Lens", tagValue(metadata?.exif?.["LensModel"]));
  add(rows, "GPS", gps(metadata?.gps));
  return rows;
}

function add(rows: MetadataRow[], label: string, value: string | undefined) {
  if (value === undefined || value === "") return;
  rows.push({ label, value });
}

function tagValue(tag: Tag): string | undefined {
  return formatValue(tag?.hvalue ?? tag?.value);
}

function camera(make: Tag, model: Tag): string | undefined {
  const a = tagValue(make);
  const b = tagValue(model);
  if (a && b) return `${a} ${b}`;
  return a ?? b;
}

function gps(tags: Record<string, Tag> | undefined): string | undefined {
  const lon = tagValue(tags?.["GPSLongitude"]);
  const lat = tagValue(tags?.["GPSLatitude"]);
  if (lon && lat) return `${lat}, ${lon}`;
  return lat ?? lon;
}

function colorProfile(icc: Record<string, unknown> | undefined): string | undefined {
  const profile = icc?.["ColorProfile"];
  return formatValue(Array.isArray(profile) ? profile[0] : profile);
}

function formatValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join(", ");
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const formatDate = (value: number) => new Date(value).toLocaleString();

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unable to read metadata.";
}

/** The picture's name as the editor shows it (alt text for storage-key file names). */
export const ImageNameContext = React.createContext<string | undefined>(undefined);

export function MetadataPanel() {
  const displayName = React.useContext(ImageNameContext);
  const editor = useImageEditor();
  const engine = editor.engine as unknown as Engine;
  const { status, error } = engine.exif;
  const metadata = engine.exif.metadata as Meta | undefined;
  const rows = metadataRows({
    fileInfo: engine.imageInput.fileInfo,
    image: engine.imageInput.image,
    blobType: engine.imageInput.blob?.type,
    metadata,
    ...(displayName ? { displayName } : {}),
  });
  const hasGps = rows.some((r) => r.label === "GPS");
  const badge: { text: string; variant: React.ComponentProps<typeof Badge>["variant"] } =
    status === "loading"
      ? { text: "Reading", variant: "outline" }
      : status === "loaded"
        ? { text: "EXIF ready", variant: "secondary" }
        : { text: "File", variant: "outline" };
  return (
    <section aria-label="Metadata" className="emvb-ie-panel" data-emvb-image-panel="metadata">
      <div className="emvb-ie-meta" data-slot="metadata-panel">
        <div className="emvb-ie-meta-head">
          <h2>Metadata</h2>
          <span data-emvb-image-exif={status}>
            <Badge variant={badge.variant}>{badge.text}</Badge>
          </span>
        </div>
        {status === "error" ? (
          <div className="emvb-ie-alert emvb-ie-alert-neutral" role="status">
            <span>{errorText(error)}</span>
          </div>
        ) : null}
        <hr className="emvb-ie-rule" />
        {rows.length ? (
          <table className="emvb-ie-meta-table">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} data-emvb-image-meta={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="emvb-ie-subtle">No image metadata loaded.</p>
        )}
        {hasGps ? (
          <p className="emvb-ie-meta-gps" data-emvb-image-meta-gps="">
            <MapPinIcon aria-hidden="true" />
            <span>
              This photo has a location. A JPEG copy has it removed unless you turn that off when
              saving; WebP and PNG copies keep no camera data.
            </span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
