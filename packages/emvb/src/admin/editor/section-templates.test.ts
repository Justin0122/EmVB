import { describe, expect, test } from "bun:test";
import type { Layout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { loadSectionTemplates } from "./section-templates.ts";

const layout = {
  schemaVersion: 15,
  root: { id: "root0001", type: "container", props: {}, children: [] },
} as Layout;

describe("section templates (W-374)", () => {
  test("a failed sibling keeps the sections that loaded", async () => {
    const read = (id: string) =>
      id === "bad" ? Promise.reject(new Error("missing")) : Promise.resolve(layout);
    const result = await loadSectionTemplates({} as Fetcher, ["good", "bad"], read);
    expect(result["good"]).toBe(layout);
    expect(result["bad"]).toBeUndefined();
  });
});
