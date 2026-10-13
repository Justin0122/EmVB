import { ELEMENTS } from "../elements/index.ts";
import type { ComponentNode } from "../schema/layout.ts";
import { applyComponent } from "../theme/component.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

const MAX_COMPONENT_DEPTH = 6;

/**
 * W-312: one use of a component: its published design, filled with this use's values. In the
 * editor the inner elements carry no element ids, so a click selects the component itself.
 */
export function renderComponent(
  node: ComponentNode,
  attrs: Record<string, string>,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode {
  const partId = node.props.partId.trim();
  const stack = dynamic?.componentStack ?? [];
  const template = partId ? dynamic?.componentTemplates?.[partId] : undefined;
  if (!template || stack.includes(partId) || stack.length >= MAX_COMPONENT_DEPTH) {
    if (ctx.mode !== "editor") return ELEMENTS.component.build(node, attrs, []);
    return {
      tag: "div",
      attrs: { ...attrs, "data-emvb-component-missing": "" },
      children: [partId ? "This component isn't published" : "Choose a component"],
    };
  }
  const next: ThemeDynamicData = {
    ...dynamic,
    componentStack: [...stack, partId],
    // W-324: only a use on the page itself is edited in place; a component inside a design isn't.
    componentUse: stack.length === 0 ? node.id : undefined,
    // Each use is its own copy, so its element ids get their own CSS rules (W-250).
    idOrigin: `${dynamic?.idOrigin ?? ""}/c:${node.id}`,
  };
  return ELEMENTS.component.build(
    node,
    attrs,
    ctx.children(applyComponent(template, node.props.values), next),
  );
}
