import { z } from "zod";
import {
  byteLength,
  defaultElement,
  findNode,
  MAX_LAYOUT_BYTES,
  nestingIssues,
  recipeNode,
  SECTION_RECIPES,
  summarizeIssues,
  validateDesign,
  validateLayout,
  type DesignSystem,
  type ElementType,
  type Layout,
  type LayoutNode,
} from "../core/index.ts";
import { addNode, moveNode, withFreshIds } from "../core/arrange.ts";
import { ELEMENT_DESCRIPTORS } from "../core/elements/index.ts";
import { removeNode, slugify, starterLayout, updateNode } from "../core/tree-ops.ts";
import { McpToolError } from "./errors.ts";
import type { EmvbPorts } from "./ports.ts";
import { queued } from "./queue.ts";

const PageId = z.string().min(1).max(128);
const NodeIdInput = z.string().min(1).max(64);
const Rev = z.string().min(1).max(256);

/** The editor's save checks, run here because plugin writes skip `content:beforeSave` (R1 P0b). */
function checkLayout(candidate: unknown): Layout {
  const result = validateLayout(candidate);
  if (!result.ok) {
    throw new McpToolError(
      "INVALID_LAYOUT",
      `The layout is invalid. ${summarizeIssues(result.issues)}`,
      { issues: result.issues.slice(0, 10) },
    );
  }
  const misplaced = nestingIssues(result.layout, 3);
  if (misplaced.length > 0) {
    throw new McpToolError(
      "NESTING",
      `Elements are in the wrong place. ${misplaced.map((issue) => issue.message).join("; ")}`,
    );
  }
  const bytes = byteLength(result.layout);
  if (bytes > MAX_LAYOUT_BYTES) {
    throw new McpToolError(
      "TOO_LARGE",
      `The page would be ${bytes} bytes; the limit is ${MAX_LAYOUT_BYTES}.`,
    );
  }
  return result.layout;
}

type WriteResult = { pageId: string; rev: string; changed: string[]; summary: string };

export const WriteOutput = z.object({
  pageId: z.string(),
  rev: z.string(),
  changed: z.array(z.string()),
  summary: z.string(),
});

/**
 * Read → apply → validate → save with `_rev`, one write per page at a time (D-058). Without
 * `expectedRev`, a conflict re-reads and re-applies the operation once; with it, never.
 */
async function mutatePage(
  ports: EmvbPorts,
  tool: string,
  pageId: string,
  expectedRev: string | undefined,
  apply: (layout: Layout) => { layout: Layout; changed: string[]; summary: string },
): Promise<WriteResult> {
  return queued(`page:${pageId}`, async () => {
    // The retry must read, write and log in order.
    /* oxlint-disable no-await-in-loop */
    for (let attempt = 0; ; attempt++) {
      const page = await ports.getPage(pageId);
      if (!page)
        throw new McpToolError("NOT_FOUND", `No EmVB page with id ${pageId}. Call list_pages.`);
      if (expectedRev !== undefined && page.rev !== expectedRev) {
        throw new McpToolError(
          "CONFLICT",
          "The page changed since you read it. Call get_layout again and retry.",
          { rev: page.rev },
        );
      }
      const current = validateLayout(page.layout);
      if (!current.ok) {
        throw new McpToolError(
          "INVALID_LAYOUT",
          "The stored layout can't be read. Repair it in the editor.",
        );
      }
      const next = apply(current.layout);
      const layout = checkLayout(next.layout);
      try {
        const saved = await ports.savePage(pageId, { layout }, page.rev);
        await ports.log({
          target: "page",
          tool,
          pageId,
          rev: saved.rev,
          ...(saved.revisionId ? { revisionId: saved.revisionId } : {}),
          summary: next.summary,
        });
        return { pageId, rev: saved.rev, changed: next.changed, summary: next.summary };
      } catch (error) {
        const retry = error instanceof McpToolError && error.code === "CONFLICT";
        if (!retry || expectedRev !== undefined || attempt >= 1) throw error;
      }
    }
  });
}

const refused = (reason: string): never => {
  throw new McpToolError("REFUSED", reason);
};

const KNOWN_TYPES = new Set(ELEMENT_DESCRIPTORS.map((d) => d.type));

