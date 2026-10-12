import type { Layout, LayoutNode, LoopNode, LoopOrder } from "../schema/layout.ts";
import { isParentNode } from "../schema/layout.ts";
import { applyComponent, type ComponentTemplate } from "./component.ts";

/** W-308: entries a collection Loop shows when it sets no limit. */
export const DEFAULT_LOOP_LIMIT = 6;

/** W-318: most terms one Loop filters on. */
const MAX_LOOP_TERMS = 20;

/** Components inside components a query walk follows, like the renderer's limit. */
const MAX_COMPONENT_DEPTH = 6;

/**
 * What a collection Loop asks for: one load per distinct query, shared by Loops that match.
 * W-318: `taxonomy` and `terms` keep only entries with one of those terms.
 */
export type LoopQuery = {
  collection: string;
  limit: number;
  order: LoopOrder;
  taxonomy?: string;
  terms?: string[];
};

/** W-318: the term slugs of a comma-separated list, trimmed, without blanks or repeats. */
function loopTerms(raw: string | undefined): string[] {
  const terms = (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return [...new Set(terms)].slice(0, MAX_LOOP_TERMS);
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
  const terms = loopTerms(node.props.terms);
  return taxonomy && terms.length > 0 ? { ...query, taxonomy, terms } : query;
}

/** The key a query's entries are stored under in `ThemeDynamicData.collectionLoops`. */
export const loopQueryKey = (query: LoopQuery) =>
  `${query.collection}|${query.limit}|${query.order}${
    query.taxonomy ? `|${query.taxonomy}:${(query.terms ?? []).join(",")}` : ""
  }`;

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
