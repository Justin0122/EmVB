import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as realEmDash from "emdash";
import * as realPluginUtils from "emdash/plugin-utils";
import { defaultElement, type Layout, type LayoutNode } from "../core/index.ts";

/**
 * W-091: `resolveEmVBPage` had no unit test (only e2e:prod). bun's `mock.module` is global to the
 * process, so the fakes only answer while this file runs and fall back to EmDash afterwards.
 * The fallbacks are taken before mocking: the mock replaces the namespace's exports in place, so
 * `realPluginUtils.getPublicPluginApiRouteHandler` called later is the fake itself and recurses
 * forever (resolve-theme.test.ts hung whenever it ran after this file).
 */
const realGetEmDashEntry = realEmDash.getEmDashEntry;
const realGetEmDashCollection = realEmDash.getEmDashCollection;
const realGetCollectionInfo = realEmDash.getCollectionInfo;
const realGetRequestContext = realEmDash.getRequestContext;
let editMode = false;
let listed: { id: string; data: Record<string, unknown> }[] = [];
const realRouteHandler = realPluginUtils.getPublicPluginApiRouteHandler;
let active = true;
type Found = { entry: { id: string; data: Record<string, unknown> } | null; isPreview?: boolean };
let lookup: (collection: string, slug: string) => Promise<Found> = async () => ({ entry: null });
const lookups: string[] = [];
type Call = { plugin: string; method: string; path: string; body: string };
const handlerCalls: Call[] = [];

mock.module("emdash", () => ({
  ...realEmDash,
  getEmDashEntry: (...args: Parameters<typeof realEmDash.getEmDashEntry>) => {
    if (!active) return realGetEmDashEntry(...args);
    lookups.push(`${args[0]}/${String(args[1])}`);
    return lookup(args[0], String(args[1]));
  },
  getEmDashCollection: (...args: Parameters<typeof realEmDash.getEmDashCollection>) =>
    active ? Promise.resolve({ entries: listed }) : realGetEmDashCollection(...args),
  getCollectionInfo: (...args: Parameters<typeof realEmDash.getCollectionInfo>) =>
    active ? Promise.resolve({ urlPattern: "/nieuws/{slug}" }) : realGetCollectionInfo(...args),
  getRequestContext: () =>
    active ? ({ editMode } as ReturnType<typeof realGetRequestContext>) : realGetRequestContext(),
}));
mock.module("emdash/plugin-utils", () => ({
  ...realPluginUtils,
  getPublicPluginApiRouteHandler: (locals: never) =>
    active
      ? async (plugin: string, method: string, path: string, request: Request) => {
          handlerCalls.push({ plugin, method, path, body: await request.text() });
          if (path === "/design") {
            return {
              data: {
                design: {
                  schemaVersion: 12,
                  variables: { colors: [{ id: "brand", name: "Brand", value: "#112233" }] },
                },
              },
            };
          }
          return {
            success: true,
            data: { name: "Contact", slug: "contact", settings: {}, pages: [] },
          };
        }
      : realRouteHandler(locals),
}));

const { resolveEmVBEntry, resolveEmVBPage } = await import("./resolve.ts");

afterAll(() => {
  active = false;
});

const heading: LayoutNode = { id: "head0001", type: "heading", props: { text: "Hello", level: 1 } };
const layout = (...children: LayoutNode[]): Layout => ({
  schemaVersion: 12,
  root: { id: "root0001", type: "container", props: {}, children },
});
const astro = (params: Record<string, string | undefined>) => ({
  params,
  url: new URL("http://site.test/about"),
  locals: {},
});
const page = (data: Record<string, unknown>, isPreview?: boolean): Found => ({
  entry: { id: "p1", data: { id: "p1", ...data } },
  ...(isPreview === undefined ? {} : { isPreview }),
});

beforeEach(() => {
  lookups.length = 0;
  handlerCalls.length = 0;
  lookup = async () => ({ entry: null });
});

