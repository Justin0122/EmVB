import { describe, expect, test } from "bun:test";
import { listPages } from "./content-api.ts";
import { titleOf, type ContentItem } from "./content-item.ts";
import type { Fetcher } from "./api.ts";

const item = (title?: string): ContentItem => ({
  id: "p1",
  data: title === undefined ? {} : { title },
});

describe("titleOf", () => {
  test("uses the stored title", () => {
    expect(titleOf(item("Home"), "Untitled page")).toBe("Home");
  });

  test("a blank title reads Untitled page", () => {
    expect(titleOf(item(""), "Untitled page")).toBe("Untitled page");
    expect(titleOf(item(), "Untitled page")).toBe("Untitled page");
  });
});

describe("listPages", () => {
  test("a page with no title reads Untitled page", async () => {
    const fetcher: Fetcher = async () =>
      Response.json({ data: { items: [{ id: "p1", data: {} }] } });
    const pages = await listPages(fetcher);
    expect(pages[0]?.title).toBe("Untitled page");
  });
});
