import type { Layout, LayoutNode, LoopNode, LoopOrder } from "../schema/layout.ts";
import { isParentNode } from "../schema/layout.ts";

/** W-308: entries a collection Loop shows when it sets no limit. */
export const DEFAULT_LOOP_LIMIT = 6;

/** What a collection Loop asks for: one load per distinct query, shared by Loops that match. */
export type LoopQuery = { collection: string; limit: number; order: LoopOrder };

/** The query of a Loop that lists a collection, or null for an archive Loop. */
export function loopQueryOf(node: LoopNode): LoopQuery | null {
  const collection = node.props.collection?.trim();
  if (!collection) return null;
  return {
    collection,
    limit: node.props.limit ?? DEFAULT_LOOP_LIMIT,
    order: node.props.order ?? "newest",
  };
}

/** The key a query's entries are stored under in `ThemeDynamicData.collectionLoops`. */
export const loopQueryKey = (query: LoopQuery) =>
  `${query.collection}|${query.limit}|${query.order}`;

/** Every distinct collection Loop query in these layouts, in document order. */
export function collectLoopQueries(layouts: readonly (Layout | null | undefined)[]): LoopQuery[] {
  const found = new Map<string, LoopQuery>();
  const stack: LayoutNode[] = [];
  for (const layout of layouts) if (layout) stack.push(layout.root);
  // Iterative, like the other layout walks: a deep layout can't overflow the stack.
  while (stack.length > 0) {
    const node = stack.pop() as LayoutNode;
    if (node.type === "loop") {
      const query = loopQueryOf(node as LoopNode);
      if (query && !found.has(loopQueryKey(query))) found.set(loopQueryKey(query), query);
    }
    if (isParentNode(node))
      for (let i = node.children.length - 1; i >= 0; i--)
        stack.push(node.children[i] as LayoutNode);
  }
  return [...found.values()];
}
