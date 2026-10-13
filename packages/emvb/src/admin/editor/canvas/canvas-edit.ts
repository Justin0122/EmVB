import {
  componentValueAt,
  findNode,
  isMultilineText,
  isPlainTextNode,
  plainTextOf,
  withComponentValue,
  withPlainText,
  type Layout,
  type LayoutNode,
} from "../../../core/index.ts";

/**
 * What a canvas double-click edits (W-097, W-324): one element's text, plain or rich, stored on
 * the element itself or in a field of the component use it belongs to.
 */
export type CanvasEdit = {
  id: string;
  element: HTMLElement;
  kind: "plain" | "rich";
  value: string;
  multiline: boolean;
  update: (node: LayoutNode, value: string) => LayoutNode;
};

/** The edit a double-click on `target` inside the element `id` starts, if its text is editable. */
export function canvasEditFor(
  doc: Document,
  layout: Layout | null,
  id: string,
  target: EventTarget | null,
): CanvasEdit | null {
  const node = layout ? findNode(layout, id) : undefined;
  if (!node) return null;
  const own = doc.querySelector<HTMLElement>(`[data-emvb-id="${CSS.escape(id)}"]`);
  // A text inside a component use edits the use's field (W-324).
  const bound =
    node.type === "component" && target instanceof (doc.defaultView?.Element ?? Element)
      ? (target as Element).closest<HTMLElement>("[data-emvb-bound]")
      : null;
  if (bound) {
    const [use, path = "", kind] = (bound.getAttribute("data-emvb-bound") ?? "").split("|");
    if (use !== id || !path) return null;
    const values = (node.props as { values?: Record<string, unknown> }).values;
    const current = componentValueAt(values, path);
    return {
      id,
      element: bound,
      kind: kind === "rich-text" ? "rich" : "plain",
      value: typeof current === "string" ? current : "",
      multiline: kind !== "rich-text" && bound.classList.contains("emvb-text"),
      update: (latest, value) =>
        ({
          ...latest,
          props: {
            ...latest.props,
            values: withComponentValue(
              (latest.props as { values?: Record<string, unknown> }).values,
              path,
              value,
            ),
          },
        }) as LayoutNode,
    };
  }
  if (!own) return null;
  if (node.type === "rich-text") {
    return {
      id,
      element: own,
      kind: "rich",
      value: String(node.props.html ?? ""),
      multiline: true,
      update: (latest, html) =>
        latest.type === "rich-text" ? { ...latest, props: { ...latest.props, html } } : latest,
    };
  }
  const text = isPlainTextNode(node) ? plainTextOf(node) : null;
  if (text === null) return null;
  return {
    id,
    element: own,
    kind: "plain",
    value: text,
    multiline: isMultilineText(node),
    update: (latest, value) => withPlainText(latest, value),
  };
}
