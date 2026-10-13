import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await t.dispose();
});

const editor = () => userWithRole(ROLES.editor);
const call = async <T = Record<string, unknown>>(tool: string, input: unknown) => {
  const result = (await t.mcp(tool, input, editor())) as {
    success: boolean;
    data?: unknown;
    error?: unknown;
  };
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.data as T;
};
const fail = async (tool: string, input: unknown) => {
  const result = (await t.mcp(tool, input, editor())) as {
    success: boolean;
    error?: { code: string; message: string };
  };
  expect(result.success).toBe(false);
  if (!result.error) throw new Error("expected an error");
  return result.error;
};
const newPage = async () => {
  const created = (await t.savePage({ title: "Home", layout: s1Page() })) as {
    data: { item: { id: string } };
  };
  return created.data.item.id;
};
type Layout = {
  root: { id: string; children?: { id: string; type: string; props?: Record<string, unknown> }[] };
};
const layoutOf = async (pageId: string) =>
  await call<{ layout: Layout; rev: string }>("get_layout", { pageId });

describe("EmVB MCP write tools (W-457, W-458)", () => {
  test("add_element saves a validated draft and returns the new rev", async () => {
    const pageId = await newPage();
    const before = await layoutOf(pageId);
    const out = await call<{ rev: string; changed: string[] }>("add_element", {
      pageId,
      parentId: before.layout.root.id,
      element: { type: "heading", props: { text: "Hello agent", level: 2 } },
    });
    expect(out.rev).not.toBe(before.rev);
    expect(out.changed).toHaveLength(1);
    const after = await layoutOf(pageId);
    expect(JSON.stringify(after.layout)).toContain("Hello agent");
  });

  test("a stale expectedRev is a conflict and changes nothing", async () => {
    const pageId = await newPage();
    const before = await layoutOf(pageId);
    await call("add_element", {
      pageId,
      parentId: before.layout.root.id,
      element: { type: "heading" },
    });
    const error = await fail("add_element", {
      pageId,
      parentId: before.layout.root.id,
      element: { type: "heading" },
      expectedRev: before.rev,
    });
    expect(error.code).toBe("CONFLICT");
  });

  test("invalid nesting is refused with the editor's reason", async () => {
    const pageId = await newPage();
    const { layout } = await layoutOf(pageId);
    const heading = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: layout.root.id,
      element: { type: "heading" },
    });
    const error = await fail("add_element", {
      pageId,
      parentId: heading.changed[0],
      element: { type: "section" },
    });
    expect(error.code).not.toBe("INTERNAL_ERROR");
  });

  test("a change that breaks the layout schema is refused and not saved", async () => {
    const pageId = await newPage();
    const { layout, rev } = await layoutOf(pageId);
    const added = await call<{ changed: string[]; rev: string }>("add_element", {
      pageId,
      parentId: layout.root.id,
      element: { type: "heading" },
    });
    const error = await fail("update_element", {
      pageId,
      nodeId: added.changed[0],
      set: { props: { level: 99 } },
    });
    expect(error.code).toBe("INVALID_LAYOUT");
    expect((await layoutOf(pageId)).rev).toBe(added.rev);
    expect(rev).not.toBe(added.rev);
  });

  test("update and remove change only the draft; the published page is untouched", async () => {
    const pageId = await newPage();
    const { layout } = await layoutOf(pageId);
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: layout.root.id,
      element: { type: "heading" },
    });
    const id = added.changed[0];
    await call("update_element", { pageId, nodeId: id, set: { props: { text: "Changed" } } });
    expect(JSON.stringify((await layoutOf(pageId)).layout)).toContain("Changed");
    await call("remove_element", { pageId, nodeId: id });
    expect(JSON.stringify((await layoutOf(pageId)).layout)).not.toContain(id);
  });

  test("create_page creates an unpublished page with recipes and refuses a taken slug", async () => {
    const out = await call<{ pageId: string; slug: string }>("create_page", {
      title: "About us",
      recipes: ["hero"],
    });
    expect(out.slug).toBe("about-us");
    const pages = await call<{ pages: { id: string; status: string }[] }>("list_pages", {});
    expect(pages.pages.find((p) => p.id === out.pageId)?.status).not.toBe("published");
    const error = await fail("create_page", { title: "About us" });
    expect(error.message).toContain("taken");
  });

  test("update_site_styles writes the draft and records the history", async () => {
    const out = await call<{ revision: string }>("update_site_styles", {
      variables: { colors: [{ id: "agent-accent", name: "Agent accent", value: "#ff0066" }] },
    });
    expect(out.revision).toBeTruthy();
    const styles = await call<{ draft: unknown }>("get_site_styles", {});
    expect(JSON.stringify(styles)).toContain("agent-accent");
  });

  test("removing a variable a page still uses is refused unless forced (W-458)", async () => {
    await newPage();
    await call("update_site_styles", {
      variables: { colors: [{ id: "brand", name: "Brand", value: "#0055ff" }] },
    });
    const error = await fail("update_site_styles", {
      removeVariables: [{ kind: "colors", id: "brand" }],
    });
    expect(error.code).toBe("REFUSED");
    expect(error.message).toContain('page "Home"');
    await call("update_site_styles", {
      removeVariables: [{ kind: "colors", id: "brand" }],
      force: true,
    });
    expect(JSON.stringify(await call("get_site_styles", {}))).not.toContain('"brand"');
  });

  test("viewers can't call write tools", async () => {
    const pageId = await newPage();
    const result = (await t.mcp(
      "add_element",
      { pageId, parentId: "x", element: { type: "heading" } },
      userWithRole(ROLES.contributor),
    )) as { success: boolean };
    expect(result.success).toBe(false);
  });
});
