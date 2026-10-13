import { renderComponent } from "./component.ts";
import type { ComponentNode } from "../schema/layout.ts";
import { generateCss } from "../css/generate.ts";
import { cssScopeToken, scopeAttribute, scopeCss, scopeWrapperCss } from "../css/scope.ts";
import { ELEMENTS } from "../elements/index.ts";
import { controlId } from "../elements/field-id.ts";
import { layoutHasForm } from "../forms/binding.ts";
import { layoutHasMenuDropdown, layoutHasTabs } from "../tabs/presence.ts";
import type { DesignSystem } from "../schema/design.ts";
import {
  isFormNode,
  isLoopNode,
  isParentNode,
  isSectionNode,
  isTabsNode,
  type Layout,
  type LayoutNode,
  type PaginationNode,
} from "../schema/layout.ts";
import {
  cssLength,
  stateDeclarations,
  styleClassName,
  styleDeclarations,
  withInheritedLayers,
  type Declaration,
  type StateDeclarations,
} from "../sanitize/css.ts";
import { STYLE_STATES } from "../schema/state-names.ts";
import { resolveEmbedUrl } from "../sanitize/embed-url.ts";
import { boundFieldOf } from "../theme/component.ts";
import { resolvePostForRender, type ThemeDynamicData } from "../theme/dynamic.ts";
import type { FormDefinitions } from "../forms/definition.ts";
import type { PopupDevice } from "../theme/popup-rules.ts";
import type { RenderContext, RenderMode } from "./context.ts";
import { isDynamicPostNode, renderDynamicPost } from "./dynamic-post.ts";
import { renderForm, withFieldOptions } from "./form.ts";
import { renderLoop } from "./loop.ts";
import { renderPagination } from "./pagination.ts";
import { renderSection } from "./section.ts";
import { renderTabs } from "./tabs.ts";
import { serialize, type VNode } from "./vnode.ts";
import { classStylesInListOrder } from "../design/cascade.ts";
import {
  applyBackgroundVideo,
  applyBoxLink,
  customAttributes,
  safeBackgroundVideo,
} from "./extras.ts";

export type { RenderMode } from "./context.ts";
export { FORMS_SUBMIT_PATH } from "./form.ts";

export type RenderWarning = {
  nodeId: string;
  code: "unknown-type" | "rejected-style" | "unknown-variable";
  detail: string;
};
export type RenderResult = {
  vnode: VNode;
  html: string;
  css: string;
  needsFormsRuntime: boolean;
  needsTabsRuntime: boolean;
  /** A Carousel is on the page: hosts load `EmVBCarouselRuntime` for its arrows (W-314). */
  needsCarouselRuntime: boolean;
  /** A Menu has a dropdown: hosts load `EmVBMenuRuntime` (W-197). */
  needsMenuRuntime: boolean;
  /** The site's text direction when set in Site styles, for the host's `<html dir>` (W-230). */
  dir?: "ltr" | "rtl" | "auto";
  warnings: RenderWarning[];
};

const ID = /^[A-Za-z0-9_-]{4,24}$/;
const HTML_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

// Canvas iframe has no allow-scripts (D-011): live YouTube/Vimeo players fail there.
function videoPreview(node: LayoutNode, attrs: Record<string, string>): VNode | undefined {
  const target = resolveEmbedUrl((node.props as { url: string }).url);
  if (target?.kind !== "iframe") return undefined;
  const label =
    (node.props as { title?: string }).title?.trim() ||
    (target.provider === "youtube" ? "YouTube video" : "Vimeo video");
  return {
    tag: "div",
    attrs: {
      ...attrs,
      class: `${attrs.class} emvb-video-preview`.trim(),
      "data-emvb-video-preview": target.provider,
    },
    children: [`${label} — plays on the published page`],
  };
}

/**
 * Renders a validated layout to lean HTML and CSS (R-031, R-032). Walks defensively: unknown types
 * render nothing publicly and a placeholder in the editor (R-033); unsafe style values are dropped.
 */
/** `grid-template-columns` for a whole column count from 1 to 12; anything else emits nothing. */
const gridTracks = (columns: unknown): Declaration[] =>
  typeof columns === "number" && Number.isInteger(columns) && columns >= 1 && columns <= 12
    ? [{ property: "grid-template-columns", value: `repeat(${columns}, minmax(0, 1fr))` }]
    : [];

/** A node with at least one child; tolerant of a malformed node without a children array. */
const hasChildren = (node: LayoutNode): boolean => {
  const children: unknown = (node as { children?: unknown }).children;
  return Array.isArray(children) && children.length > 0;
};

