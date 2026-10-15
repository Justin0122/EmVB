import { z } from "zod";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import { CardOverrides, COMPONENT_FIELD_KEY, type LayoutNode } from "../schema/layout.ts";
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
  "terms",
  "cards",
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
  /**
   * W-339: terms of a taxonomy, picked from those its entries use: comma-separated term slugs,
   * as a Loop's `terms` takes them. `collectionField` names the field that picks the collection
   * (else `collection` fixes it), so only that collection's terms are offered.
   */
  z.strictObject({
    ...FieldBase,
    kind: z.literal("terms"),
    taxonomy: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/, "Use a taxonomy name such as tag"),
    collectionField: Key.optional(),
    collection: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/)
      .optional(),
  }),
  /**
   * W-339: a collection Loop's cards arranged by hand: the editor lists the entries the Loop
   * bound to it (`overrides`) shows, to reorder, hide or change one by one.
   */
  z.strictObject({ ...FieldBase, kind: z.literal("cards") }),
]);

const ComponentField = z.union([
  LeafField,
  z.strictObject({
    ...FieldBase,
    kind: z.literal("list"),
    /** The fields of each item; a list doesn't hold lists, or Terms and Cards (W-339). */
    fields: z
      .array(LeafField)
      .min(1)
      .max(12)
      .refine((fields) => fields.every((f) => f.kind !== "terms" && f.kind !== "cards"), {
        message: "List items can't have Terms or Cards fields",
      }),
    /** The most items one use may have. */
    max: z.number().int().min(1).max(50).optional(),
  }),
]);
export type ComponentField = z.infer<typeof ComponentField>;
type LeafField = z.infer<typeof LeafField>;

/** The longest component thumbnail: a media URL, or a small drawing as a data URI. */
export const MAX_COMPONENT_THUMBNAIL = 100_000;
const IMAGE_DATA_URI = /^data:image\/(?:svg\+xml|png|webp|jpeg)(?:;base64)?,/;

/**
 * W-340: a component thumbnail the Add panel can show in an `<img>`: an allowed media URL, or an
 * image as a data URI (an SVG drawing in an `<img>` runs no scripts). Else undefined.
 */
export function componentThumbnail(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value || value.length > MAX_COMPONENT_THUMBNAIL) return undefined;
  if (IMAGE_DATA_URI.test(value)) return value;
  return value.startsWith("data:") ? undefined : sanitizeMediaUrl(value);
}

export const COMPONENT_FIELDS_VERSION = 1;
const ComponentFieldsDoc = z
  .strictObject({
    schemaVersion: z.literal(COMPONENT_FIELDS_VERSION),
    fields: z.array(ComponentField).max(30),
    /** W-340: the picture of the component on its Add panel tile. */
    thumbnail: z
      .string()
      .max(MAX_COMPONENT_THUMBNAIL)
      .refine(
        (value) => componentThumbnail(value) !== undefined,
        "Use an image URL or an image data URI",
      )
      .optional(),
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

/** W-335: `width` and `height` are the image's own size in pixels, when known. */
type ImageValue = { src: string; alt?: string; mediaId?: string; width?: number; height?: number };
type LinkValue = { href: string; newTab?: boolean };

const str = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : undefined;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
/** A size in pixels as the image element takes it, else undefined. */
const pixels = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10000
    ? value
    : undefined;

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
      const width = pixels(raw["width"]);
      const height = pixels(raw["height"]);
      return {
        src,
        ...(alt ? { alt } : {}),
        ...(mediaId ? { mediaId } : {}),
        ...(width && height ? { width, height } : {}),
      } satisfies ImageValue;
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
    case "terms":
      return str(raw, 1000);
    case "cards": {
      const parsed = CardOverrides.safeParse(raw);
      return parsed.success ? parsed.data : undefined;
    }
  }
}

