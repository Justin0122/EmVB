/** One EmDash content row, as list and get return it. Pages add `seo`; theme parts omit it. */
export type ContentItem = {
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

/** The stored title, or `fallback` when it is missing or blank. */
export function titleOf(item: ContentItem, fallback: string): string {
  const title = item.data?.["title"];
  return typeof title === "string" && title.trim() ? title : fallback;
}
