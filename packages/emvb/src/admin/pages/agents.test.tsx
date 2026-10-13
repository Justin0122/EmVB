import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { Fetcher } from "../api.ts";
import { AgentsPage } from "./AgentsPage.tsx";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";

afterEach(cleanup);

function fakeApi(role: number) {
  const saved: unknown[] = [];
  const fetcher: Fetcher = async (path, init) => {
    if (path === "/_emdash/api/auth/me") return Response.json({ data: { id: "u1", role } });
    if (path.endsWith("/agents/save")) {
      saved.push(JSON.parse(String(init?.body)));
      return Response.json({ data: { revision: `r${saved.length + 1}` } });
    }
    if (path.endsWith("/agents")) {
      return Response.json({
        data: {
          settings: { mcpEnabled: false, publishPages: false, publishStyles: false },
          revision: "r1",
          endpoint: "https://example.com/_emdash/api/mcp",
          activity: [
            {
              id: "a1",
              at: "2026-10-13T12:00:00.000Z",
              tool: "add_element",
              target: "page",
              pageId: "p1",
              summary: "Added heading h1",
              userId: "editor-1",
            },
          ],
        },
      });
    }
    return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  };
  return { fetcher, saved };
}

describe("AI agents page (W-463)", () => {
  test("admins see the switches, the snippets and recent activity", async () => {
    const api = fakeApi(50);
    const host = await mount(<AgentsPage fetcher={api.fetcher} />);
    await settle();
    await settle();
    expect(host.querySelector("[data-emvb-agents=ready]")).not.toBeNull();
    // Live MCP test: the page uses the shared title and card styles, not browser defaults.
    expect(host.querySelector("h1.emvb-page-title")?.textContent).toBe("AI agents");
    expect(host.querySelector("[data-emvb-agents=ready] style")?.textContent).toContain(".emvb-agents-section");
    expect(host.querySelectorAll("section.emvb-surface-card.emvb-agents-section")).toHaveLength(4);
    expect(host.textContent).toContain("Let AI agents edit EmVB pages");
    expect(host.textContent).toContain("Added heading h1");
    const stdio = host.querySelector("[data-emvb-snippet=stdio]")?.textContent ?? "";
    expect(stdio).toContain("@perkyzz/emvb-mcp");
    expect(stdio).toContain('"https://example.com"');
    expect(host.textContent).not.toContain('EMVB_TOKEN": "ec_');
  });

  test("turning on the master switch saves the settings with the last revision", async () => {
    const api = fakeApi(50);
    const host = await mount(<AgentsPage fetcher={api.fetcher} />);
    await settle();
    await settle();
    const toggle = [...host.querySelectorAll("button[role=switch]")][0] as HTMLButtonElement;
    await act(async () => toggle.click());
    await settle();
    expect(api.saved).toEqual([
      { settings: { mcpEnabled: true, publishPages: false, publishStyles: false }, revision: "r1" },
    ]);
  });

  test("editors are told only administrators can manage agents", async () => {
    const host = await mount(<AgentsPage fetcher={fakeApi(40).fetcher} />);
    await settle();
    expect(host.querySelector("[data-emvb-access=denied]")).not.toBeNull();
  });
});
