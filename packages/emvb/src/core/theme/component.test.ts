import { describe, expect, test } from "bun:test";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import {
  applyComponent,
  collectComponentPartIds,
  validateComponentFields,
  type ComponentField,
  type ComponentTemplate,
} from "./component.ts";

const n = (node: Record<string, unknown>) => node as unknown as LayoutNode;

const FIELDS: ComponentField[] = [
  { key: "title", label: "Titel", kind: "text", default: "Standaard" },
  { key: "body", label: "Tekst", kind: "rich-text" },
  { key: "photo", label: "Afbeelding", kind: "image" },
  {
    key: "theme",
    label: "Thema",
    kind: "select",
    options: [
      { value: "theme-base", label: "Navy" },
      { value: "theme-white", label: "Wit" },
    ],
  },
  { key: "boxed", label: "Kader", kind: "toggle" },
  {
    key: "buttons",
    label: "Knoppen",
    kind: "list",
    max: 3,
    fields: [
      { key: "label", label: "Tekst", kind: "text" },
      { key: "link", label: "Link", kind: "link" },
    ],
  },
];

const DESIGN: LayoutNode[] = [
  n({
    id: "band0001",
    type: "container",
    props: {},
    bind: { classes: "theme" },
    children: [
      n({
        id: "head0001",
        type: "heading",
        props: { text: "x", level: 2 },
        bind: { text: "title" },
      }),
      n({
        id: "rich0001",
        type: "rich-text",
        props: { html: "" },
        bind: { html: "body", show: "body" },
      }),
      n({
        id: "imag0001",
        type: "image",
        props: { src: "", alt: "", decorative: true },
        bind: { src: "photo", show: "photo" },
      }),
      n({ id: "frame001", type: "container", props: {}, bind: { show: "boxed" }, children: [] }),
      n({
        id: "link0001",
        type: "link",
        props: { text: "x", href: "#" },
        bind: { repeat: "buttons", text: "label", href: "link" },
      }),
    ],
  }),
];
const template: ComponentTemplate = { nodes: DESIGN, fields: FIELDS };

const childOf = (nodes: LayoutNode[]) => (nodes[0] as { children: LayoutNode[] }).children;

describe("filling a component's design with values (W-312)", () => {
  test("bound props take the values; the binding itself is gone from the result", () => {
    const [band] = applyComponent(template, {
      title: "Wat wij doen",
      body: "<p>Hallo</p>",
      photo: { src: "/a.jpg", alt: "Werkplaats", mediaId: "m1" },
      theme: "theme-base",
    }) as [LayoutNode & { children: LayoutNode[] }];
    expect(band.classes).toEqual(["theme-base"]);
    expect("bind" in band).toBe(false);
    const [heading, rich, image] = band.children;
    expect(heading?.props).toEqual({ text: "Wat wij doen", level: 2 });
    expect(rich?.props).toEqual({ html: "<p>Hallo</p>" });
    expect(image?.props).toEqual({ src: "/a.jpg", alt: "Werkplaats", mediaId: "m1" });
  });

  test("empty fields hide `show`-bound elements; defaults fill unset fields", () => {
    const children = childOf(applyComponent(template, {}));
    expect(children.map((c) => c.id)).toEqual(["head0001"]);
    expect(children[0]?.props).toMatchObject({ text: "Standaard" });
    // A select falls back to its first option.
    expect(applyComponent(template, {})[0]?.classes).toEqual(["theme-base"]);
  });

  test("a list repeats its element per item, with unique ids, up to the field's max", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      label: `Knop ${i + 1}`,
      link: { href: `/p${i}`, newTab: i === 0 },
    }));
    const links = childOf(applyComponent(template, { buttons: items })).filter(
      (c) => c.type === "link",
    );
    expect(links.map((l) => [l.id, l.props])).toEqual([
      ["link0001-1", { text: "Knop 1", href: "/p0", newTab: true }],
      ["link0001-2", { text: "Knop 2", href: "/p1" }],
      ["link0001-3", { text: "Knop 3", href: "/p2" }],
    ]);
  });

  test("values of the wrong kind are ignored, not passed to the elements", () => {
    const [band] = applyComponent(template, {
      title: 42,
      photo: "not-an-image",
      theme: "theme-hacked",
      boxed: "yes",
      buttons: "nope",
    }) as [LayoutNode & { children: LayoutNode[] }];
    expect(band.children.map((c) => c.id)).toEqual(["head0001"]);
    expect(band.children[0]?.props).toMatchObject({ text: "Standaard" });
    expect(band.classes).toEqual(["theme-base"]);
  });

  test("the field list must have unique keys and known kinds", () => {
    expect(validateComponentFields({ schemaVersion: 1, fields: FIELDS }).ok).toBe(true);
    expect(validateComponentFields({ schemaVersion: 1, fields: [FIELDS[0], FIELDS[0]] }).ok).toBe(
      false,
    );
    expect(
      validateComponentFields({
        schemaVersion: 1,
        fields: [{ key: "x", label: "X", kind: "video" }],
      }).ok,
    ).toBe(false);
    expect(
      validateComponentFields({
        schemaVersion: 1,
        fields: [
          {
            key: "l",
            label: "L",
            kind: "list",
            fields: [{ key: "m", label: "M", kind: "list", fields: [] }],
          },
        ],
      }).ok,
    ).toBe(false);
  });
});