describe("resolveEmVBPage (W-091, R-030, R-052)", () => {
  test("no slug is not an EmVB page and reads nothing", async () => {
    expect(await resolveEmVBPage(astro({}))).toBeNull();
    expect(await resolveEmVBPage(astro({ slug: "" }))).toBeNull();
    expect(lookups).toEqual([]);
  });

  test("the slug comes from the named route parameter", async () => {
    await resolveEmVBPage(astro({ slug: "wrong", path: "about" }), { param: "path" });
    await resolveEmVBPage(astro({ slug: "about" }));
    expect(lookups).toEqual(["emvb_pages/about", "emvb_pages/about"]);
  });

  test("a missing collection or entry is not an EmVB page", async () => {
    lookup = async () => {
      throw new Error("no such collection");
    };
    expect(await resolveEmVBPage(astro({ slug: "about" }))).toBeNull();
    lookup = async () => ({ entry: null });
    expect(await resolveEmVBPage(astro({ slug: "about" }))).toBeNull();
    expect(handlerCalls).toEqual([]);
  });

  test("a page renders with the stored design, title, canvas mode and the entry", async () => {
    const found = page({ title: "About", canvas_mode: "blank", layout: layout(heading) });
    lookup = async () => found;
    const resolved = await resolveEmVBPage(astro({ slug: "about" }));
    expect(resolved?.entry === found.entry).toBe(true);
    expect([resolved?.title, resolved?.canvasMode, resolved?.isPreview]).toEqual([
      "About",
      "blank",
      false,
    ]);
    expect(resolved?.html).toContain(">Hello</h1>");
    expect(resolved?.css).toContain("--emvb-c-brand:#112233");
    expect(handlerCalls.map((c) => `${c.plugin} ${c.method} ${c.path}`)).toEqual([
      "emvb GET /design",
    ]);
  });

  test("any other canvas mode is the site layout, a non-text title is empty, a preview is flagged", async () => {
    lookup = async () => page({ title: 7, canvas_mode: "full", layout: layout(heading) }, true);
    const resolved = await resolveEmVBPage(astro({ slug: "about" }));
    expect([resolved?.title, resolved?.canvasMode, resolved?.isPreview]).toEqual([
      "",
      "site-layout",
      true,
    ]);
  });

  test("forms on the page get their definitions; a page without forms asks for none", async () => {
    const form = {
      ...defaultElement("form", "form0001"),
      props: { formId: "contact" },
    } as LayoutNode;
    lookup = async () => page({ layout: JSON.stringify(layout(form)) });
    const resolved = await resolveEmVBPage(astro({ slug: "contact" }));
    expect(handlerCalls.map((c) => `${c.method} ${c.path} ${c.body}`)).toEqual([
      "GET /design ",
      'POST /definition {"id":"contact"}',
    ]);
    expect(resolved?.needsFormsRuntime).toBe(true);
  });

  test("an unreadable layout renders empty, asks for no forms and logs the page id", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      lookup = async () => ({ entry: { id: "x", data: { layout: "{broken" } } });
      const resolved = await resolveEmVBPage(astro({ slug: "about" }));
      expect([resolved?.html, resolved?.css]).toEqual(["", ""]);
      expect(handlerCalls.map((c) => c.path)).toEqual(["/design"]);
      expect(error.mock.calls).toEqual([
        ["emvb: stored layout is unreadable", { pageId: "about", path: "", code: "invalid_json" }],
      ]);
    } finally {
      error.mockRestore();
    }
  });
});

describe("resolveEmVBEntry (W-307)", () => {
  test("reads the entry from the named collection by the slug option or route parameter", async () => {
    await resolveEmVBEntry(astro({ slug: "from-param" }), "news");
    await resolveEmVBEntry(astro({ slug: "from-param" }), "news", { slug: "given" });
    await resolveEmVBEntry(astro({ item: "machine" }), "machines", { param: "item" });
    expect(lookups).toEqual(["news/from-param", "news/given", "machines/machine"]);
  });

  test("an entry renders from emvb_layout, not layout", async () => {
    lookup = async () => page({ title: "Opening", layout: layout(), emvb_layout: layout(heading) });
    const resolved = await resolveEmVBEntry(astro({ slug: "opening" }), "news");
    expect(resolved?.html).toContain("Hello");
    expect([resolved?.title, resolved?.canvasMode]).toEqual(["Opening", "site-layout"]);
  });

  test("an entry without a layout, or a missing one, isn't visual: null, nothing loaded", async () => {
    lookup = async () => page({ title: "Plain", emvb_layout: null });
    expect(await resolveEmVBEntry(astro({ slug: "plain" }), "news")).toBeNull();
    lookup = async () => ({ entry: null });
    expect(await resolveEmVBEntry(astro({ slug: "gone" }), "news")).toBeNull();
    lookup = async () => {
      throw new Error("no such collection");
    };
    expect(await resolveEmVBEntry(astro({ slug: "x" }), "nope")).toBeNull();
    expect(handlerCalls).toEqual([]);
  });
});

