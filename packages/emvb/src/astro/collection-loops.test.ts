import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realEmDash from "emdash";
import type { Layout, LayoutNode } from "../core/index.ts";

/**
 * W-308: the collection Loop loader. `mock.module` is global to the process, so the fakes only
 * answer while this file runs (see resolve.test.ts for why the real functions are taken first).
 */
const realCollection = realEmDash.getEmDashCollection;
const realInfo = realEmDash.getCollectionInfo;
let active = true;
const calls: { collection: string; options: unknown }[] = [];
let entries: Record<string, { id: string; data: Record<string, unknown> }[]> = {};
let patterns: Record<string, string | null> = {};

mock.module("emdash", () => ({
  ...realEmDash,
  getEmDashCollection: (...args: Parameters<typeof realEmDash.getEmDashCollection>) => {
    if (!active) return realCollection(...args);
    const [collection, options] = args;
    calls.push({ collection: String(collection), options });
    if (!(String(collection) in entries)) return Promise.reject(new Error("no such collection"));
    return Promise.resolve({ entries: entries[String(collection)] });
  },
  getCollectionInfo: (...args: Parameters<typeof realEmDash.getCollectionInfo>) => {
    if (!active) return realInfo(...args);
    const slug = String(args[0]);
    return Promise.resolve(slug in patterns ? { slug, urlPattern: patterns[slug] } : null);
  },
}));

const { entryPermalink, loadCollectionLoops } = await import("./collection-loops.ts");

afterAll(() => {
  active = false;
});

beforeEach(() => {
  calls.length = 0;
  entries = {};
  patterns = {};
});

const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 12,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
const loop = (id: string, props: Record<string, unknown>) =>
  ({ id, type: "loop", props, children: [] }) as LayoutNode;

describe("loadCollectionLoops (W-308)", () => {
  test("loads each query once, newest first by default, with the collection's permalinks", async () => {
    entries = {
      news: [
        {
          id: "n1",
          data: {
            id: "n1",
            slug: "opening",
            title: "Opening",
            excerpt: "Hi",
            featured_image: { src: "/a.jpg", alt: "A" },
          },
        },
      ],
    };
    patterns = { news: "/nieuws/{slug}" };
    const loops = await loadCollectionLoops([
      page(
        loop("loop0001", { collection: "news", limit: 4 }),
        loop("loop0002", { collection: "news", limit: 4 }),
      ),
    ]);
    expect(calls).toEqual([
      { collection: "news", options: { orderBy: { published_at: "desc" }, limit: 4 } },
    ]);
    expect(loops["news|4|newest"]).toEqual([
      {
        id: "n1",
        slug: "opening",
        title: "Opening",
        excerpt: "Hi",
        content: "",
        permalink: "/nieuws/opening",
        featuredImageUrl: "/a.jpg",
        featuredImageAlt: "A",
        // W-338: the entry's text fields, for Post Field.
        fields: { id: "n1", slug: "opening", title: "Opening", excerpt: "Hi" },
      },
    ]);
  });

  test("oldest and title orders ask EmDash for that order", async () => {
    entries = { news: [] };
    await loadCollectionLoops([
      page(
        loop("loop0001", { collection: "news", order: "oldest" }),
        loop("loop0002", { collection: "news", order: "title" }),
      ),
    ]);
    expect(calls.map((c) => c.options)).toEqual([
      { orderBy: { published_at: "asc" }, limit: 6 },
      { orderBy: { title: "asc" }, limit: 6 },
    ]);
  });

  test("a taxonomy filter asks EmDash for entries with those term slugs (W-318)", async () => {
    entries = { news: [] };
    const loops = await loadCollectionLoops([
      page(loop("loop0001", { collection: "news", taxonomy: "tags", terms: "blogs,events" })),
    ]);
    expect(calls.map((c) => c.options)).toEqual([
      { orderBy: { published_at: "desc" }, limit: 6, where: { tags: ["blogs", "events"] } },
    ]);
    expect(Object.keys(loops)).toEqual(["news|6|newest|tags:blogs,events"]);
  });

  test("pinned entries come first, with room for them in the load (W-334)", async () => {
    const entry = (slug: string) => ({ id: slug, data: { id: slug, slug, title: slug } });
    entries = { news: ["new", "mid", "old"].map(entry) };
    const loops = await loadCollectionLoops([
      page(loop("loop0001", { collection: "news", limit: 2, pinned: "old" })),
    ]);
    expect(calls.map((c) => c.options)).toEqual([{ orderBy: { published_at: "desc" }, limit: 3 }]);
    expect(loops["news|2|newest|pinned:old"]?.map((p) => p.slug)).toEqual(["old", "new"]);
  });

  test("a missing collection lists nothing instead of failing the page", async () => {
    expect(await loadCollectionLoops([page(loop("loop0001", { collection: "gone" }))])).toEqual({
      "gone|6|newest": [],
    });
  });

  test("layouts without collection Loops load nothing", async () => {
    expect(await loadCollectionLoops([page(loop("loop0001", {})), null])).toEqual({});
    expect(calls).toEqual([]);
  });
});

describe("entryPermalink (W-308)", () => {
  test("fills the collection's URL pattern, else /<collection>/<slug>", () => {
    expect(entryPermalink("news", "/nieuws/{slug}", "a b")).toBe("/nieuws/a%20b");
    expect(entryPermalink("news", null, "x")).toBe("/news/x");
    expect(entryPermalink("news", "/static", "x")).toBe("/news/x");
    expect(entryPermalink("news", "nieuws/{slug}", "x")).toBe("/nieuws/x");
  });
});
