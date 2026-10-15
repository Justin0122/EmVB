import { carouselFrame, ELEMENTS } from "../elements/index.ts";
import type { LayoutNode, LoopNode } from "../schema/layout.ts";
import {
  resolvePostsForLoop,
  SAMPLE_POST,
  type ThemeDynamicData,
  type ThemePostFields,
} from "../theme/dynamic.ts";
import {
  arrangeEntries,
  cardOverrideOf,
  loopQueryKey,
  loopQueryOf,
  withCardOverride,
} from "../theme/loop-queries.ts";

/** In the editor, a collection Loop shows this many sample items at most. */
const EDITOR_SAMPLES = 3;

/**
 * The items a Loop repeats for: a collection Loop's loaded entries (W-308), else the archive's
 * posts. The editor shows sample items, since it has no entries loaded.
 */
function loopItems(
  node: LoopNode,
  dynamic: ThemeDynamicData | undefined,
  mode: "public" | "editor",
): ThemePostFields[] {
  const query = loopQueryOf(node);
  if (!query) return resolvePostsForLoop(dynamic, mode);
  const entries = dynamic?.collectionLoops?.[loopQueryKey(query)];
  // W-339: the cards as arranged by hand, each with its own changes.
  if (entries && entries.length > 0)
    return arrangeEntries(entries, query).map((post) =>
      withCardOverride(post, cardOverrideOf(node.props.overrides, post.id)),
    );
  if (mode !== "editor") return [];
  return Array.from({ length: Math.min(query.limit, EDITOR_SAMPLES) }, (_, i) => ({
    ...SAMPLE_POST,
    id: `sample-${i + 1}`,
  }));
}
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

/** One item per post, from the chosen loop-item part or the loop's own children. */
export function renderLoop(
  node: LoopNode,
  attrs: Record<string, string>,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode | undefined {
  const posts = loopItems(node, dynamic, ctx.mode);
  const itemPartId = node.props.itemPartId?.trim() ?? "";
  const templateLayout =
    itemPartId && dynamic?.loopTemplates ? dynamic.loopTemplates[itemPartId] : undefined;
  const templateNodes: LayoutNode[] = templateLayout ? templateLayout.root.children : node.children;
  // Editor mode always has a sample post, so an empty item template would paint a zero-height box.
  if (posts.length === 0 || (ctx.mode === "editor" && templateNodes.length === 0)) {
    if (ctx.mode !== "editor") return undefined;
    return {
      tag: "div",
      attrs: { ...attrs, "data-emvb-loop-empty": "" },
      children: ["Choose a Loop Item, or add elements here to design the item."],
    };
  }
  const children: VNode[] = [];
  // Items don't get the archive's page data: a Pagination belongs after the Loop (W-228).
  const { pagination: _pagination, ...rest } = dynamic ?? {};
  // A loop item part is another layout, so its ids may match the page's (W-250).
  const itemDynamic = templateLayout
    ? { ...rest, idOrigin: `${rest.idOrigin ?? ""}/l:${itemPartId}` }
    : rest;
  const slider = node.props.slidesInView !== undefined;
  for (const post of posts) {
    children.push({
      tag: "div",
      attrs: {
        class: slider ? "emvb-loop-item emvb-carousel-slide" : "emvb-loop-item",
        "data-emvb-loop-item": post.id,
      },
      children: ctx.children(templateNodes, { ...itemDynamic, post, inLoopItem: true }),
    });
  }
  if (slider) {
    // W-315: the items as a carousel: the Carousel element's track and arrows (its CSS and
    // runtime come along with `usesCarousel`).
    ctx.usesCarousel();
    return carouselFrame(
      { ...attrs, class: `${attrs.class ?? ""} emvb-carousel`.trim() },
      children,
      {},
    );
  }
  return ELEMENTS.loop.build(node as never, attrs, children);
}
