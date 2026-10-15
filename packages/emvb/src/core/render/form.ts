import { fieldByName, type FormDefinitions, type PublicFormField } from "../forms/definition.ts";
import type { FormNode, LayoutNode } from "../schema/layout.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import { nodeChildren } from "../tree-ops.ts";
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

export const FORMS_SUBMIT_PATH = "/_emdash/api/plugins/emdash-forms/submit";

/** What a paused form shows on the page (W-326). */
export const FORM_PAUSED_TEXT = "This form isn't accepting responses right now.";

const honeypot = (inputId: string): VNode => ({
  tag: "div",
  attrs: {
    class: "ec-form-hp",
    "aria-hidden": "true",
  },
  children: [
    {
      tag: "label",
      attrs: { for: inputId },
      children: ["Leave blank"],
    },
    {
      tag: "input",
      attrs: {
        type: "text",
        id: inputId,
        name: "_hp",
        tabindex: "-1",
        autocomplete: "off",
      },
      children: [],
    },
  ],
});

/** An EmDash Forms markup shell (D-006) around the form's fields; unbound forms only preview in the editor. */
/** The text of the form's first Submit button, as the page renders it. */
function firstSubmitLabel(nodes: readonly LayoutNode[]): string | undefined {
  for (const child of nodes) {
    if (child.type === "submit") {
      return (child.props as { label?: string }).label?.trim() || "Submit";
    }
    const found = firstSubmitLabel(nodeChildren(child));
    if (found !== undefined) return found;
  }
  return undefined;
}

export function renderForm(
  node: FormNode,
  attrs: Record<string, string>,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode | undefined {
  const formId = node.props.formId.trim();
  // Unbound forms: no live <form>/ec-form shell (avoids broken preview; public stays zero-JS).
  if (!formId) {
    if (ctx.mode === "public") return undefined;
    return {
      tag: "div",
      attrs: {
        ...attrs,
        class: `${attrs.class} emvb-form-unbound`.trim(),
        "data-emvb-form-unbound": "",
      },
      children: ["Bind a form in settings to preview it here."],
    };
  }
  // W-326: a paused form says so, in place of fields that can't be sent (the forms plugin refuses
  // its submissions), with no form, inputs or Submit button.
  if (ctx.definitions.get(formId)?.status === "paused") {
    return {
      tag: "div",
      attrs: {
        ...attrs,
        class: `${attrs.class} emvb-form-paused`.trim(),
        role: "status",
        "data-emvb-form-paused": "",
      },
      children: [{ tag: "p", attrs: {}, children: [FORM_PAUSED_TEXT] }],
    };
  }
  // W-203: the forms client puts this label back on the button after each submit, so it must be
  // the label the page shows, not the form definition's.
  const submitLabel =
    firstSubmitLabel(node.children) ??
    ctx.definitions.get(formId)?.settings.submitLabel ??
    "Submit";
  const previousForm = ctx.formId;
  ctx.formId = formId;
  const fieldNodes = ctx.children(node.children, dynamic);
  ctx.formId = previousForm;
  const page: VNode = {
    tag: "div",
    attrs: { "data-page": "0" },
    children: fieldNodes,
  };
  return {
    tag: "form",
    attrs: {
      ...attrs,
      class: `${attrs.class} ec-form`.trim(),
      method: "POST",
      action: FORMS_SUBMIT_PATH,
      "data-ec-form": "",
      "data-form-id": formId,
      // W-297: the forms client checks each control itself and writes the message next to the
      // field, as the server's errors are; without this the browser's bubble would come first.
      novalidate: "",
      "data-submit-label": submitLabel,
    },
    children: [
      page,
      { tag: "input", attrs: { type: "hidden", name: "formId", value: formId }, children: [] },
      // One id per form element, so the same form placed twice keeps unique ids (W-187), also
      // when one form element renders twice, from a synced section or a loop item (W-249).
      honeypot(ctx.uniqueId(`emvb-hp-${node.id}`)),
      {
        tag: "div",
        attrs: { class: "ec-form-status", "data-form-status": "", "aria-live": "polite" },
        children: [],
      },
    ],
  };
}

/** Replaces the children of every node matching `match`, anywhere in the tree. */
function replaceChildren(vnode: VNode, match: (node: VNode) => boolean, children: VNode[]): VNode {
  if (match(vnode)) return { ...vnode, children };
  return {
    ...vnode,
    children: vnode.children.map((child) =>
      typeof child === "string" ? child : replaceChildren(child, match, children),
    ),
  };
}

/** Applies `edit` to every element node in the tree, children first. */
function mapNodes(vnode: VNode, edit: (node: VNode) => VNode): VNode {
  return edit({
    ...vnode,
    children: vnode.children.map((child) =>
      typeof child === "string" ? child : mapNodes(child, edit),
    ),
  });
}

/** Definition types a Text input can take on; the rest stay `text`. */
const INPUT_TYPES = new Set(["email", "tel", "url", "number", "date"]);
const LENGTH_TYPES = new Set(["text", "email", "tel", "url", "textarea"]);
const isControl = (node: VNode) =>
  ["input", "select", "textarea"].includes(node.tag) && node.attrs.type !== "hidden";

/**
 * A `pattern` the browser can compile. A group that can repeat and that itself contains `|` or
 * another quantifier (`(a+)+`, `(a|aa)+`) is left off: it can hang the visitor's tab while they
 * type. A pattern that does not compile is left off too.
 */
function hasControlChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** How much of `pattern` at `index` is a quantifier, and whether it can repeat enough to hang. */
function quantifierAt(
  pattern: string,
  index: number,
): { consumed: number; dangerous: boolean; repeats: boolean } {
  const none = { consumed: 0, dangerous: false, repeats: false };
  const ch = pattern[index];
  if (ch === "+" || ch === "*") {
    const lazy = pattern[index + 1] === "?" ? 1 : 0;
    return { consumed: 1 + lazy, dangerous: true, repeats: true };
  }
  if (ch === "?") return { consumed: 1, dangerous: false, repeats: false };
  if (ch !== "{") return none;
  const match = /^\{(\d+)(?:\s*,\s*(\d+)?)?\}\??/.exec(pattern.slice(index));
  if (!match) return none;
  const min = Number(match[1]);
  const hasComma = match[0].includes(",");
  const max =
    match[2] === undefined ? (hasComma ? Number.POSITIVE_INFINITY : min) : Number(match[2]);
  if (max < min) return none;
  return { consumed: match[0].length, dangerous: max > 20, repeats: max > 1 };
}

/**
 * True when a group that contains `|` or a quantifier is itself repeated without a small bound.
 * `(abc)+` and `(https?:\/\/)?` stay allowed.
 */
function repeatsARiskyGroup(pattern: string): boolean {
  const stack: { risky: boolean }[] = [];
  let inClass = false;
  const mark = () => {
    const frame = stack[stack.length - 1];
    if (frame) frame.risky = true;
  };
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "(") {
      stack.push({ risky: false });
      continue;
    }
    if (ch === ")") {
      const frame = stack.pop();
      if (!frame) return true;
      const quantifier = quantifierAt(pattern, i + 1);
      if (quantifier.dangerous && frame.risky) return true;
      if (quantifier.repeats || frame.risky) mark();
      i += quantifier.consumed;
      continue;
    }
    if (ch === "|" || ch === "+" || ch === "*" || ch === "?") {
      mark();
      continue;
    }
    if (ch === "{") {
      const quantifier = quantifierAt(pattern, i);
      if (quantifier.consumed === 0) continue;
      mark();
      i += quantifier.consumed - 1;
    }
  }
  return false;
}

