import { decodeSlug, getEmDashEntry, getRequestContext } from "emdash";
import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";
import { ENTRY_LAYOUT_FIELD, PAGES_COLLECTION } from "../constants.ts";
import { loadCollectionLoops } from "./collection-loops.ts";
import { formIdsInLayout, loadFormDefinitions } from "./forms-definitions.ts";
import { loadDesign, readLayout, renderStored, type RenderedPage } from "./render.ts";
import { componentLayouts, componentTemplatesFor, sectionTemplatesFor } from "./resolve-theme.ts";

type EmDashEntry = NonNullable<Awaited<ReturnType<typeof getEmDashEntry>>["entry"]>;

export type ResolvedEmVBPage = RenderedPage & {
  /** The EmDash entry, for `getSeoMeta` and the host's layout. */
  entry: EmDashEntry;
  title: string;
  canvasMode: "site-layout" | "blank";
  /** A valid `_preview` token is serving the draft: don't cache the response. */
  isPreview: boolean;
};

type AstroLike = {
  params: Record<string, string | undefined>;
  url: URL;
  locals: unknown;
};

/**
 * Looks up the published EmVB page for this request's slug (or its draft under a preview token),
 * so a host route can try EmVB first and fall through to its own content (R-030, R-052).
 */
/**
 * W-329: the pages above this one, after Home, for the Breadcrumbs element; the page's own title
 * ends the trail. Leave it out for a page right under Home.
 */
export type BreadcrumbTrail = { label: string; href: string }[];

export async function resolveEmVBPage(
  astro: AstroLike,
  options: { param?: string; breadcrumbs?: BreadcrumbTrail } = {},
): Promise<ResolvedEmVBPage | null> {
  const slug = decodeSlug(astro.params[options.param ?? "slug"]);
  if (!slug) return null;
  // No emvb_pages collection yet (EmVB not set up): not an EmVB page.
  return renderEntry(astro, PAGES_COLLECTION, slug, "layout", true, options.breadcrumbs);
}

/**
 * W-307: the visual layout of an entry in any EmDash collection that has an `emvb_layout`
 * field ("Edit visually"), for host routes such as `/news/[slug]`. Null when there is no such
 * entry, or when it has no layout yet, so the route can fall back to its own template.
 */
export async function resolveEmVBEntry(
  astro: AstroLike,
  collection: string,
  options: { slug?: string; param?: string; breadcrumbs?: BreadcrumbTrail } = {},
): Promise<ResolvedEmVBPage | null> {
  const slug = options.slug ?? decodeSlug(astro.params[options.param ?? "slug"]);
  if (!slug) return null;
  return renderEntry(astro, collection, slug, ENTRY_LAYOUT_FIELD, false, options.breadcrumbs);
}

async function renderEntry(
  astro: AstroLike,
  collection: string,
  slug: string,
  layoutField: string,
  emptyIsPage: boolean,
  breadcrumbs: BreadcrumbTrail = [],
): Promise<ResolvedEmVBPage | null> {
  let found: Awaited<ReturnType<typeof getEmDashEntry>>;
  try {
    found = await getEmDashEntry(collection, slug);
  } catch {
    return null;
  }
  const entry = found.entry;
  if (!entry) return null;
  const data = entry.data as Record<string, unknown>;
  const stored = data[layoutField];
  const layout = readLayout(stored);
  // An entry without a layout isn't visual yet; an empty Visual page still is one (R-030).
  if (!layout && !emptyIsPage) return null;
  const handler = getPublicPluginApiRouteHandler(astro.locals as never);
  const design = await loadDesign(handler, astro.url);
  const formDefinitions = layout
    ? await loadFormDefinitions(handler, astro.url, formIdsInLayout(layout))
    : undefined;
  const sectionTemplates = layout ? await sectionTemplatesFor(layout) : {};
  // W-312: components on the page or in its synced sections.
  const componentTemplates = await componentTemplatesFor([
    layout,
    ...Object.values(sectionTemplates),
  ]);
  // W-308: collection Loops on the page, in its synced sections or in its components.
  const collectionLoops = await loadCollectionLoops(
    [layout, ...Object.values(sectionTemplates), ...componentLayouts(componentTemplates)],
    componentTemplates,
  );
  const title = typeof data["title"] === "string" ? data["title"] : "";
  const dynamic = {
    // W-329: Home, the host's trail, then this page.
    ...(title ? { breadcrumbs: { trail: breadcrumbs, current: title } } : {}),
    ...(Object.keys(sectionTemplates).length > 0 ? { sectionTemplates } : {}),
    ...(Object.keys(componentTemplates).length > 0 ? { componentTemplates } : {}),
    ...(Object.keys(collectionLoops).length > 0 ? { collectionLoops } : {}),
  };
  // W-325: EmDash's edit mode (its cookie, for a signed-in editor) marks the texts for editing.
  const inlineEdit = getRequestContext()?.editMode === true;
  const id = String(data["id"] ?? slug);
  return {
    ...renderStored(
      stored,
      design,
      id,
      formDefinitions,
      Object.keys(dynamic).length > 0 ? dynamic : undefined,
      inlineEdit,
    ),
    ...(inlineEdit ? { inlineEdit: { collection, id, field: layoutField } } : {}),
    entry,
    title,
    canvasMode: data["canvas_mode"] === "blank" ? "blank" : "site-layout",
    isPreview: Boolean(found.isPreview),
  };
}