/** Whether a value counts as set, for `show` bindings. */
function isSet(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value.replace(/<[^>]*>/g, "").trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** `path` is where a scope's values sit in the use's values: "" or "buttons.0." (W-324). */
type Scope = { values: Record<string, unknown>; fields: ComponentField[]; path: string };

/**
 * W-324: where an applied element's text comes from: a text or rich-text field of the use, by
 * its path in the use's values ("title", "buttons.0.label"). The canvas edits that field in place.
 */
export type BoundField = {
  path: string;
  kind: "text" | "rich-text";
  /** W-330: the text is an accordion item's question, marked on the question, not the item. */
  on?: "summary";
};

const BOUND = new WeakMap<LayoutNode, BoundField>();

/** The field an element made by `applyComponent` shows as its text, if any (W-324). */
export const boundFieldOf = (node: LayoutNode): BoundField | undefined => BOUND.get(node);

/**
 * W-336: an element made once per list item: the list's path in the use's values ("cards",
 * "groups.0.items") and the item's stored position there. The canvas edits items through it.
 */
export type ListItemMark = { path: string; index: number };

const ITEMS = new WeakMap<LayoutNode, ListItemMark>();

const IMAGES = new WeakMap<LayoutNode, string>();

/** W-337: the image field (its path in the use's values) an image made by `applyComponent` shows. */
export const boundImageOf = (node: LayoutNode): string | undefined => IMAGES.get(node);

/** The list item an element made by `applyComponent` repeats, if any (W-336). */
export const listItemOf = (node: LayoutNode): ListItemMark | undefined => ITEMS.get(node);

/**
 * Props that are an element's whole text. A FAQ item's question (`summary`) or a tab's `label`
 * belongs to the item around it, where a click opens it, so those aren't edited in place (W-327).
 */
const TEXT_TARGETS = new Set(["text", "html"]);

/** The resolved value of `key`: the list item's own field first, then the component's. */
function lookup(
  key: string,
  scopes: Scope[],
): { field: ComponentField; value: unknown; path: string } | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i] as Scope;
    const field = scope.fields.find((f) => f.key === key);
    if (!field) continue;
    const path = `${scope.path}${key}`;
    if (field.kind === "list") {
      const items = Array.isArray(scope.values[key]) ? (scope.values[key] as unknown[]) : [];
      return { field, value: items.filter(isRecord).slice(0, field.max ?? 50), path };
    }
    return { field, value: fieldValue(field, scope.values[key]), path };
  }
  return undefined;
}

