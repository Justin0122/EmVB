import { describe, expect, test } from "bun:test";
import { parseSearch } from "./EditorPage.tsx";

describe("the editor URL picks the entry and its collection (W-307)", () => {
  test("Visual pages, theme parts and other collections open in their own collection", () => {
    expect(parseSearch("?entry=01A")).toEqual({ entry: "01A", collection: "emvb_pages" });
    expect(parseSearch("?entry=01B&collection=emvb_theme_parts")).toEqual({
      entry: "01B",
      collection: "emvb_theme_parts",
    });
    expect(parseSearch("?entry=01C&collection=news")).toEqual({ entry: "01C", collection: "news" });
  });

  test("a collection that isn't a slug falls back to Visual pages", () => {
    for (const bad of ["../x", "News", "a b", "1news", ""]) {
      expect(parseSearch(`?entry=01D&collection=${encodeURIComponent(bad)}`).collection).toBe(
        "emvb_pages",
      );
    }
  });
});
