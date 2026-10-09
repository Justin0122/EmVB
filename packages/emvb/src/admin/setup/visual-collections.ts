import { ENTRY_LAYOUT_FIELD, isEmvbCollection } from "../../constants.ts";
import { listAllItems, requestJson, type Fetcher } from "../api.ts";
import { entryStatus } from "../entry-status.ts";
import type { PageSummary } from "../content-api.ts";
import { readCollection } from "./run.ts";
import { LAYOUT_WIDGET, type FieldSpec } from "./spec.ts";

const BASE = "/_emdash/api/schema/collections";

/**
 * W-307: the field "Edit visually" adds to a collection. Each entry then has its own layout,
 * edited in the EmVB editor; the entry's other fields stay in EmDash's editor.
 */
const ENTRY_LAYOUT_FIELD_SPEC: FieldSpec = {
  slug: ENTRY_LAYOUT_FIELD,
  label: "Visual layout",
  type: "json",
  widget: LAYOUT_WIDGET,
  validation: null,
};

export type CollectionSummary = {
  slug: string;
  label: string;
  labelSingular: string;
  hidden: boolean;
  urlPattern: string | null;
};

type RawCollection = {
  slug: string;
  label?: string;
  labelSingular?: string;
  hidden?: boolean;
  urlPattern?: string | null;
};

type RawField = { slug: string; widget?: string | null };

/** True when the collection has EmVB's layout field, with EmVB's widget. */
const isVisualCollection = (fields: readonly RawField[]) =>
  fields.some((field) => field.slug === ENTRY_LAYOUT_FIELD && field.widget === LAYOUT_WIDGET);

/** Collections "Edit visually" may be turned on for: the site's own, visible ones. */
const canBeVisual = (collection: { slug: string; hidden?: boolean }) =>
  !isEmvbCollection(collection.slug) && collection.hidden !== true;

/** The site's collections split into those already edited visually and those that could be. */
export async function listVisualCollections(
  fetcher: Fetcher,
): Promise<{ visual: CollectionSummary[]; available: CollectionSummary[] }> {
  const body = await requestJson<{ items: RawCollection[] }>(fetcher, BASE);
  const candidates = (body.items ?? []).filter(canBeVisual);
  const states = await Promise.all(candidates.map((c) => readCollection(fetcher, c.slug)));
  const visual: CollectionSummary[] = [];
  const available: CollectionSummary[] = [];
  candidates.forEach((raw, index) => {
    const summary: CollectionSummary = {
      slug: raw.slug,
      label: raw.label || raw.slug,
      labelSingular: raw.labelSingular || raw.label || raw.slug,
      hidden: raw.hidden === true,
      urlPattern: raw.urlPattern ?? null,
    };
    (isVisualCollection(states[index]?.fields ?? []) ? visual : available).push(summary);
  });
  return { visual, available };
}

/** Adds the `emvb_layout` field, so every entry of the collection can be edited visually. */
export async function enableVisualEditing(fetcher: Fetcher, collection: string): Promise<void> {
  await requestJson(fetcher, `${BASE}/${encodeURIComponent(collection)}/fields`, {
    method: "POST",
    body: ENTRY_LAYOUT_FIELD_SPEC,
  });
}

type RawItem = {
  id: string;
  slug?: string | null;
  status?: string;
  draftRevisionId?: string | null;
  updatedAt?: string;
  data?: Record<string, unknown>;
};

/** An entry's name for the list: its title, else a name or label field, else its slug. */
function entryTitle(item: RawItem): string {
  for (const key of ["title", "name", "label"]) {
    const value = item.data?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return item.slug || "Untitled entry";
}

/** A visual collection's entries, newest first, as the Visual pages list shows them. */
export async function listEntries(fetcher: Fetcher, collection: string): Promise<PageSummary[]> {
  const items = await listAllItems<RawItem>(
    fetcher,
    `/_emdash/api/content/${encodeURIComponent(collection)}`,
  );
  return items.map((item) => ({
    id: item.id,
    title: entryTitle(item),
    slug: item.slug ?? "",
    status: entryStatus(item),
    updatedAt: item.updatedAt ?? "",
  }));
}
