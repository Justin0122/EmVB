import { z } from "zod";
import { COMPONENT_FIELD_KEY, type LayoutNode } from "../schema/layout.ts";
import { isParentNode } from "../schema/layout.ts";

/**
 * W-312: Components. A `component` theme part is a design (its layout) plus the fields an editor
 * fills in where it is used. Elements in the design bind their props to fields (`node.bind`);
 * `applyComponent` makes the nodes one use renders, with that use's values.
 */

export const COMPONENT_FIELD_KINDS = [
  "text",
  "rich-text",
  "image",
  "link",
  "select",
  "toggle",
  "list",
] as const;
export type ComponentFieldKind = (typeof COMPONENT_FIELD_KINDS)[number];

const Key = z.string().regex(COMPONENT_FIELD_KEY, "Use a key such as body");
const Label = z.string().trim().min(1).max(80);
const Option = z.strictObject({
  value: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  label: Label,
});

const FieldBase = {
  key: Key,
  label: Label,
  /** Shown under the field in the settings panel. */
  help: z.string().max(300).optional(),
};

const LeafField = z.discriminatedUnion("kind", [
  z.strictObject({
    ...FieldBase,
    kind: z.literal("text"),
    default: z.string().max(2000).optional(),
  }),
  z.strictObject({
    ...FieldBase,
    kind: z.literal("rich-text"),
    default: z.string().max(20_000).optional(),
  }),
  z.strictObject({ ...FieldBase, kind: z.literal("image") }),
  z.strictObject({ ...FieldBase, kind: z.literal("link") }),
  z.strictObject({
    ...FieldBase,
    kind: z.literal("select"),
    options: z.array(Option).min(1).max(20),
    default: z.string().max(40).optional(),
  }),
  z.strictObject({ ...FieldBase, kind: z.literal("toggle"), default: z.boolean().optional() }),
]);

const ComponentField = z.union([
  LeafField,
  z.strictObject({
    ...FieldBase,
    kind: z.literal("list"),
    /** The fields of each item; a list doesn't hold lists. */
    fields: z.array(LeafField).min(1).max(12),
    /** The most items one use may have. */
    max: z.number().int().min(1).max(50).optional(),
  }),
]);
export type ComponentField = z.infer<typeof ComponentField>;
type LeafField = z.infer<typeof LeafField>;

export const COMPONENT_FIELDS_VERSION = 1;
export const ComponentFieldsDoc = z
  .strictObject({
    schemaVersion: z.literal(COMPONENT_FIELDS_VERSION),
    fields: z.array(ComponentField).max(30),
  })
  .refine((doc) => new Set(doc.fields.map((f) => f.key)).size === doc.fields.length, {
    message: "Field keys must be unique",
  });
export type ComponentFieldsDoc = z.infer<typeof ComponentFieldsDoc>;

export const emptyComponentFields = (): ComponentFieldsDoc => ({ schemaVersion: 1, fields: [] });

export function validateComponentFields(
  raw: unknown,
): { ok: true; doc: ComponentFieldsDoc } | { ok: false; message: string } {
  const result = ComponentFieldsDoc.safeParse(raw);
  if (result.success) return { ok: true, doc: result.data };
  return {
    ok: false,
    message: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}

/** The published design and fields of one component, as the renderer gets them. */
export type ComponentTemplate = { nodes: LayoutNode[]; fields: ComponentField[] };

type ImageValue = { src: string; alt?: string; mediaId?: string };
type LinkValue = { href: string; newTab?: boolean };

const str = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : undefined;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** A stored value as its field's kind expects it, else the field's default, else undefined. */
export function fieldValue(field: LeafField, raw: unknown): unknown {
  switch (field.kind) {
    case "text":
      return str(raw, 2000) ?? field.default;
    case "rich-text":
      return str(raw, 100_000) ?? field.default;
    case "image": {
      if (!isRecord(raw)) return undefined;
      const src = str(raw["src"], 2000);
      if (!src) return undefined;
      const alt = str(raw["alt"], 500);
      const mediaId = str(raw["mediaId"], 128);
      return { src, ...(alt ? { alt } : {}), ...(mediaId ? { mediaId } : {}) } satisfies ImageValue;
    }
    case "link": {
      const href = isRecord(raw) ? str(raw["href"], 2000) : str(raw, 2000);
      if (!href) return undefined;
      return {
        href,
        ...(isRecord(raw) && raw["newTab"] === true ? { newTab: true } : {}),
      } satisfies LinkValue;
    }
    case "select": {
      const value = str(raw, 40);
      return field.options.some((o) => o.value === value)
        ? value
        : (field.default ?? field.options[0]?.value);
    }
    case "toggle":
      return typeof raw === "boolean" ? raw : (field.default ?? false);
  }
}

/** Whether a value counts as set, for `show` bindings. */
function isSet(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value.replace(/<[^>]*>/g, "").trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

type Scope = { values: Record<string, unknown>; fields: ComponentField[] };

/** The resolved value of `key`: the list item's own field first, then the component's. */
function lookup(
  key: string,
  scopes: Scope[],
): { field: ComponentField; value: unknown } | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i] as Scope;
    const field = scope.fields.find((f) => f.key === key);
    if (!field) continue;
    if (field.kind === "list") {
      const items = Array.isArray(scope.values[key]) ? (scope.values[key] as unknown[]) : [];
      return { field, value: items.filter(isRecord).slice(0, field.max ?? 50) };
    }
    return { field, value: fieldValue(field, scope.values[key]) };
  }
  return undefined;
}

