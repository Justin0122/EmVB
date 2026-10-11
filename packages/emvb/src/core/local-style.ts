import type { LayoutNode } from "./schema/layout.ts";

/** Local style keys. Classes and `query` stay on the element (D-033, W-355). */
const LOCAL_STYLE_KEYS = ["style", "states", "devices", "hiddenOn"] as const;

export type LocalStyle = Pick<LayoutNode, (typeof LOCAL_STYLE_KEYS)[number]>;

/** The local style of a node; classes stay behind (D-033). */
export function localStyleOf(node: LayoutNode): LocalStyle {
  const copied: LocalStyle = {};
  for (const key of LOCAL_STYLE_KEYS) {
    const value = node[key];
    if (value !== undefined) (copied as Record<string, unknown>)[key] = structuredClone(value);
  }
  return copied;
}

/** Replaces style, states, devices and hiddenOn. Other fields stay. `query` is not a local style. */
export function withLocalStyle<T extends LayoutNode>(node: T, copied: LocalStyle): T {
  const next = { ...node } as Record<string, unknown>;
  for (const key of LOCAL_STYLE_KEYS) {
    delete next[key];
    const value = copied[key];
    if (value !== undefined) next[key] = structuredClone(value);
  }
  return next as T;
}
