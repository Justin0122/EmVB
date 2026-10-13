import { describe, expect, test } from "bun:test";
import type { Fetcher } from "../api.ts";
import { checkRemoteChange } from "./remote-change.ts";

const api =
  (rev: string, draft: string, agentRevisions: string[] | "fail"): Fetcher =>
  async (path) => {
    if (path.endsWith("/agents/page")) {
      if (agentRevisions === "fail")
        return Response.json({ error: { code: "X" } }, { status: 500 });
      return Response.json({
        data: { versions: agentRevisions.map((revisionId) => ({ revisionId })) },
      });
    }
    return Response.json({ data: { item: { draftRevisionId: draft }, _rev: rev } });
  };

describe("W-466 an idle editor notices changes made elsewhere", () => {
  test("nothing changed", async () => {
    expect(await checkRemoteChange(api("r1", "d1", []), "emvb_pages", "p", "r1")).toBeNull();
  });
  test("an agent saved the newest draft", async () => {
    expect(await checkRemoteChange(api("r2", "d2", ["d2"]), "emvb_pages", "p", "r1")).toBe("agent");
  });
  test("someone else saved it, or the agent log can't be read", async () => {
    expect(await checkRemoteChange(api("r2", "d2", ["d1"]), "emvb_pages", "p", "r1")).toBe("other");
    expect(await checkRemoteChange(api("r2", "d2", "fail"), "emvb_pages", "p", "r1")).toBe("other");
  });
});