describe("collection Loops on a page (W-308)", () => {
  test("a Loop listing a collection renders its entries, linked by the collection's URL pattern", async () => {
    listed = [{ id: "n1", data: { id: "n1", slug: "opening", title: "Opening" } }];
    const newsLoop = {
      id: "loop0001",
      type: "loop",
      props: { collection: "news" },
      children: [{ id: "plink001", type: "post-link", props: {} }],
    } as unknown as LayoutNode;
    lookup = async () => page({ title: "Home", layout: layout(newsLoop) });
    const resolved = await resolveEmVBPage(astro({ slug: "home" }));
    expect(resolved?.html).toContain('href="/nieuws/opening"');
    expect(resolved?.html).toContain("Opening");
    listed = [];
  });
});

describe("components on a page (W-312)", () => {
  test("a use renders its published component's design with its values", async () => {
    listed = [
      {
        id: "comp1",
        data: {
          id: "comp1",
          part_type: "component",
          layout: layout({
            id: "head0009",
            type: "heading",
            props: { text: "x", level: 2 },
            bind: { text: "title" },
          } as unknown as LayoutNode),
          component_fields: {
            schemaVersion: 1,
            fields: [{ key: "title", label: "Titel", kind: "text" }],
          },
        },
      },
    ];
    const use = {
      id: "use00001",
      type: "component",
      props: { partId: "comp1", values: { title: "Wat wij doen" } },
    } as unknown as LayoutNode;
    lookup = async () => page({ title: "Home", layout: layout(use) });
    const resolved = await resolveEmVBPage(astro({ slug: "home" }));
    expect(resolved?.html).toContain("Wat wij doen</h2>");
    listed = [];
  });
});

describe("the site in EmDash's edit mode (W-325)", () => {
  beforeEach(() => {
    editMode = false;
  });

  test("names the entry and marks its texts for editing", async () => {
    editMode = true;
    lookup = async () => page({ title: "About", layout: layout(heading) });
    const resolved = await resolveEmVBPage(astro({ slug: "about" }));
    expect(resolved?.inlineEdit).toEqual({ collection: "emvb_pages", id: "p1", field: "layout" });
    expect(resolved?.html).toContain('data-emvb-text="head0001|plain|0"');
    editMode = false;
  });

  test("outside edit mode there are no markers and no target", async () => {
    lookup = async () => page({ title: "About", layout: layout(heading) });
    const resolved = await resolveEmVBPage(astro({ slug: "about" }));
    expect(resolved?.inlineEdit).toBeUndefined();
    expect(resolved?.html).not.toContain("data-emvb-text");
  });
});

describe("breadcrumbs from the host's trail (W-329)", () => {
  test("Home, the trail the route passes, then the entry's own title", async () => {
    const crumbs: LayoutNode = { id: "crum0001", type: "breadcrumbs", props: {} } as LayoutNode;
    lookup = async () => page({ title: "Mitsubishi GX", emvb_layout: layout(crumbs) });
    const resolved = await resolveEmVBEntry(astro({ slug: "mitsubishi-gx" }), "machines", {
      breadcrumbs: [{ label: "Machines", href: "/machines" }],
    });
    expect(resolved?.html).toContain('<a href="/">Home</a>');
    expect(resolved?.html).toContain('<a href="/machines">Machines</a>');
    expect(resolved?.html).toContain("Mitsubishi GX</li>");
  });
});