/** Sets one bound prop from a field value, if the value fits that prop. */
function bindProp(
  props: Record<string, unknown>,
  target: string,
  field: ComponentField,
  value: unknown,
) {
  if (value === undefined) return;
  if (field.kind === "image" && isRecord(value)) {
    const image = value as ImageValue;
    if (target === "src" || target === "url") {
      props[target] = image.src;
      if (image.alt !== undefined) props["alt"] = image.alt;
      if (image.mediaId) props["mediaId"] = image.mediaId;
      if (image.alt) delete props["decorative"];
    }
    return;
  }
  if (field.kind === "link" && isRecord(value)) {
    const link = value as LinkValue;
    props[target] = link.href;
    if (link.newTab) props["newTab"] = true;
    return;
  }
  if (typeof value === "string" || typeof value === "boolean") props[target] = value;
}

/**
 * The nodes one use of a component renders: the design's nodes with bound props filled in,
 * `show`-bound elements left out when their field is empty, `repeat`-bound elements once per list
 * item (ids suffixed so each copy stays unique) and `classes`-bound ones given the chosen option.
 */
export function applyComponent(
  template: ComponentTemplate,
  values: Record<string, unknown> | undefined,
): LayoutNode[] {
  const root: Scope = { values: values ?? {}, fields: template.fields };
  return applyNodes(template.nodes, [root], "", 0);
}

const MAX_COPIES = 400;

function applyNodes(
  nodes: LayoutNode[],
  scopes: Scope[],
  suffix: string,
  depth: number,
): LayoutNode[] {
  const out: LayoutNode[] = [];
  for (const node of nodes) {
    const bind = node.bind ?? {};
    const repeatKey = bind["repeat"];
    if (repeatKey) {
      const found = lookup(repeatKey, scopes);
      if (!found || found.field.kind !== "list") continue;
      const items = (found.value as Record<string, unknown>[]).slice(0, MAX_COPIES);
      items.forEach((item, index) => {
        const itemScope: Scope = {
          values: item,
          fields: found.field.kind === "list" ? found.field.fields : [],
        };
        const copy = applyNode(
          { ...node, bind: withoutKey(bind, "repeat") },
          [...scopes, itemScope],
          `${suffix}-${index + 1}`,
          depth,
        );
        if (copy) out.push(copy);
      });
      continue;
    }
    const applied = applyNode(node, scopes, suffix, depth);
    if (applied) out.push(applied);
  }
  return out;
}

const withoutKey = (bind: Record<string, string>, key: string) => {
  const { [key]: _removed, ...rest } = bind;
  return rest;
};

function applyNode(
  node: LayoutNode,
  scopes: Scope[],
  suffix: string,
  depth: number,
): LayoutNode | null {
  const bind = node.bind ?? {};
  const showKey = bind["show"];
  if (showKey && !isSet(lookup(showKey, scopes)?.value)) return null;
  const props = { ...(node.props as Record<string, unknown>) };
  let classes = node.classes;
  for (const [target, key] of Object.entries(bind)) {
    if (target === "show" || target === "repeat") continue;
    const found = lookup(key, scopes);
    if (!found) continue;
    if (target === "classes") {
      if (found.field.kind === "select" && typeof found.value === "string") {
        classes = [...(classes ?? []), found.value].slice(0, 20);
      }
      continue;
    }
    bindProp(props, target, found.field, found.value);
  }
  const { bind: _bind, ...rest } = node;
  const next = {
    ...rest,
    id: suffix ? `${node.id}${suffix}`.slice(0, 24) : node.id,
    props,
    ...(classes ? { classes } : {}),
  } as LayoutNode;
  if (isParentNode(next)) {
    (next as { children: LayoutNode[] }).children = applyNodes(
      next.children,
      scopes,
      suffix,
      depth + 1,
    );
  }
  return next;
}

/** The component part ids a layout's `component` elements use. */
export function collectComponentPartIds(nodes: readonly LayoutNode[]): string[] {
  const ids = new Set<string>();
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop() as LayoutNode;
    if (node.type === "component") {
      const id = (node.props as { partId?: string }).partId?.trim();
      if (id) ids.add(id);
    }
    if (isParentNode(node)) stack.push(...node.children);
  }
  return [...ids];
}
