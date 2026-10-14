import { describe, expect, test } from "bun:test";
import { appendAgentLog } from "./agent-settings.ts";

/** An in-memory agentlog collection with the query filters the trim uses. */
function memoryLog() {
  const rows = new Map<string, { at: string }>();
  return {
    rows,
    put: async (id: string, data: unknown) => void rows.set(id, data as { at: string }),
    query: async (o: { where?: Record<string, unknown>; limit: number }) => {
      const lt = (o.where?.["at"] as { lt?: string } | undefined)?.lt;
      const items = [...rows]
        .filter(([, d]) => (lt ? d.at < lt : true))
        .toSorted(([, a], [, b]) => (a.at < b.at ? -1 : 1))
        .slice(0, o.limit)
        .map(([id, data]) => ({ id, data }));
      return { items };
    },
    deleteMany: async (ids: string[]) => {
      for (const id of ids) rows.delete(id);
      return ids.length;
    },
  };
}

describe("Agent activity log is trimmed (W-522)", () => {
  test("entries older than 90 days are dropped when a new one is added", async () => {
    const log = memoryLog();
    await appendAgentLog(log, { tool: "old" }, new Date("2026-01-01T00:00:00Z"));
    await appendAgentLog(log, { tool: "recent" }, new Date("2026-09-01T00:00:00Z"));
    await appendAgentLog(log, { tool: "now" }, new Date("2026-10-14T00:00:00Z"));
    const tools = [...log.rows.values()].map((d) => (d as { tool?: string }).tool);
    expect(tools.toSorted()).toEqual(["now", "recent"]);
  });

  test("a store without deleteMany still records the entry", async () => {
    const { deleteMany: _d, ...plain } = memoryLog();
    await appendAgentLog(plain, { tool: "x" });
    expect(plain.rows.size).toBe(1);
  });
});