describe("rendering a component (W-312)", () => {
  const page = (...children: LayoutNode[]): Layout =>
    ({
      schemaVersion: 12,
      root: { id: "root0001", type: "container", props: {}, children },
    }) as Layout;
  const use = (id: string, values: Record<string, unknown>, partId = "c1") =>
    n({ id, type: "component", props: { partId, values } });
  const design = emptyDesign();

  test("a use renders the design with its values, and two uses stay separate", () => {
    const { html } = renderPage(
      page(use("use00001", { title: "Een" }), use("use00002", { title: "Twee" })),
      design,
      {
        dynamic: { componentTemplates: { c1: template } },
      },
    );
    expect(html).toContain("<h2");
    expect(html.match(/>Een</g)?.length).toBe(1);
    expect(html.match(/>Twee</g)?.length).toBe(1);
    expect(html).toContain('class="emvb-component');
  });

  test("in the editor, only the component itself is selectable", () => {
    const { html } = renderPage(page(use("use00001", { title: "Een" })), design, {
      mode: "editor",
      dynamic: { componentTemplates: { c1: template } },
    });
    expect(html.match(/data-emvb-id="([^"]+)"/g)).toEqual([
      'data-emvb-id="root0001"',
      'data-emvb-id="use00001"',
    ]);
  });

  test("an unpublished component is empty on the site and a placeholder in the editor", () => {
    expect(renderPage(page(use("use00001", {}, "gone")), design).html).not.toContain(
      "isn't published",
    );
    expect(
      renderPage(page(use("use00001", {}, "gone")), design, { mode: "editor" }).html,
    ).toContain("This component isn't published");
  });

  test("a component that uses itself renders once, not forever", () => {
    const self: ComponentTemplate = { nodes: [use("inner001", {}, "c1")], fields: [] };
    const { html } = renderPage(page(use("use00001", {})), design, {
      dynamic: { componentTemplates: { c1: self } },
    });
    // The outer use, and the inner one left empty instead of expanding again.
    expect(html.match(/class="emvb-component/g)?.length).toBe(2);
  });

  test("uses are found in nested layouts, and bindings and uses pass validation", () => {
    expect(
      collectComponentPartIds([
        n({
          id: "c0000001",
          type: "container",
          props: {},
          children: [use("u1234", {}, "a"), use("u5678", {}, "b")],
        }),
      ]).toSorted(),
    ).toEqual(["a", "b"]);
    expect(validateLayout(page(...DESIGN, use("use00001", { title: "x" }))).ok).toBe(true);
    expect(
      validateLayout(
        page(
          n({
            id: "head0001",
            type: "heading",
            props: { text: "x", level: 2 },
            bind: { text: "Bad Key" },
          }),
        ),
      ).ok,
    ).toBe(false);
  });
});
