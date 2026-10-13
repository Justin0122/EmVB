import type { DesignSystem } from "../schema/design.ts";
import { isParentNode, type Layout, type LayoutNode } from "../schema/layout.ts";
import { updateNode } from "../tree-ops.ts";

export type A11yFix =
  | { kind: "heading-level"; level: number }
  | { kind: "decorative" }
  | { kind: "text-color"; color: string }
  | { kind: "drop-aria-hidden" };

export type A11yIssue = {
  /** Stable per node and rule, for React keys and tests. */
  id: string;
  nodeId: string;
  rule:
    | "image-alt"
    | "heading-order"
    | "multiple-h1"
    | "no-h1"
    | "link-name"
    | "vague-link"
    | "contrast"
    | "hidden-focusable"
    | "new-tab"
    | "image-sizes"
    | "control-name"
    | "empty-heading";
  severity: "error" | "warning";
  message: string;
  /** The one-click fix, when there is a safe one. */
  fix?: A11yFix;
  fixLabel?: string;
};

export type A11yReport = { score: number; issues: A11yIssue[] };

const WEIGHT = { error: 12, warning: 4 } as const;

/** Alt text that names a file or says nothing a screen reader user can use. */
const USELESS_ALT =
  /^(?:image|img|photo|picture|graphic|logo|icon|untitled|\s*)$|\.(?:jpe?g|png|gif|webp|avif|svg)$|^(?:img|dsc|pxl|screenshot)[_-]?\d+/i;
/** Link text that makes no sense out of context. */
/** W-411: trailing punctuation and arrows ("Read more…", "Learn more →", "Click here!") too. */
const VAGUE =
  /^(?:click here|here|read more|more|learn more|link|this|go)\s*[.!…:»›→>\u2192\u203a\u00bb-]*$/i;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A style colour as hex: literal, or a site colour variable; undefined when unknown. */
function hexOf(value: unknown, design: DesignSystem): string | undefined {
  if (typeof value === "string" && HEX.test(value)) return value;
  if (value && typeof value === "object" && "var" in value) {
    const id = (value as { var: unknown }).var;
    return design.variables.colors.find((c) => c.id === id)?.value;
  }
  return undefined;
}