/** Sets one bound prop from a field value, if the value fits that prop. */
function bindProp(
  props: Record<string, unknown>,
  target: string,
  field: ComponentField,
  value: unknown,
  type: string,
) {
  if (value === undefined) return;
  if (field.kind === "image" && isRecord(value)) {
    const image = value as ImageValue;
    if (target === "poster") {
      props[target] = image.src;
      return;
    }
    if (target === "src" || target === "url") {
      props[target] = image.src;
      if (image.alt !== undefined) props["alt"] = image.alt;
      if (image.mediaId) props["mediaId"] = image.mediaId;
      if (image.alt) delete props["decorative"];
      // W-335: the image's own size, so the page reserves its space and can keep it that small.
      if (target === "src" && type === "image" && image.width && image.height) {
        props["width"] = image.width;
        props["height"] = image.height;
      }
    }
    return;
  }
  if (field.kind === "link" && isRecord(value)) {
    const link = value as LinkValue;
    props[target] = link.href;
    if (link.newTab) props["newTab"] = true;
    return;
  }
  // W-339: a Loop's hand-made card order and changes.
  if (field.kind === "cards") {
    if (target === "overrides" && isRecord(value)) props[target] = value;
    return;
  }
  // W-331: a choice bound to a number setting (columns, slides in view) sets it as a number.
  if (typeof props[target] === "number" && typeof value === "string") {
    const n = Number(value);
    if (value.trim() !== "" && Number.isFinite(n)) props[target] = n;
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
  const root: Scope = { values: values ?? {}, fields: template.fields, path: "" };
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
      // Bad entries are filtered out before this, so the path uses the item's stored position.
      const stored = componentValueAt(scopes[0]?.values, found.path);
      items.forEach((item, index) => {
        const at = Array.isArray(stored) ? stored.indexOf(item) : -1;
        const position = at < 0 ? index : at;
        const itemScope: Scope = {
          values: item,
          fields: found.field.kind === "list" ? found.field.fields : [],
          path: `${found.path}.${position}.`,
        };
        const copy = applyNode(
          { ...node, bind: withoutKey(bind, "repeat") },
          [...scopes, itemScope],
          `${suffix}-${index + 1}`,
          depth,
        );
        if (copy) {
          ITEMS.set(copy, { path: found.path, index: position });
          out.push(copy);
        }
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
  let bound: BoundField | undefined;
  let image: string | undefined;
  for (const [target, key] of Object.entries(bind)) {
    if (target === "show" || target === "repeat") continue;
    const found = lookup(key, scopes);
    if (!found) continue;
    if (
      TEXT_TARGETS.has(target) &&
      (found.field.kind === "text" || found.field.kind === "rich-text")
    ) {
      bound = { path: found.path, kind: found.field.kind };
    } else if (
      target === "summary" &&
      node.type === "accordion-item" &&
      found.field.kind === "text"
    ) {
      bound = { path: found.path, kind: "text", on: "summary" };
    }
    if (target === "src" && node.type === "image" && found.field.kind === "image") {
      image = found.path;
    }
    if (target === "classes") {
      if (found.field.kind === "select" && typeof found.value === "string") {
        classes = [...(classes ?? []), found.value].slice(0, 20);
      }
      continue;
    }
    bindProp(props, target, found.field, found.value, node.type);
  }
  const { bind: _bind, ...rest } = node;
  const next = {
    ...rest,
    id: suffix ? `${node.id}${suffix}`.slice(0, 24) : node.id,
    props,
    ...(classes ? { classes } : {}),
  } as LayoutNode;
  if (bound) BOUND.set(next, bound);
  if (image) IMAGES.set(next, image);
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

/** The value at a field path in a use's values ("title", "buttons.0.label"), W-324. */
export function componentValueAt(
  values: Record<string, unknown> | undefined,
  path: string,
): unknown {
  let current: unknown = values;
  for (const part of path.split(".")) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (isRecord(current)) current = current[part];
    else return undefined;
  }
  return current;
}

/** The use's values with `value` at `path`; lists and items are copied, never changed (W-324). */
export function withComponentValue(
  values: Record<string, unknown> | undefined,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const [head = "", ...rest] = path.split(".");
  const base = values ?? {};
  if (rest.length === 0) return { ...base, [head]: value };
  const list = base[head];
  const index = Number(rest[0]);
  if (!Array.isArray(list) || !Number.isInteger(index) || !isRecord(list[index])) return base;
  const items = [...list];
  items[index] = withComponentValue(
    list[index] as Record<string, unknown>,
    rest.slice(1).join("."),
    value,
  );
  return { ...base, [head]: items };
}

type ListField = Extract<ComponentField, { kind: "list" }>;

/** W-336: the list field a path in a use's values names ("cards", "groups.0.items"). */
export function listFieldAt(
  fields: readonly ComponentField[],
  path: string,
): ListField | undefined {
  const parts = path.split(".");
  let current = fields;
  for (let i = 0; i < parts.length; i += 2) {
    const field = current.find((f) => f.key === parts[i]);
    if (!field || field.kind !== "list") return undefined;
    if (i === parts.length - 1) return field;
    if (!/^\d+$/.test(parts[i + 1] ?? "")) return undefined;
    current = field.fields;
  }
  return undefined;
}

/** What the canvas and the sidebar do to one item of a component's list (W-336). */
export type ListItemOp = "append" | "add-after" | "duplicate" | "remove" | "move-back" | "move-on";

/**
 * W-336: the use's values with one list item added (empty), duplicated, removed or moved one
 * place, and where that item (or the one now in its place) ends up; null when the list is full
 * or the item can't move further. `index` is the item's stored position; `max` the field's cap.
 */
export function editListItem(
  values: Record<string, unknown> | undefined,
  path: string,
  index: number,
  op: ListItemOp,
  max = 50,
): { values: Record<string, unknown>; index: number } | null {
  const stored = componentValueAt(values, path);
  const list = Array.isArray(stored) ? [...stored] : [];
  const full = list.filter(isRecord).length >= max;
  const has = Number.isInteger(index) && index >= 0 && index < list.length;
  let at = index;
  switch (op) {
    case "append":
      if (full) return null;
      list.push({});
      at = list.length - 1;
      break;
    case "add-after":
    case "duplicate": {
      if (full || !has) return null;
      const copy = op === "duplicate" && isRecord(list[index]) ? structuredClone(list[index]) : {};
      list.splice(index + 1, 0, copy);
      at = index + 1;
      break;
    }
    case "remove":
      if (!has) return null;
      list.splice(index, 1);
      at = Math.min(index, list.length - 1);
      break;
    case "move-back":
    case "move-on": {
      const to = op === "move-back" ? index - 1 : index + 1;
      if (!has || to < 0 || to >= list.length) return null;
      [list[index], list[to]] = [list[to], list[index]];
      at = to;
      break;
    }
  }
  return { values: withComponentValue(values, path, list), index: at };
}