function safeInputPattern(pattern: string): string | undefined {
  const value = pattern.trim();
  if (!value || value.length > 200 || hasControlChar(value)) return undefined;
  if (repeatsARiskyGroup(value)) return undefined;
  try {
    const compiled = new RegExp(value);
    compiled.test("");
  } catch {
    return undefined;
  }
  if (compilesAsPattern(value)) return value;
  const repaired = escapeClassLiterals(value);
  return compilesAsPattern(repaired) ? repaired : undefined;
}

/**
 * W-538: browsers compile `pattern` as `^(?:…)$` with the `v` flag, which refuses a common
 * pattern such as `[A-Za-z0-9_-]+` (a `-` or `(` left bare in a class). The browser then drops
 * the check with a console error, so the field went unchecked.
 */
function compilesAsPattern(value: string): boolean {
  try {
    return new RegExp(`^(?:${value})$`, "v").source.length > 0;
  } catch {
    return false;
  }
}

/** Escapes, inside character classes, the literals `v` mode wants escaped: a loose `-`, ()[]{}/|. */
function escapeClassLiterals(value: string): string {
  let out = "";
  let inClass = false;
  let classStart = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i] as string;
    if (ch === "\\") {
      out += ch + (value[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (!inClass) {
      if (ch === "[") {
        inClass = true;
        out += ch;
        if (value[i + 1] === "^") {
          out += "^";
          i += 1;
        }
        classStart = i + 1;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === "]") {
      inClass = false;
      out += ch;
      continue;
    }
    if (ch === "-") {
      const loose = i === classStart || value[i + 1] === "]";
      out += loose ? "\\-" : ch;
      continue;
    }
    out += "()[{}/|".includes(ch) ? `\\${ch}` : ch;
  }
  return out;
}

/**
 * W-297: what the forms plugin's own embed puts on a control: the input type (so phones show the
 * right keyboard), `required`, and the length, range and pattern limits, plus a visible mark on
 * the label. Without them the forms client found nothing to check before sending.
 */
function withFieldMeta(vnode: VNode, node: LayoutNode, meta: PublicFormField): VNode {
  const type = node.type === "text-input" && INPUT_TYPES.has(meta.type) ? meta.type : undefined;
  const rules = meta.validation ?? {};
  const kind = type ?? (node.type === "textarea" ? "textarea" : meta.type);
  const limits: Record<string, string> = {};
  if (node.type === "text-input" || node.type === "textarea") {
    if (LENGTH_TYPES.has(kind)) {
      if (rules.minLength !== undefined) limits.minlength = String(rules.minLength);
      if (rules.maxLength !== undefined) limits.maxlength = String(rules.maxLength);
    }
    if (kind === "number") {
      if (rules.min !== undefined) limits.min = String(rules.min);
      if (rules.max !== undefined) limits.max = String(rules.max);
    }
    if (node.type === "text-input" && kind !== "number" && kind !== "date" && rules.pattern) {
      const pattern = safeInputPattern(rules.pattern);
      if (pattern) limits.pattern = pattern;
    }
  }
  const mark: VNode = {
    tag: "span",
    attrs: { class: "emvb-form-required", "aria-hidden": "true" },
    children: [" *"],
  };
  return mapNodes(vnode, (child) => {
    if (isControl(child)) {
      return {
        ...child,
        attrs: {
          ...child.attrs,
          ...(type ? { type } : {}),
          ...(meta.required ? { required: "" } : {}),
          ...limits,
        },
      };
    }
    if (!meta.required || (child.tag !== "label" && child.tag !== "legend")) return child;
    if (child.attrs.class === "emvb-form-label") {
      return { ...child, children: [...child.children, mark] };
    }
    // The checkbox label wraps the input and the label text; the mark follows the text.
    // W-441: the same hidden mark as other labels; a plain " *" was read out as "star".
    if (child.attrs.class === "emvb-form-checkbox-label") {
      let last = -1;
      child.children.forEach((part, i) => {
        if (typeof part === "string") last = i;
      });
      if (last === -1) return child;
      const children = [...child.children];
      children.splice(last + 1, 0, mark);
      return { ...child, children };
    }
    return child;
  });
}

/** Fills a field from the form it sits in: options, type, limits. Other forms are left alone. */
export function withFieldOptions(
  vnode: VNode,
  node: LayoutNode,
  definitions: FormDefinitions,
  formId?: string,
): VNode {
  const field = (node.props as { field?: unknown }).field;
  if (typeof field !== "string" || !formId) return vnode;
  const definition = definitions.get(formId);
  if (!definition) return vnode;
  const meta = fieldByName(definition, field);
  if (!meta) return vnode;
  return withFieldMeta(withOptions(vnode, node, meta), node, meta);
}

/** The fieldset that holds a radio group's options. */
const radioGroup = (child: VNode) =>
  child.tag === "fieldset" && (child.attrs.class ?? "").includes("emvb-radio-group");

/** A select or radio field filled with the definition's options. */
function withOptions(vnode: VNode, node: LayoutNode, meta: PublicFormField): VNode {
  const field = meta.name;
  if ((node.type !== "select" && node.type !== "radio") || !meta.options?.length) return vnode;
  if (node.type === "select") {
    return replaceChildren(vnode, (child) => child.tag === "select", [
      { tag: "option", attrs: { value: "" }, children: ["Choose…"] },
      ...meta.options.map((option): VNode => ({
        tag: "option",
        attrs: { value: option.value },
        children: [option.label],
      })),
    ]);
  }
  // W-524: the group's <legend> stays; only the placeholder option is replaced.
  const legend = findNode(vnode, radioGroup)?.children.filter(
    (child): child is VNode => typeof child !== "string" && child.tag === "legend",
  );
  return replaceChildren(vnode, radioGroup, [
    ...(legend ?? []),
    ...meta.options.map((option): VNode => ({
      tag: "label",
      attrs: { class: "emvb-form-radio-label" },
      children: [
        {
          tag: "input",
          attrs: { type: "radio", name: field, value: option.value },
          children: [],
        },
        ` ${option.label}`,
      ],
    })),
  ]);
}

/** The first element node `match` accepts, depth first. */
function findNode(vnode: VNode, match: (node: VNode) => boolean): VNode | undefined {
  if (match(vnode)) return vnode;
  for (const child of vnode.children) {
    if (typeof child === "string") continue;
    const found = findNode(child, match);
    if (found) return found;
  }
  return undefined;
}
