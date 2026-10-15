import type {
  CardOverride,
  CardOverrides,
  Layout,
  LayoutNode,
  LoopNode,
  LoopOrder,
} from "../schema/layout.ts";
import { isParentNode } from "../schema/layout.ts";
import { applyComponent, type ComponentTemplate } from "./component.ts";

/** W-308: entries a collection Loop shows when it sets no limit. */
export const DEFAULT_LOOP_LIMIT = 6;

/** W-318: most terms one Loop filters on. */
const MAX_LOOP_TERMS = 20;

/** W-334: most entries one Loop pins. */
const MAX_LOOP_PINS = 50;

/** Components inside components a query walk follows, like the renderer's limit. */
const MAX_COMPONENT_DEPTH = 6;

/**
 * What a collection Loop asks for: one load per distinct query, shared by Loops that match.
 * W-318: `taxonomy` and `terms` keep only entries with one of those terms. W-334: `pinned` entry
 * slugs come first, in that order. W-339: `first` entry ids come before those, by hand; `hidden`
 * entry ids are left out (the Loop still fills its limit with the next ones).
 */
export type LoopQuery = {
  collection: string;
  limit: number;
  order: LoopOrder;
  taxonomy?: string;
  terms?: string[];
  pinned?: string[];
  first?: string[];
  hidden?: string[];
};

