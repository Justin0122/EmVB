import { describe, expect, test } from "bun:test";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode, LoopNode } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import { SAMPLE_POST, type ThemePostFields } from "./dynamic.ts";
import {
  arrangeEntries,
  collectLoopQueries,
  loopQueryKey,
  loopQueryOf,
  pinEntries,
  withCardOverride,
} from "./loop-queries.ts";

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

describe("a Loop filtered by taxonomy terms (W-318)", () => {
  test("terms are trimmed, blanks and repeats dropped, and both are part of the query and key", () => {
    const query = loopQueryOf(
      loop("loop0001", {
        collection: "news",
        taxonomy: "tags",
        terms: " blogs, ,events,blogs ",
      }) as LoopNode,
    );
    expect(query).toEqual({
      collection: "news",
      limit: 6,
      order: "newest",
      taxonomy: "tags",
      terms: ["blogs", "events"],
    });
    expect(loopQueryKey(query as never)).toBe("news|6|newest|tags:blogs,events");
  });

  test("a taxonomy without terms, or terms without a taxonomy, filters nothing", () => {
    for (const props of [{ taxonomy: "tags", terms: " , " }, { terms: "blogs" }]) {
      expect(loopQueryOf(loop("loop0001", { collection: "news", ...props }) as LoopNode)).toEqual({
        collection: "news",
        limit: 6,
        order: "newest",
      });
    }
  });

  test("the filtered Loop renders the entries loaded for its own key", () => {
    const filtered = loop("loop0001", { collection: "news", taxonomy: "tags", terms: "blogs" });
    const { html } = renderPage(page(filtered), emptyDesign(), {
      dynamic: {
        collectionLoops: { "news|6|newest": news(2), "news|6|newest|tags:blogs": news(1) },
      },
    });
    expect(html).toContain("News 1");
    expect(html).not.toContain("News 2");
  });

  test("a taxonomy name must look like one", () => {
    expect(
      validateLayout(page(loop("loop0001", { collection: "news", taxonomy: "tags" }))).ok,
    ).toBe(true);
    expect(
      validateLayout(page(loop("loop0001", { collection: "news", taxonomy: "Tags!" }))).ok,
    ).toBe(false);
  });

  test("Loops in component uses ask for what each use fills in", () => {
    const template = {
      fields: [
        { key: "list", label: "List", kind: "text" as const },
        { key: "tags", label: "Tags", kind: "text" as const },
      ],
      nodes: [
        {
          ...loop("loop0001", { collection: "news", taxonomy: "tags" }),
          bind: { collection: "list", terms: "tags" },
        } as LayoutNode,
      ],
    };
    const use = (id: string, values: Record<string, unknown>) =>
      ({ id, type: "component", props: { partId: "comp1", values } }) as LayoutNode;
    const queries = collectLoopQueries(
      [
        page(
          use("comp0001", { list: "references", tags: "buis" }),
          use("comp0002", { list: "news" }),
        ),
      ],
      { comp1: template },
    );
    expect(queries).toEqual([
      { collection: "references", limit: 6, order: "newest", taxonomy: "tags", terms: ["buis"] },
      { collection: "news", limit: 6, order: "newest" },
    ]);
  });

  test("a component that uses itself is walked once", () => {
    const self = {
      id: "comp0001",
      type: "component",
      props: { partId: "comp1", values: {} },
    } as LayoutNode;
    const template = { fields: [], nodes: [self, loop("loop0001", { collection: "news" })] };
    expect(collectLoopQueries([page(self)], { comp1: template })).toEqual([
      { collection: "news", limit: 6, order: "newest" },
    ]);
  });
});

