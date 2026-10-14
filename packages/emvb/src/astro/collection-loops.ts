import { getCollectionInfo, getEmDashCollection } from "emdash";
import {
  collectLoopQueries,
  type ComponentTemplate,
  loopQueryKey,
  type Layout,
  type LoopQuery,
  pinEntries,
  type ThemePostFields,
} from "../core/index.ts";
import { themePostFromEntry } from "./theme-posts.ts";

const ORDER_BY: Record<LoopQuery["order"], Record<string, "asc" | "desc">> = {
  newest: { published_at: "desc" },
  oldest: { published_at: "asc" },
  title: { title: "asc" },
};

/** An entry's public path from its collection's URL pattern, else `/<collection>/<slug>`. */
export function entryPermalink(
  collection: string,
  urlPattern: string | null | undefined,
  slug: string,
) {
  const path = urlPattern?.includes("{slug}")
    ? urlPattern.replace("{slug}", encodeURIComponent(slug))
    : `/${collection}/${encodeURIComponent(slug)}`;
  return path.startsWith("/") ? path : `/${path}`;
}

async function loadQuery(query: LoopQuery): Promise<ThemePostFields[]> {
  try {
    const [info, result] = await Promise.all([
      getCollectionInfo(query.collection).catch(() => null),
      getEmDashCollection(query.collection, {
        orderBy: ORDER_BY[query.order],
        // W-334: room for the pinned entries beyond the limit, which pinEntries cuts back to.
        limit: query.limit + (query.pinned?.length ?? 0),
        // W-318: EmDash filters by a taxonomy's term slugs when the key names a taxonomy.
        ...(query.taxonomy && query.terms?.length
          ? { where: { [query.taxonomy]: query.terms } }
          : {}),
      }),
    ]);
    const urlPattern = (info as { urlPattern?: string | null } | null)?.urlPattern;
    const items: ThemePostFields[] = [];
    for (const entry of result.entries ?? []) {
      const post = themePostFromEntry(entry as never);
      if (post)
        items.push({ ...post, permalink: entryPermalink(query.collection, urlPattern, post.slug) });
    }
    return pinEntries(items, query.pinned, query.limit);
  } catch {
    // A collection that doesn't exist (any more) lists nothing instead of failing the page.
    return [];
  }
}

/**
 * W-308: the entries every collection Loop in these layouts asks for, keyed by `loopQueryKey`.
 * Loops with the same query share one load. Loops in component uses count as each use fills them
 * in (W-318).
 */
export async function loadCollectionLoops(
  layouts: readonly (Layout | null | undefined)[],
  componentTemplates?: Readonly<Record<string, ComponentTemplate>>,
): Promise<Record<string, ThemePostFields[]>> {
  const queries = collectLoopQueries(layouts, componentTemplates);
  const loaded = await Promise.all(queries.map(loadQuery));
  return Object.fromEntries(queries.map((query, i) => [loopQueryKey(query), loaded[i] ?? []]));
}
