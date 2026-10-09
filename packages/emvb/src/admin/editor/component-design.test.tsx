import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { ComponentField, ComponentFieldsDoc, Layout, LayoutNode } from "../../core/index.ts";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import {
  BindingEditor,
  ComponentDesignContext,
  ComponentFieldsEditor,
  keyFromLabel,
} from "./component-design.tsx";

afterEach(cleanup);

const button = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text || b.getAttribute("aria-label") === text,
  ) as HTMLButtonElement | undefined;

describe("a Component's field list (W-316)", () => {
  test("Add field adds a text field with a unique key", async () => {
    const sent: ComponentFieldsDoc[] = [];
    const doc: ComponentFieldsDoc = {
      schemaVersion: 1,
      fields: [{ key: "text", label: "Text", kind: "text" }],
    };
    const host = await mount(<ComponentFieldsEditor value={doc} onChange={(d) => sent.push(d)} />);
    await act(async () => button(host, "Add field")?.click());
    expect(sent.at(-1)?.fields.map((f) => [f.key, f.kind])).toEqual([
      ["text", "text"],
      ["text_2", "text"],
    ]);
  });

  test("removing a field drops it", async () => {
    const sent: ComponentFieldsDoc[] = [];
    const doc: ComponentFieldsDoc = {
      schemaVersion: 1,
      fields: [
        { key: "title", label: "Titel", kind: "text" },
        { key: "body", label: "Tekst", kind: "rich-text" },
      ],
    };
    const host = await mount(<ComponentFieldsEditor value={doc} onChange={(d) => sent.push(d)} />);
    await act(async () => button(host, "Remove Titel")?.click());
    expect(sent.at(-1)?.fields.map((f) => f.key)).toEqual(["body"]);
  });

  test("keys come from labels: lowercase, accents dropped, unique", () => {
    expect(keyFromLabel("Één titel!", [])).toBe("een_titel");
    expect(keyFromLabel("Titel", ["titel", "titel_2"])).toBe("titel_3");
    expect(keyFromLabel("123", [])).toBe("field");
  });
});

describe("binding an element to a field (W-316)", () => {
  const fields: ComponentField[] = [
    { key: "title", label: "Titel", kind: "text" },
    { key: "photo", label: "Foto", kind: "image" },
    {
      key: "buttons",
      label: "Knoppen",
      kind: "list",
      fields: [{ key: "label", label: "Tekst", kind: "text" }],
    },
  ];
  const heading = { id: "head0001", type: "heading", props: { text: "x", level: 2 } } as LayoutNode;
  const layoutWith = (...children: LayoutNode[]): Layout =>
    ({
      schemaVersion: 12,
      root: { id: "root0001", type: "container", props: {}, children },
    }) as Layout;

  async function editor(node: LayoutNode, layout: Layout) {
    const sent: LayoutNode[] = [];
    const host = await mount(
      <ComponentDesignContext.Provider value={fields}>
        <BindingEditor node={node} layout={layout} onChange={(n) => sent.push(n)} />
      </ComponentDesignContext.Provider>,
    );
    return { host, sent };
  }

  test("outside a Component's design there's nothing to bind", async () => {
    const host = await mount(
      <BindingEditor node={heading} layout={layoutWith(heading)} onChange={() => {}} />,
    );
    expect(host.querySelector("[data-emvb-bindings]")).toBeNull();
  });

  test("a heading offers its text and link, plus show, class and repeat", async () => {
    const { host } = await editor(heading, layoutWith(heading));
    const text = host.textContent ?? "";
    for (const label of [
      "Text",
      "Link",
      "Show only when filled",
      "Add style class from",
      "Repeat for each item of",
    ]) {
      expect(text).toContain(label);
    }
  });

  test("inside a repeated element, the list item's fields are offered and repeat isn't", async () => {
    const inner = { id: "labl0001", type: "label", props: { text: "x" } } as LayoutNode;
    const row = {
      id: "flex0001",
      type: "flexbox",
      props: {},
      bind: { repeat: "buttons" },
      children: [inner],
    } as unknown as LayoutNode;
    const { host } = await editor(inner, layoutWith(row));
    expect(host.textContent).not.toContain("Repeat for each item of");
    expect(host.textContent).toContain("Text");
  });
});
