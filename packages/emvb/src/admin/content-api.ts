import type {
  ConditionsDoc,
  DesignSystem,
  FloatSettings,
  Layout,
  ThemePartType,
  TriggersDoc,
} from "../core/index.ts";
import { ENTRY_LAYOUT_FIELD, PAGES_COLLECTION, PLUGIN_ID } from "../constants.ts";
import { listAllItems, requestJson, type Fetcher } from "./api.ts";
import { entryStatus } from "./entry-status.ts";

const CONTENT = `/_emdash/api/content/${PAGES_COLLECTION}`;
/** The content API path of `collection` (W-307: the editor also opens other collections' entries). */
const collectionPath = (collection: string) =>
  `/_emdash/api/content/${encodeURIComponent(collection)}`;

type RawItem = {
  id: string;
  slug?: string | null;
  status?: string;
  draftRevisionId?: string | null;
  updatedAt?: string;
  data?: Record<string, unknown>;
  seo?: {
    title?: string | null;
    description?: string | null;
    canonical?: string | null;
    noIndex?: boolean | null;
    image?: string | null;
  } | null;
};

export type PageSummary = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string;
};

const titleOf = (item: RawItem) =>
  typeof item.data?.["title"] === "string" && item.data["title"]
    ? item.data["title"]
    : "Untitled page";

export async function listPages(fetcher: Fetcher): Promise<PageSummary[]> {
  const items = await listAllItems<RawItem>(fetcher, CONTENT);
  return items.map((item) => ({
    id: item.id,
    title: titleOf(item),
    slug: item.slug ?? "",
    status: entryStatus(item),
    updatedAt: item.updatedAt ?? "",
  }));
}

export async function createPage(
  fetcher: Fetcher,
  input: { title: string; slug: string; layout: Layout },
): Promise<string> {
  const body = await requestJson<{ item: RawItem }>(fetcher, CONTENT, {
    method: "POST",
    body: { data: { title: input.title, layout: input.layout }, slug: input.slug },
  });
  return body.item.id;
}

export type PageDraft = {
  title: string;
  slug: string;
  canvasMode: string;
  seoTitle: string;
  seoDescription: string;
  /** W-284: absolute http(s) URL, or "" for none. Absent = leave the saved value alone. */
  seoCanonical?: string;
  /** W-284: ask search engines not to index the page. Absent = leave the saved value alone. */
  seoNoIndex?: boolean;
  /**
   * W-287: social (OG) image as EmDash reads it: an absolute URL or a site path (the media
   * library's `/_emdash/api/media/file/…`); "" for none. Absent = leave the saved value alone.
   */
  seoImage?: string;
  layout: Layout | null;
  /** Theme parts only (emvb_theme_parts). */
  partType?: ThemePartType;
  conditions?: ConditionsDoc;
  /** Popups only — open triggers + thin advanced rules. */
  triggers?: TriggersDoc;
  /** Floats only — edge and whether a close button is offered. */
  float?: FloatSettings;
  /**
   * W-307: entries of other collections only. Whether the entry has a `title` field, so a save
   * sends the title only when there is one to write.
   */
  entryHasTitle?: boolean;
};

/**
 * W-284: EmDash accepts only an absolute http(s) canonical URL (or null) and refuses the whole
 * save otherwise, so the panel flags anything else and the save leaves the stored one alone.
 */
export function canonicalProblem(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" || url.protocol === "http:") return null;
  } catch {
    // fall through
  }
  return "Not saved: use a full address starting with https://";
}

function seoBody(draft: PageDraft) {
  const canonical = draft.seoCanonical;
  return {
    title: draft.seoTitle || null,
    description: draft.seoDescription || null,
    ...(canonical !== undefined && !canonicalProblem(canonical)
      ? { canonical: canonical.trim() || null }
      : {}),
    ...(draft.seoNoIndex !== undefined ? { noIndex: draft.seoNoIndex } : {}),
    ...(draft.seoImage !== undefined ? { image: draft.seoImage.trim() || null } : {}),
  };
}