/** An element from the agent: its type's defaults, the given props and fields, fresh ids. */
const ElementSpec: z.ZodType<ElementSpecT> = z.lazy(() =>
  z.looseObject({
    type: z.string().min(1).max(64),
    props: z.record(z.string(), z.unknown()).optional(),
    children: z.array(ElementSpec).max(200).optional(),
  }),
);
type ElementSpecT = { type: string; props?: Record<string, unknown>; children?: ElementSpecT[] };

function buildNode(spec: ElementSpecT): LayoutNode {
  if (!KNOWN_TYPES.has(spec.type)) {
    refused(`Unknown element type ${spec.type}. Call list_element_types.`);
  }
  const { type, props, children, ...rest } = spec;
  delete (rest as { id?: unknown }).id;
  const base = defaultElement(type as ElementType, "new") as LayoutNode & {
    props?: Record<string, unknown>;
  };
  const node = { ...base, ...rest, props: { ...base.props, ...props } } as LayoutNode;
  if (children) (node as { children: LayoutNode[] }).children = children.map(buildNode);
  return node;
}

const arranged = (result: { ok: true; layout: Layout } | { ok: false; reason: string }): Layout =>
  result.ok ? result.layout : refused(result.reason);

// ---------------------------------------------------------------- create_page

export const CreatePageInput = z.strictObject({
  title: z.string().trim().min(1).max(200),
  recipes: z
    .array(z.enum(SECTION_RECIPES.map((r) => r.id) as [string, ...string[]]))
    .max(12)
    .optional(),
});
export const CreatePageOutput = z.object({ pageId: z.string(), slug: z.string(), rev: z.string() });

export async function createPage(ports: EmvbPorts, input: z.infer<typeof CreatePageInput>) {
  // EmDash derives the slug from the title; refuse a title whose slug is already taken.
  const slug = slugify(input.title);
  if (!slug) refused("Give the page a title with letters or digits.");
  const { design } = await ports.getDesign();
  let layout = starterLayout(input.title);
  for (const id of input.recipes ?? []) {
    const node = recipeNode(id, design, layout);
    if (node)
      layout = arranged(
        addNode(layout, withFreshIds(layout, node), {
          parentId: layout.root.id,
          index: Number.MAX_SAFE_INTEGER,
        }),
      );
  }
  const checked = checkLayout(layout);
  const taken = await ports.listPages({ limit: 50 });
  if (taken.pages.some((page) => page.slug === slug)) {
    throw new McpToolError("REFUSED", `The slug "${slug}" is taken. Choose another title.`);
  }
  const created = await ports.createPage({ title: input.title, layout: checked });
  await ports.log({
    target: "page",
    tool: "create_page",
    pageId: created.id,
    rev: created.rev,
    summary: `Created page "${input.title}"`,
  });
  return { pageId: created.id, slug: created.slug || slug, rev: created.rev };
}

// ---------------------------------------------------------------- add / move / update / remove

export const AddElementInput = z.strictObject({
  pageId: PageId,
  parentId: NodeIdInput,
  index: z.number().int().min(0).optional(),
  element: ElementSpec,
  expectedRev: Rev.optional(),
});

export const addElement = (ports: EmvbPorts, input: z.infer<typeof AddElementInput>) =>
  mutatePage(ports, "add_element", input.pageId, input.expectedRev, (layout) => {
    const node = withFreshIds(layout, buildNode(input.element));
    const next = arranged(
      addNode(layout, node, {
        parentId: input.parentId,
        index: input.index ?? Number.MAX_SAFE_INTEGER,
      }),
    );
    return { layout: next, changed: [node.id], summary: `Added ${node.type} ${node.id}` };
  });

export const MoveElementInput = z.strictObject({
  pageId: PageId,
  nodeId: NodeIdInput,
  parentId: NodeIdInput,
  index: z.number().int().min(0),
  expectedRev: Rev.optional(),
});

export const moveElement = (ports: EmvbPorts, input: z.infer<typeof MoveElementInput>) =>
  mutatePage(ports, "move_element", input.pageId, input.expectedRev, (layout) => ({
    layout: arranged(moveNode(layout, input.nodeId, input.parentId, input.index)),
    changed: [input.nodeId],
    summary: `Moved ${input.nodeId}`,
  }));

