import { envelopeError, readEnvelope, type Fetcher } from "./api.ts";

/** A library item as EmDash returns it from GET/POST /_emdash/api/media (with `url`). */
export type MediaLibraryItem = {
  id: string;
  filename: string;
  mimeType: string;
  size: number | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  storageKey: string;
  status: string;
  url: string;
};

/** Shared EmDash media endpoint — same path on Node local and Cloudflare R2 (R-007). */
export const MEDIA_API_PATH = "/_emdash/api/media";

/** Lists ready images from the EmDash media library (R-007). */
export async function listImages(
  fetcher: Fetcher,
  opts: { limit?: number; q?: string } = {},
): Promise<MediaLibraryItem[]> {
  const params = new URLSearchParams({
    mimeType: "image/",
    limit: String(opts.limit ?? 50),
  });
  if (opts.q) params.set("q", opts.q);
  const response = await fetcher(`${MEDIA_API_PATH}?${params}`);
  const payload = await readEnvelope<{ items?: MediaLibraryItem[] }>(response);
  if (!response.ok) throw envelopeError(response, payload);
  return (payload.data?.items ?? []).filter((item) => item.status === "ready" || !item.status);
}

/**
 * Uploads a file through EmDash's multipart media endpoint. Same path on Node (local disk)
 * and Cloudflare (R2) — the host storage adapter differs, not this client (R-007).
 */
export async function uploadImage(
  fetcher: Fetcher,
  file: File,
  meta: { width?: number; height?: number; alt?: string } = {},
): Promise<MediaLibraryItem> {
  const body = new FormData();
  body.set("file", file, file.name);
  if (meta.width !== undefined) body.set("width", String(meta.width));
  if (meta.height !== undefined) body.set("height", String(meta.height));
  if (meta.alt) body.set("alt", meta.alt);
  const response = await fetcher(MEDIA_API_PATH, { method: "POST", body });
  const payload = await readEnvelope<{ item?: MediaLibraryItem; deduplicated?: boolean }>(response);
  if (!response.ok || !payload.data?.item) throw envelopeError(response, payload);
  return payload.data.item;
}

/** Applies a pasted URL onto an image node's props; the URL is already sanitized. */
export function propsFromUrl(
  current: Record<string, unknown>,
  src: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, src };
  delete next.mediaId;
  if (current.src === src) return next;
  // W-422: a different picture drops the old one's extra sizes.
  delete next.sources;
  // W-482: an image-editor record describes the old picture; kept, re-opening would edit it.
  delete next.edit;
  // W-425: a library image's width and height describe that file, not the pasted one.
  if (current.mediaId) {
    delete next.width;
    delete next.height;
  }
  return next;
}

/** Applies a library item onto an image node's props (id, URL, alt, dimensions). */
export function propsFromMedia(
  current: Record<string, unknown>,
  item: MediaLibraryItem,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, src: item.url, mediaId: item.id };
  // W-422: extra sizes belong to the old picture; kept, the browser could still show it.
  if (current.src !== item.url) {
    delete next.sources;
    // W-482: the image-editor record belongs to the old picture.
    delete next.edit;
  }
  if (item.width) next.width = item.width;
  if (item.height) next.height = item.height;
  const alt = current.alt;
  if ((!alt || alt === "Image") && item.alt) next.alt = item.alt;
  else if (!alt || alt === "Image") next.alt = item.filename.replace(/\.[^.]+$/, "") || "Image";
  return next;
}

/** One library item by id (EmDash GET /_emdash/api/media/:id); null when it is gone. */
export async function getMedia(fetcher: Fetcher, id: string): Promise<MediaLibraryItem | null> {
  const response = await fetcher(`${MEDIA_API_PATH}/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  const payload = await readEnvelope<{ item?: MediaLibraryItem } & Partial<MediaLibraryItem>>(
    response,
  );
  if (!response.ok) throw envelopeError(response, payload);
  const data = payload.data;
  const item = data?.item ?? (data?.id ? (data as MediaLibraryItem) : null);
  if (!item) return null;
  // GET by id has no `url` (only the list adds it); build the same file path.
  return item.url ? item : { ...item, url: `${MEDIA_API_PATH}/file/${item.storageKey}` };
}

/**
 * An edited copy replaces the picture (W-485): the new file's id, URL and size, plus the edit
 * record. Extra sizes belonged to the old file, so they go; alt and the rest stay.
 */
export function propsFromEdited(
  current: Record<string, unknown>,
  item: Pick<MediaLibraryItem, "id" | "url" | "width" | "height">,
  edit: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, src: item.url, edit };
  next.mediaId = item.id;
  delete next.sources;
  if (item.width) next.width = item.width;
  if (item.height) next.height = item.height;
  return next;
}

/**
 * "Reset to original" (W-485): back to the untouched file. The edited copy stays in the library.
 * Without the library item (deleted, or no id) the recorded URL is used and the size is dropped.
 */
export function propsFromOriginal(
  current: Record<string, unknown>,
  original: Pick<MediaLibraryItem, "id" | "url" | "width" | "height"> | null,
): Record<string, unknown> | null {
  const edit = current.edit as { originalSrc?: unknown } | undefined;
  const originalSrc = typeof edit?.originalSrc === "string" ? edit.originalSrc : "";
  if (!original && !originalSrc) return null;
  const next: Record<string, unknown> = { ...current };
  delete next.edit;
  delete next.sources;
  if (original) {
    next.src = original.url || originalSrc;
    next.mediaId = original.id;
    if (original.width) next.width = original.width;
    else delete next.width;
    if (original.height) next.height = original.height;
    else delete next.height;
  } else {
    next.src = originalSrc;
    delete next.mediaId;
    delete next.width;
    delete next.height;
  }
  return next;
}
