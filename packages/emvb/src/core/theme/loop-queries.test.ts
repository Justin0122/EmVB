import { describe, expect, test } from "bun:test";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode, LoopNode } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import { SAMPLE_POST, type ThemePostFields } from "./dynamic.ts";
import { collectLoopQueries, loopQueryKey, loopQueryOf } from "./loop-queries.ts";

const title = { id: "ptitle01", type: "post-title", props: { level: 3 } } as LayoutNode;
const loop = (id: string, props: Record<string, unknown>, children: LayoutNode[] = [title]) =>
  ({ id, type: "loop", props, children }) as LayoutNode;
const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 12,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
const news = (n: number): ThemePostFields[] =>
  Array.from({ length: n }, (_, i) => ({
    ...SAMPLE_POST,
    id: `n${i + 1}`,
    title: `News ${i + 1}`,
    permalink: `/nieuws/news-${i + 1}`,
  }));

describe("collection Loop queries (W-308)", () => {
  test("a Loop without a collection is an archive Loop; one with a collection gets defaults", () => {
    expect(loopQueryOf(loop("loop0001", {}) as LoopNode)).toBeNull();
    expect(loopQueryOf(loop("loop0001", { collection: "  " }) as LoopNode)).toBeNull();
    expect(loopQueryOf(loop("loop0001", { collection: "news" }) as LoopNode)).toEqual({
      collection: "news",
      limit: 6,
      order: "newest",
    });
    expect(loopQueryKey({ collection: "news", limit: 4, order: "title" })).toBe("news|4|title");
  });

  test("every distinct query in the layouts, nested ones too, each once", () => {
    const nested = {
      id: "cont0001",
      type: "container",
      props: {},
      children: [loop("loop0002", { collection: "references", limit: 8 })],
    } as LayoutNode;
    const queries = collectLoopQueries([
      page(loop("loop0001", { collection: "news" }), nested, loop("loop0003", {})),
      null,
      page(loop("loop0004", { collection: "news" })),
    ]);
    expect(queries).toEqual([
      { collection: "news", limit: 6, order: "newest" },
      { collection: "references", limit: 8, order: "newest" },
    ]);
  });

  test("the layout schema takes a collection slug, a limit of 1–50 and a known order", () => {
    expect(
      validateLayout(page(loop("loop0001", { collection: "news", limit: 50, order: "oldest" }))).ok,
    ).toBe(true);
    for (const props of [
      { collection: "News" },
      { collection: "../x" },
      { limit: 0 },
      { limit: 51 },
      { order: "random" },
    ]) {
      expect(validateLayout(page(loop("loop0001", props))).ok).toBe(false);
    }
  });
});

describe("rendering a collection Loop (W-308)", () => {
  const design = emptyDesign();
  const itemTitles = (html: string) =>
    [...html.matchAll(/<h3 class="emvb-post-title">([^<]*)<\/h3>/g)].map((m) => m[1]);

  test("lists the loaded entries for its query, at most its limit", () => {
    const { html } = renderPage(page(loop("loop0001", { collection: "news", limit: 2 })), design, {
      dynamic: { collectionLoops: { "news|2|newest": news(3) } },
    });
    expect(itemTitles(html)).toEqual(["News 1", "News 2"]);
  });

  test("ignores the archive's posts, and another query's entries", () => {
    const { html } = renderPage(page(loop("loop0001", { collection: "news" })), design, {
      dynamic: { posts: news(2), collectionLoops: { "news|3|newest": news(3) } },
    });
    expect(html).not.toContain("emvb-loop");
  });

  test("an archive Loop next to it still lists the archive's posts", () => {
    const { html } = renderPage(
      page(loop("loop0001", { collection: "news" }), loop("loop0002", {})),
      design,
      { dynamic: { posts: news(1), collectionLoops: { "news|6|newest": news(2) } } },
    );
    expect(itemTitles(html)).toEqual(["News 1", "News 2", "News 1"]);
  });

  test("the editor shows up to three sample items", () => {
    const items = (html: string) =>
      [...html.matchAll(/data-emvb-loop-item="([^"]*)"/g)].map((m) => m[1]);
    const three = renderPage(page(loop("loop0001", { collection: "news" })), design, {
      mode: "editor",
    });
    expect(items(three.html)).toEqual(["sample-1", "sample-2", "sample-3"]);
    const one = renderPage(page(loop("loop0001", { collection: "news", limit: 1 })), design, {
      mode: "editor",
    });
    expect(items(one.html)).toEqual(["sample-1"]);
  });
});