const SETTABLE = [
  "props",
  "style",
  "states",
  "devices",
  "attributes",
  "hiddenOn",
  "classes",
  "htmlId",
  "label",
  "bind",
  "audience",
  "dir",
  "container",
  "query",
] as const;

export const UpdateElementInput = z.strictObject({
  pageId: PageId,
  nodeId: NodeIdInput,
  set: z
    .strictObject(Object.fromEntries(SETTABLE.map((key) => [key, z.unknown().optional()])))
    .optional(),
  unset: z
    .array(z.string().regex(/^[a-zA-Z]+(\.[a-zA-Z0-9_-]+)?$/))
    .max(50)
    .optional(),
  expectedRev: Rev.optional(),
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const updateElement = (ports: EmvbPorts, input: z.infer<typeof UpdateElementInput>) =>
  mutatePage(ports, "update_element", input.pageId, input.expectedRev, (layout) => {
    if (!findNode(layout, input.nodeId))
      refused(`No element with id ${input.nodeId} on this page.`);
    const next = updateNode(layout, input.nodeId, (node) => {
      const copy = structuredClone(node) as Record<string, unknown>;
      for (const [key, value] of Object.entries(input.set ?? {})) {
        if (value === undefined) continue;
        // Objects merge one level deep, like the editor's panels; anything else replaces.
        copy[key] = isRecord(value) && isRecord(copy[key]) ? { ...copy[key], ...value } : value;
      }
      for (const path of input.unset ?? []) {
        const [top, sub] = path.split(".") as [string, string | undefined];
        if (top === "id" || top === "type" || top === "children") continue;
        if (sub === undefined) delete copy[top];
        else if (isRecord(copy[top])) delete copy[top][sub];
      }
      return copy as LayoutNode;
    });
    return { layout: next, changed: [input.nodeId], summary: `Updated ${input.nodeId}` };
  });

export const RemoveElementInput = z.strictObject({
  pageId: PageId,
  nodeId: NodeIdInput,
  expectedRev: Rev.optional(),
});

export const removeElement = (ports: EmvbPorts, input: z.infer<typeof RemoveElementInput>) =>
  mutatePage(ports, "remove_element", input.pageId, input.expectedRev, (layout) => {
    if (layout.root.id === input.nodeId) refused("The page root can't be removed.");
    const { layout: next, removed } = removeNode(layout, input.nodeId);
    if (!removed) refused(`No element with id ${input.nodeId} on this page.`);
    return {
      layout: next,
      changed: [input.nodeId],
      summary: `Removed ${removed?.node.type} ${input.nodeId}`,
    };
  });

// ---------------------------------------------------------------- apply_section_recipe

export const ApplyRecipeInput = z.strictObject({
  pageId: PageId,
  recipeId: z.enum(SECTION_RECIPES.map((r) => r.id) as [string, ...string[]]),
  parentId: NodeIdInput.optional(),
  index: z.number().int().min(0).optional(),
  expectedRev: Rev.optional(),
});

export async function applySectionRecipe(
  ports: EmvbPorts,
  input: z.infer<typeof ApplyRecipeInput>,
) {
  const { design } = await ports.getDesign();
  return mutatePage(ports, "apply_section_recipe", input.pageId, input.expectedRev, (layout) => {
    const built = recipeNode(input.recipeId, design, layout);
    if (!built) return refused(`Unknown recipe ${input.recipeId}.`);
    const node = withFreshIds(layout, built);
    const next = arranged(
      addNode(layout, node, {
        parentId: input.parentId ?? layout.root.id,
        index: input.index ?? Number.MAX_SAFE_INTEGER,
      }),
    );
    return {
      layout: next,
      changed: [node.id],
      summary: `Added the ${input.recipeId} section ${node.id}`,
    };
  });
}

// ---------------------------------------------------------------- restore_version

export const RestoreVersionInput = z.strictObject({
  pageId: PageId,
  revisionId: z.string().min(1).max(128),
  expectedRev: Rev.optional(),
});

export async function restoreVersion(ports: EmvbPorts, input: z.infer<typeof RestoreVersionInput>) {
  const data = await ports.getRevisionData(input.pageId, input.revisionId);
  if (!data)
    throw new McpToolError(
      "NOT_FOUND",
      `No version ${input.revisionId} of this page. Call list_versions.`,
    );
  let raw = data["layout"];
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      raw = undefined;
    }
  }
  const restored = checkLayout(raw);
  return mutatePage(ports, "restore_version", input.pageId, input.expectedRev, () => ({
    layout: restored,
    changed: [restored.root.id],
    summary: `Restored version ${input.revisionId}`,
  }));
}

