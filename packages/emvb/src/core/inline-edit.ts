import { commitPlainText, isPlainTextNode, withPlainText } from "./elements/plain-text.ts";
import { MAX_RICH_TEXT } from "./sanitize/rich-text.ts";
import type { Layout, LayoutNode } from "./schema/layout.ts";
import { withComponentValue } from "./theme/component.ts";
import { findNode, updateNode } from "./tree-ops.ts";

/**
 * W-325: one text edited on the site in EmDash's edit mode, as the page's markers name it:
 * an element's own text (`data-emvb-text="<id>|plain|<multiline>"` or `"<id>|rich"`), or a field
 * of a component use (`data-emvb-bound="<use id>|<path>|<text|rich-text>"`).
 */
export type InlineEditTarget =
  | { kind: "element"; id: string; rich: boolean; multiline: boolean }
  | { kind: "field"; use: string; path: string; rich: boolean };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const PATH = /^[a-z][a-z0-9_]{0,39}(?:\.\d{1,3}\.[a-z][a-z0-9_]{0,39})*$/;

/** The edit a marker names, or null for a marker that isn't one. */
export function inlineEditTarget(
  text: string | null | undefined,
  bound: string | null | undefined,
): InlineEditTarget | null {
  if (bound) {
    const [use = "", path = "", kind] = bound.split("|");
    if (!ID.test(use) || !PATH.test(path) || (kind !== "text" && kind !== "rich-text")) return null;
    return { kind: "field", use, path, rich: kind === "rich-text" };
  }
  if (text) {
    const [id = "", kind, multiline] = text.split("|");
    if (!ID.test(id) || (kind !== "plain" && kind !== "rich")) return null;
    return { kind: "element", id, rich: kind === "rich", multiline: multiline === "1" };
  }
  return null;
}

/** A value as the target stores it: plain text without line breaks where they don't belong. */
const stored = (target: InlineEditTarget, value: string) =>
  target.rich
    ? value.slice(0, MAX_RICH_TEXT)
    : commitPlainText(value, target.kind === "element" ? target.multiline : false);

/**
 * The layout with the edit applied, or null when the target isn't in it (the page changed since
 * it was shown) or doesn't hold that kind of text.
 */
export function applyInlineEdit(
  layout: Layout,
  target: InlineEditTarget,
  value: string,
): Layout | null {
  const id = target.kind === "element" ? target.id : target.use;
  const node = findNode(layout, id);
  if (!node) return null;
  const next = stored(target, value);
  if (target.kind === "field") {
    if (node.type !== "component") return null;
    return updateNode(layout, id, (current) => {
      const props = current.props as { values?: Record<string, unknown> };
      return {
        ...current,
        props: { ...current.props, values: withComponentValue(props.values, target.path, next) },
      } as LayoutNode;
    });
  }
  if (target.rich) {
    if (node.type !== "rich-text") return null;
    return updateNode(layout, id, (current) =>
      current.type === "rich-text"
        ? { ...current, props: { ...current.props, html: next } }
        : current,
    );
  }
  if (!isPlainTextNode(node)) return null;
  return updateNode(layout, id, (current) => withPlainText(current, next));
}