/** The slugs of a comma-separated list, trimmed, without blanks or repeats, at most `max`. */
function slugList(raw: string | undefined, max: number): string[] {
  const slugs = (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return [...new Set(slugs)].slice(0, max);
}

/** The query of a Loop that lists a collection, or null for an archive Loop. */
export function loopQueryOf(node: LoopNode): LoopQuery | null {
  const collection = node.props.collection?.trim();
  if (!collection) return null;
  const query: LoopQuery = {
    collection,
    limit: node.props.limit ?? DEFAULT_LOOP_LIMIT,
    order: node.props.order ?? "newest",
  };
  const taxonomy = node.props.taxonomy?.trim();
  const terms = slugList(node.props.terms, MAX_LOOP_TERMS);
  const pinned = slugList(node.props.pinned, MAX_LOOP_PINS);
  const first = [...new Set(node.props.overrides?.order ?? [])];
  const hidden = Object.entries(node.props.overrides?.cards ?? {})
    .filter(([, card]) => card.hidden)
    .map(([id]) => id)
    .toSorted();
  return {
    ...query,
    ...(taxonomy && terms.length > 0 ? { taxonomy, terms } : {}),
    ...(pinned.length > 0 ? { pinned } : {}),
    ...(first.length > 0 ? { first } : {}),
    ...(hidden.length > 0 ? { hidden } : {}),
  };
}

/** The key a query's entries are stored under in `ThemeDynamicData.collectionLoops`. */
export const loopQueryKey = (query: LoopQuery) =>
  `${query.collection}|${query.limit}|${query.order}${
    query.taxonomy ? `|${query.taxonomy}:${(query.terms ?? []).join(",")}` : ""
  }${query.pinned ? `|pinned:${query.pinned.join(",")}` : ""}${
    query.first ? `|first:${query.first.join(",")}` : ""
  }${query.hidden ? `|hidden:${query.hidden.join(",")}` : ""}`;

/**
 * How many entries to load for a query: room beyond the limit for the ones it moves to the front
 * or leaves out, which `arrangeEntries` cuts back to the limit.
 */
export const loopLoadLimit = (query: LoopQuery) =>
  query.limit +
  (query.pinned?.length ?? 0) +
  (query.first?.length ?? 0) +
  (query.hidden?.length ?? 0);

/**
 * W-339: a query's entries as its Loop shows them: hidden ones left out, the hand-made order
 * (`first`, by id) before the pinned slugs (W-334), then the rest in the Loop's own order, at
 * most `limit`.
 */
export function arrangeEntries<T extends { id: string; slug: string }>(
  entries: readonly T[],
  query: Pick<LoopQuery, "limit" | "pinned" | "first" | "hidden">,
): T[] {
  const hidden = new Set(query.hidden ?? []);
  const shown = entries.filter((entry) => !hidden.has(entry.id));
  const byId = new Map(shown.map((entry) => [entry.id, entry]));
  const first = (query.first ?? []).flatMap((id) => byId.get(id) ?? []);
  const rest = shown.filter((entry) => !first.includes(entry));
  return [...first, ...pinEntries(rest, query.pinned, rest.length)].slice(0, query.limit);
}

/** A change's text, unless it is blank. */
const setText = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

/**
 * W-339: a post with its card's changes: another title, summary or link; its Post Link hidden
 * (`button: false`) or labelled. Blank changes keep the entry's own.
 */
export function withCardOverride<
  T extends {
    title: string;
    excerpt: string;
    permalink: string;
    linkLabel?: string;
    linkHidden?: boolean;
  },
>(post: T, override: CardOverride | undefined): T {
  if (!override) return post;
  const title = setText(override.title);
  const excerpt = setText(override.excerpt);
  const link = setText(override.link);
  const label = setText(override.buttonLabel);
  return {
    ...post,
    ...(title ? { title } : {}),
    ...(excerpt ? { excerpt } : {}),
    ...(link ? { permalink: link } : {}),
    ...(label ? { linkLabel: label } : {}),
    ...(override.button === false ? { linkHidden: true } : {}),
  };
}

/** The changes of one card of a Loop's overrides (W-339). */
export const cardOverrideOf = (overrides: CardOverrides | undefined, id: string) =>
  overrides?.cards?.[id];

/**
 * W-334: the entries with the pinned ones first, in the pinned order, then the rest in their own
 * order, at most `limit`. A pinned slug with no entry is skipped.
 */
export function pinEntries<T extends { slug: string }>(
  entries: readonly T[],
  pinned: readonly string[] | undefined,
  limit: number,
): T[] {
  if (!pinned?.length) return entries.slice(0, limit);
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const first = pinned.flatMap((slug) => bySlug.get(slug) ?? []);
  const rest = entries.filter((entry) => !first.includes(entry));
  return [...first, ...rest].slice(0, limit);
}

/**
 * Every distinct collection Loop query in these layouts, in document order. With
 * `componentTemplates`, Loops inside component uses count as each use fills them in, so a Loop
 * whose collection or terms are bound to a field asks for that use's entries.
 */
export function collectLoopQueries(
  layouts: readonly (Layout | null | undefined)[],
  componentTemplates?: Readonly<Record<string, ComponentTemplate>>,
): LoopQuery[] {
  const found = new Map<string, LoopQuery>();
  type Item = { node: LayoutNode; components: readonly string[] };
  const stack: Item[] = [];
  const pushAll = (nodes: readonly LayoutNode[], components: readonly string[]) => {
    for (let i = nodes.length - 1; i >= 0; i--)
      stack.push({ node: nodes[i] as LayoutNode, components });
  };
  for (const layout of layouts.toReversed()) if (layout) pushAll([layout.root], []);
  // Iterative, like the other layout walks: a deep layout can't overflow the stack.
  while (stack.length > 0) {
    const { node, components } = stack.pop() as Item;
    if (node.type === "loop") {
      const query = loopQueryOf(node as LoopNode);
      if (query && !found.has(loopQueryKey(query))) found.set(loopQueryKey(query), query);
    }
    if (node.type === "component") {
      const { partId, values } = node.props as { partId: string; values?: Record<string, unknown> };
      const template = componentTemplates?.[partId.trim()];
      if (template && !components.includes(partId) && components.length < MAX_COMPONENT_DEPTH)
        pushAll(applyComponent(template, values), [...components, partId]);
    }
    if (isParentNode(node)) pushAll(node.children as LayoutNode[], components);
  }
  return [...found.values()];
}
