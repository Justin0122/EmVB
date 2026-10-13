import { sanitizeHref } from "../sanitize/href.ts";
import type { BreadcrumbsNode } from "../schema/layout.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import type { VNode } from "./vnode.ts";

/** What the editor canvas shows while it has no real page around it. */
const EDITOR_SAMPLE = { trail: [{ label: "Section", href: "#" }], current: "This page" };

const separator = (): VNode => ({
  tag: "span",
  attrs: { class: "emvb-breadcrumbs-sep", "aria-hidden": "true" },
  children: [],
});

/**
 * W-329: Home, the pages above this one and this page, as links in a `<nav>`. With `mobile:
 * "back"`, small screens show only a link back to the page above and this page's name. Nothing
 * renders without a trail on the published page, or on the homepage itself.
 */
export function renderBreadcrumbs(
  node: BreadcrumbsNode,
  attrs: Record<string, string>,
  dynamic: ThemeDynamicData | undefined,
  mode: "editor" | "public",
): VNode | undefined {
  const data = dynamic?.breadcrumbs ?? (mode === "editor" ? EDITOR_SAMPLE : undefined);
  if (!data?.current.trim()) return undefined;
  const home = { label: node.props.homeLabel?.trim() || "Home", href: "/" };
  const links = [home, ...data.trail]
    .map((crumb) => ({ label: crumb.label.trim(), href: sanitizeHref(crumb.href) }))
    .filter((crumb): crumb is { label: string; href: string } => !!crumb.label && !!crumb.href);
  const items: VNode[] = links.map((crumb, i) => ({
    tag: "li",
    attrs: {},
    children: [
      ...(i > 0 ? [separator()] : []),
      { tag: "a", attrs: { href: crumb.href }, children: [crumb.label] },
    ],
  }));
  items.push({
    tag: "li",
    attrs: { "aria-current": "page" },
    children: [separator(), data.current.trim()],
  });
  const children: VNode[] = [
    { tag: "ol", attrs: { class: "emvb-breadcrumbs-trail" }, children: items },
  ];
  const back = node.props.mobile === "back";
  const parent = links.at(-1);
  if (back && parent) {
    children.push({
      tag: "div",
      attrs: { class: "emvb-breadcrumbs-back" },
      children: [
        {
          tag: "a",
          attrs: { href: parent.href },
          children: [
            {
              tag: "span",
              attrs: {
                class: "emvb-breadcrumbs-sep emvb-breadcrumbs-back-icon",
                "aria-hidden": "true",
              },
              children: [],
            },
            parent.label,
          ],
        },
        { tag: "span", attrs: { "aria-current": "page" }, children: [data.current.trim()] },
      ],
    });
  }
  return {
    tag: "nav",
    attrs: {
      ...attrs,
      "aria-label": "Breadcrumb",
      ...(back ? { "data-emvb-mobile": "back" } : {}),
    },
    children,
  };
}
