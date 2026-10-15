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

const fail = async (tool: string, input: unknown) => {
  const result = (await t.mcp(tool, input, userWithRole(ROLES.editor))) as {
    success: boolean;
    error?: { code: string; message: string };
  };
  expect(result.success).toBe(false);
  return result.error as { code: string; message: string };
};
const newPage = async () => {
  const created = (await t.savePage({ title: "Home", layout: s1Page() })) as unknown as {
    data: { item: { id: string; data: { layout: { root: { id: string } } } } };
  };
  return created.data.item;
};

describe("absurdly nested MCP input (W-652)", () => {
  test("add_element with an element nested thousands deep is refused plainly", async () => {
    const page = await newPage();
    let element: Record<string, unknown> = { type: "text" };
    for (let i = 0; i < 6_000; i++) element = { type: "container", children: [element] };
    const error = await fail("add_element", {
      pageId: page.id,
      parentId: page.data.layout.root.id,
      element,
    });
    expect(error.code).not.toBe("INTERNAL_ERROR");
  });

  test("update_element with a style nested thousands deep is refused plainly", async () => {
    const page = await newPage();
    let deep: Record<string, unknown> = { x: 1 };
    for (let i = 0; i < 20_000; i++) deep = { x: deep };
    const error = await fail("update_element", {
      pageId: page.id,
      nodeId: page.data.layout.root.id,
      set: { style: deep },
    });
    expect(error.code).toBe("INVALID_INPUT");
  });
});