/**
 * The save body. A Visual page sends its title, layout, canvas mode, slug and SEO. An entry of
 * another collection (W-307) sends only its layout, plus its title and slug: EmDash keeps the
 * fields a save leaves out, and the entry's other fields and SEO belong to EmDash's own editor.
 */
function saveBody(draft: PageDraft, rev: string | null, collection: string = PAGES_COLLECTION) {
  if (collection !== PAGES_COLLECTION) {
    return {
      data: {
        [ENTRY_LAYOUT_FIELD]: draft.layout,
        ...(draft.entryHasTitle ? { title: draft.title } : {}),
      },
      ...(draft.slug ? { slug: draft.slug } : {}),
      ...(rev ? { _rev: rev } : {}),
    };
  }
  return {
    data: { title: draft.title, layout: draft.layout, canvas_mode: draft.canvasMode },
    slug: draft.slug,
    seo: seoBody(draft),
    ...(rev ? { _rev: rev } : {}),
  };
}

/** Saves the draft with `_rev`, so a concurrent change fails with 409 instead of being overwritten. */
export async function savePage(
  fetcher: Fetcher,
  id: string,
  draft: PageDraft,
  rev: string | null,
  collection: string = PAGES_COLLECTION,
): Promise<string> {
  const body = await requestJson<{ _rev: string }>(
    fetcher,
    `${collectionPath(collection)}/${encodeURIComponent(id)}`,
    { method: "PUT", body: saveBody(draft, rev, collection) },
  );
  return body["_rev"];
}

/** Publishes entry `id` of the collection at `contentPath`, sending `rev` so a stale draft fails. */
export async function publishEntry(
  fetcher: Fetcher,
  contentPath: string,
  id: string,
  rev: string | null,
) {
  const body = await requestJson<{ _rev: string; item: { slug?: string | null } }>(
    fetcher,
    `${contentPath}/${encodeURIComponent(id)}/publish`,
    { method: "POST", body: rev ? { _rev: rev } : {} },
  );
  return { rev: body["_rev"], slug: body.item.slug ?? "" };
}

/**
 * Drops the saved draft of entry `id` so it is back to its published version (W-193). EmDash's
 * `discard-draft` checks `rev`, so a draft saved elsewhere meanwhile fails with 409.
 */
export async function discardDraft(
  fetcher: Fetcher,
  collection: string,
  id: string,
  rev: string | null,
): Promise<void> {
  await requestJson<unknown>(
    fetcher,
    `/_emdash/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/discard-draft`,
    { method: "POST", body: rev === null ? {} : { _rev: rev } },
  );
}

export const publishPage = (
  fetcher: Fetcher,
  id: string,
  rev: string | null,
  collection: string = PAGES_COLLECTION,
) => publishEntry(fetcher, collectionPath(collection), id, rev);

export async function previewUrl(
  fetcher: Fetcher,
  id: string,
  collection: string = PAGES_COLLECTION,
): Promise<string> {
  const body = await requestJson<{ url: string }>(
    fetcher,
    `${collectionPath(collection)}/${encodeURIComponent(id)}/preview-url`,
    { method: "POST", body: {} },
  );
  return body.url;
}

export async function saveDesign(
  fetcher: Fetcher,
  design: DesignSystem,
  revision: string | null,
): Promise<string> {
  const body = await requestJson<{ revision: string }>(
    fetcher,
    `/_emdash/api/plugins/${PLUGIN_ID}/design/save`,
    { method: "POST", body: { design, revision } },
  );
  return body.revision;
}

export async function publishDesign(
  fetcher: Fetcher,
  publishedRevision: string | null,
): Promise<string> {
  const body = await requestJson<{ revision: string }>(
    fetcher,
    `/_emdash/api/plugins/${PLUGIN_ID}/design/publish`,
    { method: "POST", body: { publishedRevision } },
  );
  return body.revision;
}