describe("a Loop with pinned entries (W-334)", () => {
  test("pinned slugs are trimmed, blanks and repeats dropped, and part of the query and key", () => {
    const query = loopQueryOf(
      loop("loop0001", { collection: "news", pinned: " b, ,a,b " }) as LoopNode,
    );
    expect(query).toEqual({ collection: "news", limit: 6, order: "newest", pinned: ["b", "a"] });
    expect(loopQueryKey(query as never)).toBe("news|6|newest|pinned:b,a");
    const plain = loopQueryOf(loop("loop0002", { collection: "news" }) as LoopNode);
    expect(loopQueryKey(plain as never)).toBe("news|6|newest");
  });

  test("pinned entries come first in their order, the rest after in theirs, up to the limit", () => {
    const entries = ["a", "b", "c", "d", "e"].map((slug) => ({ slug }));
    expect(pinEntries(entries, ["d", "gone", "b"], 4).map((e) => e.slug)).toEqual([
      "d",
      "b",
      "a",
      "c",
    ]);
    expect(pinEntries(entries, undefined, 2).map((e) => e.slug)).toEqual(["a", "b"]);
  });
});

describe("cards arranged by hand (W-339)", () => {
  const link = { id: "plink001", type: "post-link", props: { text: "Lees meer" } } as LayoutNode;
  const cards = (overrides: unknown, limit = 3) =>
    loop("loop0001", { collection: "news", limit, overrides }, [title, link]);

  test("the query names the moved and hidden entries, so its key changes with them", () => {
    const query = loopQueryOf(
      cards({
        order: ["n3", "n1", "n3"],
        cards: { n2: { hidden: true }, n1: { title: "X" } },
      }) as LoopNode,
    );
    expect(query).toEqual({
      collection: "news",
      limit: 3,
      order: "newest",
      first: ["n3", "n1"],
      hidden: ["n2"],
    });
    expect(query && loopQueryKey(query)).toBe("news|3|newest|first:n3,n1|hidden:n2");
  });

  test("hidden entries are left out and the Loop fills up; moved ones come first", () => {
    const shown = arrangeEntries(news(6), {
      limit: 3,
      first: ["n5", "gone", "n1"],
      hidden: ["n2"],
    });
    expect(shown.map((n) => n.id)).toEqual(["n5", "n1", "n3"]);
    // Pinned slugs (W-334) still follow the hand-made order.
    const pinned = arrangeEntries(news(6), { limit: 4, first: ["n6"], pinned: ["news-4"] });
    expect(pinned.map((n) => n.id)).toEqual(["n6", "n1", "n2", "n3"]);
  });

  test("a card's title, summary, link and button change; blanks keep the entry's own", () => {
    const [post] = news(1);
    if (!post) throw new Error("no post");
    expect(withCardOverride(post, { title: "  ", excerpt: "Kort", link: "/elders" })).toMatchObject(
      {
        title: "News 1",
        excerpt: "Kort",
        permalink: "/elders",
      },
    );
    expect(withCardOverride(post, { buttonLabel: "Bekijk" }).linkLabel).toBe("Bekijk");
    expect(withCardOverride(post, { button: false }).linkHidden).toBe(true);
    expect(withCardOverride(post, undefined)).toBe(post);
  });

  test("the page renders the cards in their order, with their changes", () => {
    const overrides = {
      order: ["n3"],
      cards: {
        n1: { hidden: true },
        n3: { title: "Eerst", buttonLabel: "Bekijk" },
        n2: { button: false },
      },
    };
    const layout = page(cards(overrides, 2));
    const query = loopQueryOf(cards(overrides, 2) as LoopNode);
    if (!query) throw new Error("no query");
    const { html } = renderPage(layout, emptyDesign(), {
      dynamic: { collectionLoops: { [loopQueryKey(query)]: news(4) } },
    });
    const titles = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    expect(titles).toEqual(["Eerst", "News 2"]);
    const links = [...html.matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    expect(links).toEqual(["Bekijk"]);
  });

  test("the schema keeps overrides to entry ids and known changes", () => {
    expect(validateLayout(page(cards({ order: ["n1"], cards: { n1: { hidden: true } } }))).ok).toBe(
      true,
    );
    expect(validateLayout(page(cards({ order: ["bad id"] }))).ok).toBe(false);
    expect(validateLayout(page(cards({ cards: { n1: { colour: "red" } } }))).ok).toBe(false);
  });
});
