import { PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { PAGES_COLLECTION, DESIGN_DRAFT_KEY, DESIGN_KEY } from "../constants.ts";
import { McpToolError } from "../mcp/errors.ts";
import type { EmvbPorts, PageRecord, PageSummary } from "../mcp/ports.ts";
import type { ToolDef } from "../mcp/tools.ts";
import { readDesign, writeDesignDraft } from "./design-routes.ts";
import { McpToolError as ToolError } from "../mcp/errors.ts";

type Item = {
  id: string;
  slug: string | null;
  status: string;
  data: Record<string, unknown>;
  updatedAt: string;
  publishedAt: string | null;
  draftRevisionId?: string | null;
  liveRevisionId?: string | null;
};

type Content = {
  list(
    c: string,
    o: { limit?: number; cursor?: string },
  ): Promise<{
    items: Item[];
    cursor?: string;
    hasMore: boolean;
  }>;
  getVersioned?(c: string, id: string): Promise<{ item: Item; _rev: string } | null>;
  listRevisions?(
    c: string,
    id: string,
    o: { limit?: number },
  ): Promise<{ id: string; createdAt: string; authorId?: string | null }[]>;
  getRevision?(
    c: string,
    id: string,
    revisionId: string,
  ): Promise<{ data: Record<string, unknown> } | null>;
  update(c: string, id: string, data: Record<string, unknown>): Promise<Item>;
  create(c: string, data: Record<string, unknown>): Promise<Item>;
};

type LogStore = { put(id: string, data: unknown): Promise<void> };

const parseJson = (raw: unknown) => {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const summary = (item: Item): PageSummary => ({
  id: item.id,
  title: typeof item.data["title"] === "string" ? item.data["title"] : "Untitled page",
  slug: item.slug ?? "",
  status: item.status,
  hasDraft: Boolean(item.draftRevisionId && item.draftRevisionId !== item.liveRevisionId),
  updatedAt: item.updatedAt,
});

/** The tool core's ports on a plugin route (D-053, R1 save path). */
function pluginPorts(ctx: RouteContext<unknown>): EmvbPorts {
  const content = ctx.content as unknown as Content | undefined;
  if (!content) throw new McpToolError("FORBIDDEN", "EmVB has no content access on this site.");
  const versioned = (id: string) =>
    content.getVersioned ? content.getVersioned(PAGES_COLLECTION, id) : Promise.resolve(null);
  return {
    caller: { userId: ctx.user?.id ?? null, role: Number(ctx.user?.role ?? 0) },
    async listPages({ cursor, limit }) {
      const result = await content.list(PAGES_COLLECTION, { limit, ...(cursor ? { cursor } : {}) });
      return {
        pages: result.items.map(summary),
        ...(result.hasMore && result.cursor ? { nextCursor: result.cursor } : {}),
      };
    },
    async getPage(id): Promise<PageRecord | null> {
      const found = content.getVersioned ? await content.getVersioned(PAGES_COLLECTION, id) : null;
      if (!found) return null;
      return {
        ...summary(found.item),
        layout: parseJson(found.item.data["layout"]),
        rev: found["_rev"],
      };
    },
    async listRevisions(id, limit) {
      const list = content.listRevisions
        ? await content.listRevisions(PAGES_COLLECTION, id, { limit })
        : [];
      return list.map((r) => ({ id: r.id, createdAt: r.createdAt, authorId: r.authorId ?? null }));
    },
    async getRevisionData(id, revisionId) {
      const revision = content.getRevision
        ? await content.getRevision(PAGES_COLLECTION, id, revisionId)
        : null;
      return revision?.data ?? null;
    },
    async savePage(id, patch, expectedRev) {
      const current = await versioned(id);
      if (!current) throw new ToolError("NOT_FOUND", `No EmVB page with id ${id}.`);
      if (current["_rev"] !== expectedRev) {
        throw new ToolError("CONFLICT", "The page changed since it was read.", {
          rev: current["_rev"],
        });
      }
      await content.update(PAGES_COLLECTION, id, {
        ...(patch.layout ? { layout: patch.layout } : {}),
        ...(patch.title ? { title: patch.title } : {}),
      });
      const after = await versioned(id);
      return {
        rev: after?.["_rev"] ?? "",
        ...(after?.item.draftRevisionId ? { revisionId: after.item.draftRevisionId } : {}),
      };
    },
    async createPage({ title, layout }) {
      // Plugins can't choose a slug on create; EmDash derives it from the title.
      const item = await content.create(PAGES_COLLECTION, { title, layout });
      const after = await versioned(item.id);
      return { id: item.id, slug: String(item.slug ?? ""), rev: after?.["_rev"] ?? "" };
    },
    async saveDesign(design, expectedRevision) {
      const written = await writeDesignDraft(ctx, design, expectedRevision, "agent");
      if (!written) throw new ToolError("CONFLICT", "Site styles changed since they were read.");
      return { revision: written };
    },
    async log(entry) {
      const at = new Date().toISOString();
      const store = ctx.storage["agentlog"] as unknown as LogStore;
      await store.put(`${at}-${crypto.randomUUID().slice(0, 8)}`, {
        ...entry,
        at,
        userId: ctx.user?.id ?? null,
        client: (ctx.request.headers.get("user-agent") ?? "").slice(0, 120),
      });
    },
    async getDesign() {
      const published = await readDesign(ctx, DESIGN_KEY);
      const draft = await readDesign(ctx, DESIGN_DRAFT_KEY);
      if (draft.status !== "ok") {
        return {
          design: published.design,
          revision: draft.revision,
          publishedRevision: published.revision,
          unpublished: false,
        };
      }
      return {
        design: draft.design,
        revision: draft.revision,
        publishedRevision: published.revision,
        unpublished: JSON.stringify(draft.design) !== JSON.stringify(published.design),
      };
    },
  };
}

/** Routes `mcp/<tool>`: editors and above (D-056), POST JSON, one per tool (R1 D-054). */
export function mcpRoutes(tools: readonly ToolDef[]): Record<string, PluginRoute> {
  return Object.fromEntries(
    tools.map((tool) => [
      `mcp/${tool.name}`,
      {
        permission: "content:edit_any",
        input: tool.input,
        handler: async (ctx: RouteContext<unknown>) => {
          try {
            return await tool.run(pluginPorts(ctx), ctx.input as never);
          } catch (error) {
            if (error instanceof McpToolError) {
              throw new PluginRouteError(error.code, error.message, error.status);
            }
            throw error;
          }
        },
      } satisfies PluginRoute,
    ]),
  );
}

/** `definePlugin({ mcp })`: EmDash lists these on /_emdash/api/mcp as `emvb__<name>`. */
export function mcpToolConfig(tools: readonly ToolDef[]) {
  return {
    tools: Object.fromEntries(
      tools.map((tool) => [
        tool.name,
        {
          description: tool.description,
          route: `mcp/${tool.name}`,
          input: tool.input,
          output: tool.output,
          destructive: tool.destructive,
        },
      ]),
    ),
  };
}