// ---------------------------------------------------------------- update_site_styles

const VARIABLE_KINDS = ["colors", "fonts", "fontSizes", "spacings"] as const;
type Item = { id: string } & Record<string, unknown>;
const Items = z.array(z.looseObject({ id: z.string().min(1).max(64) })).max(100);

export const UpdateSiteStylesInput = z.strictObject({
  variables: z
    .strictObject(Object.fromEntries(VARIABLE_KINDS.map((k) => [k, Items.optional()])))
    .optional(),
  removeVariables: z
    .array(z.strictObject({ kind: z.enum(VARIABLE_KINDS), id: z.string().min(1).max(64) }))
    .max(100)
    .optional(),
  classes: Items.optional(),
  removeClasses: z.array(z.string().min(1).max(64)).max(100).optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
  direction: z.enum(["ltr", "rtl", "auto"]).optional(),
  expectedRevision: z.string().max(256).nullable().optional(),
});
export const UpdateSiteStylesOutput = z.object({ revision: z.string(), summary: z.string() });

const upsert = (list: Item[] | undefined, items: Item[]): Item[] => {
  const next = [...(list ?? [])];
  for (const item of items) {
    const at = next.findIndex((existing) => existing.id === item.id);
    if (at === -1) next.push(item);
    else next[at] = { ...next[at], ...item };
  }
  return next;
};

/** Writes the style draft only; publishing site styles is a separate, gated tool (D-055). */
export async function updateSiteStyles(
  ports: EmvbPorts,
  input: z.infer<typeof UpdateSiteStylesInput>,
) {
  return queued("styles", async () => {
    const state = await ports.getDesign();
    if (input.expectedRevision !== undefined && input.expectedRevision !== state.revision) {
      throw new McpToolError(
        "CONFLICT",
        "Site styles changed since you read them. Call get_site_styles again.",
      );
    }
    const draft = structuredClone(state.design) as unknown as Record<string, unknown> & {
      variables: Record<string, Item[] | undefined>;
      classes?: Item[];
      defaults?: Record<string, unknown>;
    };
    const changes: string[] = [];
    for (const kind of VARIABLE_KINDS) {
      const items = input.variables?.[kind] as Item[] | undefined;
      if (items?.length) {
        draft.variables[kind] = upsert(draft.variables[kind], items);
        changes.push(`${items.length} ${kind}`);
      }
    }
    for (const { kind, id } of input.removeVariables ?? []) {
      draft.variables[kind] = (draft.variables[kind] ?? []).filter((v) => v.id !== id);
      changes.push(`removed ${kind} ${id}`);
    }
    if (input.classes?.length) {
      draft.classes = upsert(draft.classes, input.classes as Item[]);
      changes.push(`${input.classes.length} classes`);
    }
    if (input.removeClasses?.length) {
      draft.classes = (draft.classes ?? []).filter((c) => !input.removeClasses?.includes(c.id));
      changes.push(`removed ${input.removeClasses.length} classes`);
    }
    if (input.defaults) {
      draft.defaults = { ...draft.defaults, ...input.defaults };
      changes.push("tag defaults");
    }
    if (input.direction) {
      draft["direction"] = input.direction;
      changes.push(`direction ${input.direction}`);
    }
    if (changes.length === 0) refused("Nothing to change.");
    const result = validateDesign(draft);
    if (!result.ok) {
      throw new McpToolError(
        "INVALID_INPUT",
        `The site styles would be invalid. ${summarizeIssues(result.issues)}`,
      );
    }
    const saved = await ports.saveDesign(result.design as DesignSystem, state.revision);
    const summary = `Site styles draft: ${changes.join(", ")}`;
    await ports.log({ target: "styles", tool: "update_site_styles", summary });
    return { revision: saved.revision, summary };
  });
}
