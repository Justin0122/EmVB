import type { ThemePostFields } from "../core/index.ts";

type MediaLike = {
  src?: unknown;
  url?: unknown;
  previewUrl?: unknown;
  alt?: unknown;
  meta?: { storageKey?: unknown } | null;
};

/** A storage key as EmDash's upload pipeline makes them (`{ulid}{ext}`); nothing that can reroute. */
const STORAGE_KEY = /^[A-Za-z0-9._-]+$/;

/** Pull a sanitized-ready image URL + alt from an EmDash media / image field value. */
export function mediaFieldsFrom(value: unknown): {
  featuredImageUrl?: string;
  featuredImageAlt?: string;
} {
  if (!value || typeof value !== "object") return {};
  const media = value as MediaLike;
  // W-313: EmDash stores a local image as its id and `meta.storageKey`, without a URL; its file
  // route serves it at /_emdash/api/media/file/<storage key>.
  const key = media.meta?.storageKey;
  const local =
    typeof key === "string" && STORAGE_KEY.test(key) ? `/_emdash/api/media/file/${key}` : undefined;
  const candidates = [media.src, media.url, media.previewUrl, local];
  let featuredImageUrl: string | undefined;
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      featuredImageUrl = candidate.trim();
      break;
    }
  }
  const featuredImageAlt =
    typeof media.alt === "string" && media.alt.trim() ? media.alt.trim() : undefined;
  return { featuredImageUrl, featuredImageAlt };
}

/**
 * An entry timestamp as an ISO string (W-302). EmDash hands system dates (`updatedAt`,
 * `publishedAt`) to templates as `Date` objects, so `String()` gave "Sun Sep 06 2026 …".
 */
export function entryTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Normalize an EmDash posts collection entry (or plain data bag) into ThemePostFields.
 * Permalink defaults to `/posts/{slug}` to match the demo routes.
 */
export function themePostFromEntry(
  entry: { id?: string; data?: Record<string, unknown> } | Record<string, unknown>,
  options: { permalinkPrefix?: string } = {},
): ThemePostFields | null {
  const data =
    "data" in entry && entry.data && typeof entry.data === "object"
      ? (entry.data as Record<string, unknown>)
      : (entry as Record<string, unknown>);
  const id = String(data["id"] ?? ("id" in entry ? entry.id : "") ?? "");
  const slug = typeof data["slug"] === "string" ? data["slug"] : id;
  if (!slug && !id) return null;
  const title = typeof data["title"] === "string" ? data["title"] : "";
  const excerpt = typeof data["excerpt"] === "string" ? data["excerpt"] : "";
  const content = data["content"] ?? "";
  const prefix = options.permalinkPrefix ?? "/posts";
  const permalink = `${prefix.replace(/\/$/, "")}/${slug || id}`;
  const media = mediaFieldsFrom(data["featured_image"]);
  // W-303: EmDash's own publish date is `data.publishedAt`, a `Date`; a custom field may be text.
  const publishedAt = ["published_at", "publishedAt", "date"]
    .map((key) => entryTimestamp(data[key]))
    .find(Boolean);
  const authorName = authorFrom(data);
  const fields = textFieldsOf(data);
  return {
    id: id || slug,
    slug: slug || id,
    title,
    excerpt,
    content,
    permalink,
    ...(publishedAt ? { publishedAt } : {}),
    ...(authorName ? { authorName } : {}),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    ...media,
  };
}

const MAX_FIELDS = 100;
const MAX_FIELD_LENGTH = 5000;

/** W-338: an entry's text and number fields by name, for Post Field. */
function textFieldsOf(data: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of Object.keys(data).slice(0, MAX_FIELDS)) {
    const value = data[key];
    if (typeof value === "string" && value.trim())
      fields[key] = value.trim().slice(0, MAX_FIELD_LENGTH);
    else if (typeof value === "number" && Number.isFinite(value)) fields[key] = String(value);
  }
  return fields;
}

function firstString(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function authorFrom(data: Record<string, unknown>): string | undefined {
  const direct = firstString(data, ["author_name", "authorName"]);
  if (direct) return direct;
  const author = data["author"];
  if (typeof author === "string" && author.trim()) return author.trim();
  if (author && typeof author === "object" && "name" in author) {
    const name = (author as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  // W-304: EmDash hydrates the primary byline onto `data.byline` (a BylineSummary).
  const byline = data["byline"];
  if (byline && typeof byline === "object" && "displayName" in byline) {
    const name = (byline as { displayName?: unknown }).displayName;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return undefined;
}