/** A short, stable hash of a node origin, for its suffixed rule id (W-250). */
function originHash(origin: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < origin.length; i += 1) {
    hash ^= origin.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Form fields whose control carries an `emvb-field-<id>` HTML id (W-187). */
const FIELD_TYPES = new Set(["text-input", "textarea", "select", "checkbox", "radio"]);

const ID_ATTRS = ["id", "for", "aria-controls", "aria-labelledby", "aria-describedby"] as const;

/** Rewrites `base` (or `base-…`) to `next` in the id and id-reference attributes of a subtree. */
function renameIds(vnode: VNode, base: string, next: string): VNode {
  const attrs = { ...vnode.attrs };
  for (const key of ID_ATTRS) {
    const value = attrs[key];
    if (value === undefined) continue;
    attrs[key] = value
      .split(" ")
      .map((ref) =>
        ref === base || ref.startsWith(`${base}-`) ? next + ref.slice(base.length) : ref,
      )
      .join(" ");
  }
  return {
    ...vnode,
    attrs,
    children: vnode.children.map((child) =>
      typeof child === "string" ? child : renameIds(child, base, next),
    ),
  };
}

/** W-314: a carousel's slides in view, as its CSS variable. */
const carouselPerView = (value: unknown): Declaration[] =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6
    ? [{ property: "--emvb-per-view", value: String(value) }]
    : [];

/** W-314: a carousel's gap, as the variable its track and slide widths use. */
const carouselGap = (style: Record<string, unknown> | undefined): Declaration[] => {
  const gap = cssLength(style?.["gap"]);
  return gap ? [{ property: "--emvb-carousel-gap", value: gap }] : [];
};

export function renderPage(
  layout: Layout,
  design: DesignSystem,
  opts: {
    mode?: RenderMode;
    formDefinitions?: FormDefinitions;
    dynamic?: ThemeDynamicData;
    /** Public renders: wrap the markup and scope the CSS to it, so sheets can't override each other (W-112). */
    scope?: string;
    /** Editor canvas: device rules follow this device, not the frame width (W-116). */
    previewDevice?: PopupDevice;
  } = {},
): RenderResult {
  const mode = opts.mode ?? "public";
  const baseDynamic = opts.dynamic;
  const warnings: RenderWarning[] = [];
  const usedTypes = new Set<string>();
  const localRules: {
    id: string;
    declarations: Declaration[];
    states: StateDeclarations;
    tablet?: Declaration[];
    mobile?: Declaration[];
    hiddenOn?: LayoutNode["hiddenOn"];
  }[] = [];
  const knownVariables = new Set(design.variables.colors.map((c) => c.id));
  let backgroundVideo = false;

  const domIds = new Map<string, number>();
  // W-253: runtimes follow what renders, including synced section and loop item contents,
  // which the page's own layout doesn't hold.
  const rendered = { form: false, tabs: false, menuDropdown: false, carousel: false };
  const ctx: RenderContext = {
    mode,
    definitions: opts.formDefinitions ?? new Map(),
    children: (nodes, dynamic) =>
      nodes
        .map((child) => visit(child, false, dynamic))
        .filter((child): child is VNode => child !== undefined),
    usesCarousel: () => {
      usedTypes.add("carousel");
      rendered.carousel = true;
    },
    uniqueId: (base) => {
      const count = (domIds.get(base) ?? 0) + 1;
      domIds.set(base, count);
      return count === 1 ? base : `${base}-r${count}`;
    },
  };

  // W-250: the first origin (page, synced section, loop item part) to use each element id.
  const idOrigins = new Map<string, string>();
  /** The id in `.emvb-e-<id>`: suffixed when another layout already used this id here. */
  const ruleIdFor = (id: string, origin: string): string => {
    const first = idOrigins.get(id);
    if (first === undefined) idOrigins.set(id, origin);
    return first === undefined || first === origin ? id : `${id}-o${originHash(origin)}`;
  };

  const nodeAttrs = (
    node: LayoutNode,
    isRoot: boolean,
    id: string | undefined,
    nodeId: string,
    ruleId: string | undefined,
    insideComponent = false,
    boundUse?: string,
  ): Record<string, string> => {
    const classes = [...(isRoot ? ["emvb-root"] : []), `emvb-${node.type}`];
    for (const classId of node.classes ?? []) {
      const name = styleClassName(classId);
      if (name) classes.push(name);
    }
    const { declarations, rejected } = styleDeclarations(node.style);
    // W-210: a device that sets one background layer keeps the layers it inherits.
    const base = node.style ?? {};
    const tabletStyle = node.devices?.tablet;
    const tablet = styleDeclarations(withInheritedLayers(tabletStyle, base));
    const mobile = styleDeclarations(
      withInheritedLayers(node.devices?.mobile, { ...base, ...tabletStyle }),
    );
    for (const key of [...rejected, ...tablet.rejected, ...mobile.rejected]) {
      warnings.push({ nodeId, code: "rejected-style", detail: key });
    }
    if (node.type === "spacer") {
      const height = cssLength((node as { props: { height: unknown } }).props.height);
      if (height) declarations.push({ property: "height", value: height });
    }
    if (node.type === "layout-section") {
      // The inner box's width (W-156): full width, or a length; unset keeps the 1140 px default.
      const props = (node as { props: { contentWidth?: unknown; fullWidth?: unknown } }).props;
      const width = props.fullWidth === true ? "none" : cssLength(props.contentWidth);
      if (width) declarations.push({ property: "--emvb-content-width", value: width });
    }
    if (
      node.type === "loop" &&
      (node as { props: Record<string, unknown> }).props["slidesInView"] !== undefined
    ) {
      // W-315: a Loop shown as a carousel takes the same slide variables.
      const props = (node as { props: Record<string, unknown> }).props;
      declarations.push(...carouselPerView(props["slidesInView"]), ...carouselGap(node.style));
      tablet.declarations.unshift(
        ...carouselPerView(props["slidesInViewTablet"]),
        ...carouselGap(node.devices?.tablet),
      );
      mobile.declarations.unshift(
        ...carouselPerView(props["slidesInViewMobile"]),
        ...carouselGap(node.devices?.mobile),
      );
    }
    if (node.type === "carousel") {
      // W-314: slides in view and the gap between them, per device, for the track and slides.
      const props = (node as { props: Record<string, unknown> }).props;
      declarations.push(...carouselPerView(props["perView"]), ...carouselGap(node.style));
      tablet.declarations.unshift(
        ...carouselPerView(props["perViewTablet"]),
        ...carouselGap(node.devices?.tablet),
      );
      mobile.declarations.unshift(
        ...carouselPerView(props["perViewMobile"]),
        ...carouselGap(node.devices?.mobile),
      );
      rendered.carousel = true;
    }
    if (node.type === "grid") {
      const props = (node as { props: Record<string, unknown> }).props;
      declarations.push(...gridTracks(props["columns"]));
      // Tablet and mobile counts go in their media queries (W-139).
      tablet.declarations.unshift(...gridTracks(props["columnsTablet"]));
      mobile.declarations.unshift(...gridTracks(props["columnsMobile"]));
    }
    const states = stateDeclarations(node.states);
    for (const key of states.rejected) {
      warnings.push({ nodeId, code: "rejected-style", detail: key });
    }
    for (const color of [node.style?.color, ...STYLE_STATES.map((s) => node.states?.[s]?.color)]) {
      if (typeof color === "object" && !knownVariables.has(color.var)) {
        warnings.push({ nodeId, code: "unknown-variable", detail: color.var });
      }
    }
    const hiddenOn = node.hiddenOn;
    const responsive =
      tablet.declarations.length > 0 ||
      mobile.declarations.length > 0 ||
      (hiddenOn?.length ?? 0) > 0;
    if (
      ruleId &&
      (declarations.length > 0 || Object.keys(states.states).length > 0 || responsive)
    ) {
      classes.push(`emvb-e-${ruleId}`);
      localRules.push({
        id: ruleId,
        declarations,
        states: states.states,
        tablet: tablet.declarations,
        mobile: mobile.declarations,
        hiddenOn,
      });
    }
    const attrs: Record<string, string> = { class: classes.join(" "), ...customAttributes(node) };
    // W-312: elements inside a component aren't editable on their own; the component is.
    if (mode === "editor" && id && !insideComponent) attrs["data-emvb-id"] = id;
    // W-324: a text inside a component use names the use's field it shows.
    const bound = insideComponent && mode === "editor" ? boundFieldOf(node) : undefined;
    if (bound && boundUse) attrs["data-emvb-bound"] = `${boundUse}|${bound.path}|${bound.kind}`;
    if (node.htmlId && HTML_ID.test(node.htmlId)) attrs.id = node.htmlId;
    // W-230: the site's text direction on the root, also a fallback when the host's <html> has none.
    if (isRoot && design.direction) attrs.dir = design.direction;
    return attrs;
  };

  function visit(
    node: LayoutNode,
    isRoot: boolean,
    dynamic: ThemeDynamicData | undefined = baseDynamic,
  ): VNode | undefined {
    const id = ID.test(node.id) ? node.id : undefined;
    const nodeId = id ?? "(invalid id)";
    const type: string = node.type;
    if (!Object.hasOwn(ELEMENTS, type)) {
      warnings.push({ nodeId, code: "unknown-type", detail: type });
      if (mode === "public") return undefined;
      return {
        tag: "div",
        attrs: { class: "emvb-unknown", ...(id ? { "data-emvb-id": id } : {}) },
        children: [`Unknown element "${type}"`],
      };
    }
    usedTypes.add(type);
    if (isFormNode(node) && node.props.formId.trim()) rendered.form = true;
    if (isTabsNode(node)) rendered.tabs = true;
    if (type === "menu-item" && hasChildren(node)) rendered.menuDropdown = true;
    const ruleId = id === undefined ? undefined : ruleIdFor(id, dynamic?.idOrigin ?? "");
    const attrs = nodeAttrs(
      node,
      isRoot,
      id,
      nodeId,
      ruleId,
      (dynamic?.componentStack?.length ?? 0) > 0,
      dynamic?.componentUse,
    );
    const def = ELEMENTS[type as keyof typeof ELEMENTS];
    if (isFormNode(node)) return finish(node, renderForm(node, attrs, ctx, dynamic));
    if (isLoopNode(node)) return finish(node, renderLoop(node, attrs, ctx, dynamic));
    if (node.type === "pagination") {
      return finish(node, renderPagination(node as PaginationNode, attrs, dynamic, mode));
    }
    if (isSectionNode(node)) return finish(node, renderSection(node, attrs, ctx, dynamic));
    if (node.type === "component") {
      return finish(node, renderComponent(node as ComponentNode, attrs, ctx, dynamic));
    }
    if (isDynamicPostNode(node)) {
      return finish(
        node,
        renderDynamicPost(node, attrs, resolvePostForRender(dynamic, mode), mode),
      );
    }
    if (isTabsNode(node)) return finish(node, renderTabs(node, id, attrs, ctx, dynamic));
    if (isParentNode(node)) {
      return finish(node, def.build(node as never, attrs, ctx.children(node.children, dynamic)));
    }
    if (mode === "editor" && node.type === "video") {
      const preview = videoPreview(node, attrs);
      if (preview) return finish(node, preview);
    }
    const built = withFieldOptions(def.build(node as never, attrs, []), node, ctx.definitions);
    return finish(node, FIELD_TYPES.has(type) && id ? uniqueField(built, controlId(id)) : built);
  }

  /** W-249: a field rendered again (synced section, loop item) moves its control to a new id. */
  function uniqueField(vnode: VNode, base: string): VNode {
    const unique = ctx.uniqueId(base);
    return unique === base ? vnode : renameIds(vnode, base, unique);
  }

  function videoOf(node: LayoutNode): string | undefined {
    let found: string | undefined;
    for (const style of classStylesInListOrder(design.classes, node.classes ?? [])) {
      const safe = safeBackgroundVideo(style?.backgroundVideo);
      if (safe) found = safe;
    }
    const own = safeBackgroundVideo(node.style?.backgroundVideo);
    return own ?? found;
  }

  function finish(node: LayoutNode, vnode: VNode | undefined): VNode | undefined {
    if (!vnode) return undefined;
    const src = videoOf(node);
    if (src) backgroundVideo = true;
    return applyBackgroundVideo(applyBoxLink(node, vnode), src);
  }

  const vnode = visit(layout.root, true) ?? {
    tag: "div",
    attrs: { class: "emvb-root" },
    children: [],
  };
  const baseCss = new Map(Object.entries(ELEMENTS).map(([type, def]) => [type, def.baseCss]));
  const html = serialize(vnode);
  const css = generateCss({
    design,
    usedTypes,
    baseCss,
    localRules,
    previewStates: mode === "editor",
    backgroundVideo,
    ...(mode === "editor" && opts.previewDevice ? { previewDevice: opts.previewDevice } : {}),
  });
  const scope = opts.scope === undefined ? undefined : cssScopeToken(opts.scope);
  return {
    vnode,
    html: scope ? `<div ${scopeAttribute(scope)}>${html}</div>` : html,
    css: scope ? scopeWrapperCss() + scopeCss(css, scope) : css,
    needsFormsRuntime: rendered.form || layoutHasForm(layout),
    needsTabsRuntime: rendered.tabs || layoutHasTabs(layout),
    needsCarouselRuntime: rendered.carousel,
    needsMenuRuntime: rendered.menuDropdown || layoutHasMenuDropdown(layout),
    ...(design.direction ? { dir: design.direction } : {}),
    warnings,
  };
}
