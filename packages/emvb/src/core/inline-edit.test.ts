import { describe, expect, test } from "bun:test";
import { applyInlineEdit, inlineEditTarget } from "./inline-edit.ts";
import { renderPage } from "./render/index.ts";
import { emptyDesign } from "./schema/design.ts";
import type { Layout, LayoutNode } from "./schema/layout.ts";
import { findNode } from "./tree-ops.ts";

const n = (node: Record<string, unknown>) => node as unknown as LayoutNode;
/** The edit a marker names; the markers here are all valid. */
const target = (own: string | null, bound: string | null = null) => {
  const found = inlineEditTarget(own, bound);
  if (!found) throw new Error(`no edit for ${own ?? bound}`);
  return found;
};
/** The layout an edit made; the edits here all apply. */
const applied = (layout: Layout | null) => {
  if (!layout) throw new Error("not applied");
  return layout;
};
const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 12,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
const heading = n({ id: "head0001", type: "heading", props: { text: "Titel", level: 2 } });
const text = n({ id: "text0001", type: "text", props: { text: "Regel" } });
const rich = n({ id: "rich0001", type: "rich-text", props: { html: "<p>Oud</p>" } });
const use = n({
  id: "use00001",
  type: "component",
  props: { partId: "c1", values: { body: "<p>A</p>", buttons: [{ label: "Een" }] } },
});

describe("inline edit markers name their edit (W-325)", () => {
  test("an element's own text, plain or rich, and a use's field", () => {
    expect(inlineEditTarget("head0001|plain|0", null)).toEqual({
      kind: "element",
      id: "head0001",
      rich: false,
      multiline: false,
    });
    expect(inlineEditTarget("text0001|plain|1", null)).toMatchObject({ multiline: true });
    expect(inlineEditTarget("rich0001|rich", null)).toMatchObject({ kind: "element", rich: true });
    expect(inlineEditTarget(null, "use00001|buttons.0.label|text")).toEqual({
      kind: "field",
      use: "use00001",
      path: "buttons.0.label",
      rich: false,
    });
  });

  test("anything else is no edit", () => {
    for (const [own, bound] of [
      ["head0001|bold", null],
      ["bad id!|plain|0", null],
      [null, "use00001|buttons.x.label|text"],
      [null, "use00001|__proto__|text"],
      [null, "use00001|body|image"],
      [null, null],
    ] as const) {
      expect(inlineEditTarget(own, bound)).toBeNull();
    }
  });
});

describe("applying an inline edit (W-325)", () => {
  const layout = page(heading, text, rich, use);

  test("a heading keeps one line; a paragraph keeps its line breaks", () => {
    const h = applyInlineEdit(layout, target("head0001|plain|0", null), "Nieuw\nkop");
    expect(findNode(applied(h), "head0001")?.props).toMatchObject({ text: "Nieuwkop" });
    const t = applyInlineEdit(layout, target("text0001|plain|1", null), "Een\nTwee");
    expect(findNode(applied(t), "text0001")?.props).toMatchObject({ text: "Een\nTwee" });
  });

  test("a rich text gets its html; a use's field its value; the rest stays", () => {
    const r = applyInlineEdit(layout, target("rich0001|rich", null), "<h2>Nieuw</h2>");
    expect(findNode(applied(r), "rich0001")?.props).toEqual({ html: "<h2>Nieuw</h2>" });
    const f = applyInlineEdit(layout, target(null, "use00001|buttons.0.label|text"), "Twee");
    const props = findNode(applied(f), "use00001")?.props as { values: unknown } | undefined;
    expect(props?.values).toEqual({
      body: "<p>A</p>",
      buttons: [{ label: "Twee" }],
    });
    expect(findNode(applied(f), "head0001")).toBe(heading);
  });

  test("a text that left the page, or isn't that kind of text, isn't edited", () => {
    expect(applyInlineEdit(page(), target("head0001|plain|0", null), "x")).toBeNull();
    expect(applyInlineEdit(layout, target("head0001|rich", null), "x")).toBeNull();
    expect(applyInlineEdit(layout, target(null, "head0001|title|text"), "x")).toBeNull();
  });
});

describe("the site in edit mode marks the layout's texts (W-325)", () => {
  const templates = {
    c1: {
      fields: [{ key: "body", label: "Tekst", kind: "rich-text" as const }],
      nodes: [
        n({ id: "rt000001", type: "rich-text", props: { html: "" }, bind: { html: "body" } }),
      ],
    },
  };
  const render = (opts: Record<string, unknown>) =>
    renderPage(page(heading, rich, use), emptyDesign(), {
      dynamic: { componentTemplates: templates },
      ...opts,
    }).html;

  test("its own texts and its uses' texts, only with inlineEdit", () => {
    const html = render({ inlineEdit: true });
    expect(html).toContain('data-emvb-text="head0001|plain|0"');
    expect(html).toContain('data-emvb-text="rich0001|rich"');
    expect(html).toContain('data-emvb-bound="use00001|body|rich-text"');
    const plain = render({});
    expect(plain).not.toContain("data-emvb-text");
    expect(plain).not.toContain("data-emvb-bound");
  });

  test("the editor canvas keeps its own markers, not the site's", () => {
    const html = render({ mode: "editor", inlineEdit: true });
    expect(html).not.toContain("data-emvb-text");
    expect(html).toContain("data-emvb-bound");
  });

  test("a synced section's texts aren't the page's to edit", () => {
    const section = n({ id: "sect0001", type: "section", props: { partId: "s1" }, children: [] });
    const html = renderPage(page(section), emptyDesign(), {
      inlineEdit: true,
      dynamic: {
        sectionTemplates: {
          s1: {
            schemaVersion: 12,
            root: { id: "sroot001", type: "container", props: {}, children: [heading] },
          } as Layout,
        },
      },
    }).html;
    expect(html).toContain(">Titel<");
    expect(html).not.toContain("data-emvb-text");
  });
});
