import { envelopeError, readEnvelope, requestJson, type Fetcher } from "./api.ts";

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
  /** The folder it is filed in; null in the main library. */
  folderId?: string | null;
};

/** An EmDash media folder. Folders are flat: a name, no folders inside. */
export type MediaFolder = { id: string; name: string };

/**
 * Which images a library listing shows: every image, the main library (images in no folder,
 * EmDash's "unfiled"), or one folder by id.
 */
export type MediaScope = "all" | "unfiled" | (string & {});

/** Shared EmDash media endpoint — same path on Node local and Cloudflare R2 (R-007). */
export const MEDIA_API_PATH = "/_emdash/api/media";

/** One page of the library: its images, the cursor of the next page, and how many match. */
export type MediaPage = {
  items: MediaLibraryItem[];
  nextCursor: string | null;
  total: number | null;
};

/** Lists one page of ready images from the EmDash media library, by name when `q` is set. */
export async function listImagePage(
  fetcher: Fetcher,
  opts: { limit?: number; q?: string; cursor?: string; scope?: MediaScope } = {},
): Promise<MediaPage> {
  const params = new URLSearchParams({
    mimeType: "image/",
    limit: String(opts.limit ?? 50),
  });
  if (opts.q) params.set("q", opts.q);
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.scope && opts.scope !== "all") params.set("folderId", opts.scope);
  const response = await fetcher(`${MEDIA_API_PATH}?${params}`);
  const payload = await readEnvelope<{
    items?: MediaLibraryItem[];
    nextCursor?: string | null;
    totalCount?: number;
  }>(response);
  if (!response.ok) throw envelopeError(response, payload);
  return {
    items: (payload.data?.items ?? []).filter((item) => item.status === "ready" || !item.status),
    nextCursor: payload.data?.nextCursor ?? null,
    total: typeof payload.data?.totalCount === "number" ? payload.data.totalCount : null,
  };
}

/** Lists ready images from the EmDash media library (R-007). */
export async function listImages(
  fetcher: Fetcher,
  opts: { limit?: number; q?: string } = {},
): Promise<MediaLibraryItem[]> {
  return (await listImagePage(fetcher, opts)).items;
}

export const MEDIA_FOLDERS_PATH = `${MEDIA_API_PATH}/folders`;
/** Stops a folder cursor that never ends: 2000 folders. */
const FOLDER_PAGES = 20;

/** Every media folder, by name. */
export async function listFolders(fetcher: Fetcher): Promise<MediaFolder[]> {
  const folders: MediaFolder[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < FOLDER_PAGES; page += 1) {
    const query = `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    // oxlint-disable-next-line no-await-in-loop -- each page needs the previous page's cursor
    const body = await requestJson<{ items?: MediaFolder[]; nextCursor?: string }>(
      fetcher,
      `${MEDIA_FOLDERS_PATH}${query}`,
    );
    folders.push(...(body?.items ?? []));
    cursor = body?.nextCursor || undefined;
    if (!cursor) break;
  }
  return folders.toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Makes a media folder. */
export async function createFolder(fetcher: Fetcher, name: string): Promise<MediaFolder> {
  const body = await requestJson<{ item?: MediaFolder }>(fetcher, MEDIA_FOLDERS_PATH, {
    method: "POST",
    body: { name },
  });
  if (!body?.item) throw new Error("The folder wasn't made.");
  return body.item;
}

/** Files an image in a folder, or back in the main library (null). */
export async function moveImage(
  fetcher: Fetcher,
  id: string,
  folderId: string | null,
): Promise<void> {
  await requestJson(fetcher, `${MEDIA_API_PATH}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { folderId },
  });
}

/** A picked file's pixel size, sent with the upload so the library knows it. */
export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.addEventListener("load", () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    });
    img.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read image dimensions."));
    });
    img.src = url;
  });
}

/**
 * Uploads a file through EmDash's multipart media endpoint. Same path on Node (local disk)
 * and Cloudflare (R2) — the host storage adapter differs, not this client (R-007).
 */
export async function uploadImage(
  fetcher: Fetcher,
  file: File,
  meta: { width?: number; height?: number; alt?: string; folderId?: string } = {},
): Promise<MediaLibraryItem> {
  const body = new FormData();
  body.set("file", file, file.name);
  if (meta.width !== undefined) body.set("width", String(meta.width));
  if (meta.height !== undefined) body.set("height", String(meta.height));
  if (meta.alt) body.set("alt", meta.alt);
  if (meta.folderId) body.set("folderId", meta.folderId);
  const response = await fetcher(MEDIA_API_PATH, { method: "POST", body });
  const payload = await readEnvelope<{ item?: MediaLibraryItem; deduplicated?: boolean }>(response);
  if (!response.ok || !payload.data?.item) throw envelopeError(response, payload);
  return payload.data.item;
}

/** Applies a library item onto an image node's props (id, URL, alt, dimensions). */
export function propsFromMedia(
  current: Record<string, unknown>,
  item: MediaLibraryItem,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, src: item.url, mediaId: item.id };
  if (item.width) next.width = item.width;
  if (item.height) next.height = item.height;
  const alt = current.alt;
  if ((!alt || alt === "Image") && item.alt) next.alt = item.alt;
  else if (!alt || alt === "Image") next.alt = item.filename.replace(/\.[^.]+$/, "") || "Image";
  return next;
}
