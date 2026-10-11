import { isTabsNode, type Layout } from "../schema/layout.ts";
import { nodeChildren, someNode } from "../tree-ops.ts";

/** True when the layout includes at least one Tabs element (optional public runtime). */
export function layoutHasTabs(layout: Layout): boolean {
  return someNode(layout.root, (node) => isTabsNode(node));
}

/** A Menu with a dropdown, so hosts load the Escape-to-close menu script (W-197). */
export function layoutHasMenuDropdown(layout: Layout): boolean {
  return someNode(
    layout.root,
    (node) => node.type === "menu-item" && nodeChildren(node).length > 0,
  );
}
