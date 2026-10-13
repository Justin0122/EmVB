import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import { visibleTools } from "../../src/mcp/tools.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
});
afterEach(async () => {
  await t.dispose();
});

type Result = { success: boolean; data?: unknown; error?: { code: string; message: string } };
const run = (tool: string, input: unknown) => t.mcp(tool, input) as Promise<Result>;
const newPage = async () => {
  const created = (await t.savePage({ title: "Home", layout: s1Page() })) as {
    data: { item: { id: string } };
  };
  return created.data.item.id;
};
const rev = async (pageId: string) => {
  const result = await run("get_layout", { pageId });
  return (result.data as { rev: string }).rev;
};

describe("Agent settings and the publish gate (W-463, W-464, D-055)", () => {
  test("every tool is refused while the master switch is off (the default)", async () => {
    const result = await run("list_pages", {});
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("Agents");
  });

  test("only admins can read or change the agent settings", async () => {
    const editor = await t.route("agents", { user: userWithRole(ROLES.editor) });
    expect(editor.status).toBe(403);
    const save = await t.route("agents/save", {
      user: userWithRole(ROLES.editor),
      body: {
        settings: { mcpEnabled: true, publishPages: true, publishStyles: true },
        revision: null,
      },
    });
    expect(save.status).toBe(403);
    const admin = await t.route("agents", { user: userWithRole(ROLES.admin) });
    expect(admin.status).toBe(200);
    const data = admin.body["data"] as { settings: { mcpEnabled: boolean }; endpoint: string };
    expect(data.settings.mcpEnabled).toBe(false);
    expect(data.endpoint).toEndWith("/_emdash/api/mcp");
  });

  test("publish_page is refused until publishing is allowed, then publishes the draft", async () => {
    await t.agentSettings();
    const pageId = await newPage();
    const refused = await run("publish_page", {
      pageId,
      expectedRev: await rev(pageId),
      confirm: true,
    });
    expect(refused.error?.code).toBe("PUBLISH_DISABLED");

    await t.agentSettings({ publishPages: true });
    const ok = await run("publish_page", { pageId, expectedRev: await rev(pageId), confirm: true });
    expect(ok.success).toBe(true);
    const pages = (await run("list_pages", {})).data as { pages: { id: string; status: string }[] };
    expect(pages.pages.find((p) => p.id === pageId)?.status).toBe("published");
  });

  test("publish_page with a stale rev is a conflict", async () => {
    await t.agentSettings({ publishPages: true });
    const pageId = await newPage();
    const stale = await rev(pageId);
    const { layout } = (await run("get_layout", { pageId })).data as {
      layout: { root: { id: string } };
    };
    await run("add_element", { pageId, parentId: layout.root.id, element: { type: "heading" } });
    const result = await run("publish_page", { pageId, expectedRev: stale, confirm: true });
    expect(result.error?.code).toBe("CONFLICT");
  });

  test("publish_site_styles is gated separately and publishes the style draft", async () => {
    await t.agentSettings({ publishPages: true });
    await run("update_site_styles", {
      variables: { colors: [{ id: "accent2", name: "Accent 2", value: "#112233" }] },
    });
    const styles = (await run("get_site_styles", {})).data as { publishedRevision: string | null };
    const refused = await run("publish_site_styles", {
      expectedPublishedRevision: styles.publishedRevision,
      confirm: true,
    });
    expect(refused.error?.code).toBe("PUBLISH_DISABLED");
    await t.agentSettings({ publishPages: true, publishStyles: true });
    const ok = await run("publish_site_styles", {
      expectedPublishedRevision: styles.publishedRevision,
      confirm: true,
    });
    expect(ok.success).toBe(true);
  });

  test("publish tools are only listed while their setting is on", () => {
    const names = (s: { publishPages: boolean; publishStyles: boolean }) =>
      visibleTools(s).map((tool) => tool.name);
    expect(names({ publishPages: false, publishStyles: false })).not.toContain("publish_page");
    expect(names({ publishPages: true, publishStyles: false })).toContain("publish_page");
    expect(names({ publishPages: true, publishStyles: false })).not.toContain(
      "publish_site_styles",
    );
  });

  test("EmDash's own MCP publish of an EmVB page is refused unless agents may publish", async () => {
    await t.agentSettings();
    const pageId = await newPage();
    const runtime = t.runtime as unknown as {
      handleContentPublish(
        c: string,
        id: string,
        o: Record<string, unknown>,
      ): Promise<{ success: boolean; error?: { message: string } }>;
    };
    const blocked = await runtime.handleContentPublish("emvb_pages", pageId, {
      origin: { source: "mcp" },
      actor: { id: "u", role: ROLES.editor, source: "mcp" },
    });
    expect(blocked.success).toBe(false);
    expect(blocked.error?.message ?? "").toContain("Agents may not publish");
    const person = await runtime.handleContentPublish("emvb_pages", pageId, {
      actor: { id: "u", role: ROLES.editor },
    });
    expect(person.success).toBe(true);
  });
});