function rgb(hex: string): [number, number, number] {
  let h = hex.slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const lum = (hex: string) => {
  const [r, g, bl] = rgb(hex).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
};

/**
 * W-412: `top` painted over opaque `bottom`, as 6-digit hex. A colour's alpha (#rgba,
 * #rrggbbaa) used to be dropped, so faint text counted as full strength.
 */
function over(top: string, bottom: string, fade = 1): string {
  let h = top.slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  // W-415: `fade` is the element's opacity times its ancestors'.
  const alpha = (h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1) * fade;
  if (alpha >= 1) return `#${h.slice(0, 6)}`;
  const a = rgb(`#${h.slice(0, 6)}`);
  const b = rgb(bottom);
  return `#${a
    .map((c, i) => Math.round(c * alpha + (b[i] ?? 0) * (1 - alpha)))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** WCAG contrast ratio between two hex colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].toSorted((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_TYPES = new Set([
  "heading",
  "text",
  "link",
  "label",
  "list",
  "post-title",
  "post-excerpt",
]);
const FIELD_TYPES = new Set(["text-input", "textarea", "select", "checkbox", "radio"]);
const LINKISH = new Set(["link", "button", "menu-item"]);

function px(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || !("unit" in value)) return undefined;
  const v = value as { value: number; unit: string };
  if (v.unit === "px") return v.value;
  if (v.unit === "rem" || v.unit === "em") return v.value * 16;
  return undefined;
}

/** Large text (24 px, or 18.66 px bold) needs 3:1; other text 4.5:1. */
function largeText(node: LayoutNode): boolean {
  const style = node.style as { fontSize?: unknown; fontWeight?: unknown } | undefined;
  const size = px(style?.fontSize) ?? (node.type === "heading" ? 24 : 16);
  const weight =
    typeof style?.fontWeight === "number" ? style.fontWeight : node.type === "heading" ? 700 : 400;
  return size >= 24 || (size >= 18.66 && weight >= 700);
}

/**
 * Checks a page for common accessibility problems (W-317): image alt text, heading order and
 * the single H1, link names, vague link text, text contrast against its background, focusable
 * elements hidden with aria-hidden, and unannounced new tabs. Each issue points at an element; most have a safe fix.
 */
export function auditPage(layout: Layout, design: DesignSystem): A11yReport {
  const issues: A11yIssue[] = [];
  const add = (issue: Omit<A11yIssue, "id">) =>
    issues.push({ ...issue, id: `${issue.rule}:${issue.nodeId}` });
  let lastLevel = 0;
  let h1s = 0;
  // W-312 variants are alternatives: B is judged as if it stood where A does, so a page whose
  // A/B pair each have an H1 doesn't count two.
  const beforeA = new Map<string, [number, number]>();
  const afterA = new Map<string, [number, number]>();
  let fade = 1;
  const walk = (node: LayoutNode, bg: string | undefined, color: string | undefined): void => {
    // W-413: an element hidden on every device (and what's inside it) is never shown or read.
    if (
      node !== layout.root &&
      (["desktop", "tablet", "mobile"] as const).every((d) => node.hiddenOn?.includes(d))
    ) {
      return;
    }
    const variant = node.variant;
    if (variant?.arm === "a") beforeA.set(variant.test, [h1s, lastLevel]);
    const before = variant?.arm === "b" ? beforeA.get(variant.test) : undefined;
    if (before) [h1s, lastLevel] = before;
    const outerFade = fade;
    const opacity = (node.style as { opacity?: unknown } | undefined)?.opacity;
    if (typeof opacity === "number" && opacity >= 0 && opacity < 1) fade *= opacity;
    visitNode(node, bg, color);
    fade = outerFade;
    if (variant?.arm === "a") afterA.set(variant.test, [h1s, lastLevel]);
    const after = variant?.arm === "b" ? afterA.get(variant.test) : undefined;
    if (after) [h1s, lastLevel] = after;
  };
  const visitNode = (node: LayoutNode, bg: string | undefined, color: string | undefined): void => {
    const props = node.props as Record<string, unknown>;
    const style = node.style as
      | { backgroundColor?: unknown; color?: unknown; backgroundImage?: unknown }
      | undefined;
    // A background image hides the colour behind the text: contrast can't be judged below it.
    const ownBg = style?.backgroundImage ? "unknown" : hexOf(style?.backgroundColor, design);
    const nextBg =
      ownBg && ownBg !== "unknown" && bg && bg !== "unknown" ? over(ownBg, bg) : (ownBg ?? bg);
    const nextColor = hexOf(style?.color, design) ?? color;
    // W-386: a linked image's alt text is the link's name, so it can't be decorative.
    const imageLinked =
      node.type === "image" && typeof props["href"] === "string" && props["href"].trim() !== "";
    if (node.type === "image" && imageLinked && props["decorative"] === true) {
      add({
        nodeId: node.id,
        rule: "link-name",
        severity: "error",
        message: "This image is a link but is marked decorative, so the link has no name.",
      });
    } else if (node.type === "image" && props["decorative"] !== true) {
      const alt = typeof props["alt"] === "string" ? props["alt"].trim() : "";
      if (USELESS_ALT.test(alt)) {
        add({
          nodeId: node.id,
          rule: "image-alt",
          severity: "error",
          message: alt
            ? `The alt text "${alt.slice(0, 40)}" doesn't describe the image.`
            : "This image has no alt text.",
          ...(imageLinked
            ? {}
            : { fix: { kind: "decorative" as const }, fixLabel: "Mark as decorative" }),
        });
      }
    }
    // W-403: with extra sizes but no Width, the main image is left out of srcset, so wide screens
    // can only get the listed copies.
    if (node.type === "image" && Array.isArray(props["sources"]) && props["sources"].length > 0) {
      const width = props["width"];
      const widthSet = typeof width === "number" && Number.isInteger(width) && width >= 1;
      const mainListed = (props["sources"] as { src?: unknown }[]).some(
        (s) => typeof s?.src === "string" && s.src === props["src"],
      );
      if (!widthSet && !mainListed) {
        add({
          nodeId: node.id,
          rule: "image-sizes",
          severity: "warning",
          message:
            "This image has extra sizes but no Width (px), so the main image is left out of the list the browser picks from.",
        });
      }
    }
    if (
      imageLinked &&
      props["newTab"] === true &&
      !/new (tab|window)/i.test(String(props["alt"] ?? ""))
    ) {
      add({
        nodeId: node.id,
        rule: "new-tab",
        severity: "warning",
        message: "This image link opens a new tab without saying so; say so in the alt text.",
      });
    }
    // W-408: a blank tab label or accordion title renders a tab or summary with no name.
    // W-416: a form field with no label (a placeholder is not one: it goes once you type).
    if (FIELD_TYPES.has(node.type) && !String(props["label"] ?? "").trim() && !node.bind) {
      add({
        nodeId: node.id,
        rule: "control-name",
        severity: "error",
        message: String(props["placeholder"] ?? "").trim()
          ? "This field has only a placeholder, which disappears once you type; give it a label."
          : "This field has no label, so screen readers can't say what it's for.",
      });
    }
    const NAME_PROP = {
      "tab-panel": "label",
      "accordion-item": "summary",
      video: "title",
    } as const;
    if (node.type === "tab-panel" || node.type === "accordion-item" || node.type === "video") {
      const name = String(props[NAME_PROP[node.type]] ?? "").trim();
      if (!name && !node.bind) {
        add({
          nodeId: node.id,
          rule: "control-name",
          severity: "error",
          message:
            node.type === "tab-panel"
              ? "This tab's label is blank, so the tab has no name."
              : node.type === "video"
                ? // W-410: the title names the player for screen readers.
                  "This video's title is blank, so the player has no name."
                : "This accordion item's title is blank, so it has no name.",
        });
      }
    }
    // W-419: an empty heading still shows up in screen readers' heading list, with nothing to say.
    if (node.type === "heading" && !String(props["text"] ?? "").trim() && !node.bind) {
      add({
        nodeId: node.id,
        rule: "empty-heading",
        severity: "warning",
        message: "This heading is empty; screen readers list it as a heading with no words.",
      });
    }
    if (node.type === "heading") {
      const level = typeof props["level"] === "number" ? props["level"] : 2;
      if (level === 1) {
        h1s += 1;
        if (h1s > 1) {
          add({
            nodeId: node.id,
            rule: "multiple-h1",
            severity: "warning",
            message: "The page already has an H1; screen readers use it as the page title.",
            fix: { kind: "heading-level", level: 2 },
            fixLabel: "Make it H2",
          });
        }
      } else if (level > Math.max(lastLevel, 1) + 1) {
        // The site layout may give the page its H1, so an H2 may come first.
        const to = Math.max(2, lastLevel + 1);
        add({
          nodeId: node.id,
          rule: "heading-order",
          severity: "warning",
          message: `This H${level} skips a level after ${lastLevel ? `an H${lastLevel}` : "the page start"}.`,
          fix: { kind: "heading-level", level: to },
          fixLabel: `Make it H${to}`,
        });
      }
      lastLevel = level;
    }
    if (LINKISH.has(node.type) || (node.type === "icon" && props["href"])) {
      const text = String(props["text"] ?? props["title"] ?? "").trim();
      const hasHref = typeof props["href"] === "string" && props["href"].trim() !== "";
      if (!text && !node.bind) {
        add({
          nodeId: node.id,
          rule: "link-name",
          severity: "error",
          message:
            node.type === "icon"
              ? "This icon link has no title, so it has no name."
              : node.type === "button" && !hasHref
                ? // W-400: without a URL this is a <button>, not a link.
                  props["iconId"]
                  ? "This icon-only button has no text or title, so it has no name."
                  : "This button has no text."
                : "This link has no text.",
        });
      } else if (hasHref && VAGUE.test(text)) {
        add({
          nodeId: node.id,
          rule: "vague-link",
          severity: "warning",
          message: `"${text}" doesn't say where the link goes; screen reader users often list links alone.`,
        });
      }
      if (hasHref && props["newTab"] === true && !/new (tab|window)/i.test(text)) {
        add({
          nodeId: node.id,
          rule: "new-tab",
          severity: "warning",
          message: "This link opens a new tab without saying so; add “(opens in a new tab)”.",
        });
      }
    }
    if (TEXT_TYPES.has(node.type) && nextColor && nextBg && nextBg !== "unknown") {
      const ratio = contrastRatio(over(nextColor, nextBg, fade), nextBg);
      const needed = largeText(node) ? 3 : 4.5;
      if (ratio < needed) {
        const black = contrastRatio("#000000", nextBg);
        const white = contrastRatio("#ffffff", nextBg);
        const better = black >= white ? "#111111" : "#ffffff";
        add({
          nodeId: node.id,
          rule: "contrast",
          severity: "error",
          message: `Text contrast is ${ratio.toFixed(1)}:1; it needs ${needed}:1.`,
          fix: { kind: "text-color", color: better },
          fixLabel: better === "#ffffff" ? "Use white text" : "Use dark text",
        });
      }
    }
    const focusable =
      LINKISH.has(node.type) || node.type === "text-input" || Boolean(props["href"]);
    if (
      focusable &&
      (node.attributes ?? []).some((a) => a.name === "aria-hidden" && a.value === "true")
    ) {
      add({
        nodeId: node.id,
        rule: "hidden-focusable",
        severity: "error",
        message: "aria-hidden hides this from screen readers, but the keyboard still reaches it.",
        fix: { kind: "drop-aria-hidden" },
        fixLabel: "Remove aria-hidden",
      });
    }
    if (isParentNode(node)) for (const child of node.children) walk(child, nextBg, nextColor);
  };
  walk(layout.root, undefined, undefined);
  if (h1s === 0 && layout.root.children.length > 0) {
    issues.unshift({
      id: `no-h1:${layout.root.id}`,
      nodeId: layout.root.id,
      rule: "no-h1",
      severity: "warning",
      message: "The page has no H1. Pages that use the site layout may get one from it.",
    });
  }
  const penalty = issues.reduce((sum, issue) => sum + WEIGHT[issue.severity], 0);
  return { score: Math.max(0, 100 - penalty), issues };
}

/** Applies one issue's fix (W-317). Unchanged when the issue has none. */
export function applyA11yFix(layout: Layout, issue: A11yIssue): Layout {
  const fix = issue.fix;
  if (!fix) return layout;
  return updateNode(layout, issue.nodeId, (node) => {
    switch (fix.kind) {
      case "heading-level":
        return { ...node, props: { ...node.props, level: fix.level } } as LayoutNode;
      case "decorative":
        return { ...node, props: { ...node.props, decorative: true } } as LayoutNode;
      case "text-color":
        return { ...node, style: { ...node.style, color: fix.color } } as LayoutNode;
      case "drop-aria-hidden": {
        const attributes = (node.attributes ?? []).filter((a) => a.name !== "aria-hidden");
        const { attributes: _a, ...rest } = node;
        return (attributes.length > 0 ? { ...rest, attributes } : rest) as LayoutNode;
      }
    }
  });
}

/** Applies every issue's fix at once (W-317). */
export function applyAllA11yFixes(layout: Layout, issues: A11yIssue[]): Layout {
  return issues.reduce((next, issue) => applyA11yFix(next, issue), layout);
}
