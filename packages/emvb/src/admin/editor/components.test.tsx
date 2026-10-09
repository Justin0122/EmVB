import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { ComponentTemplate, LayoutNode } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import {
  ComponentFieldsForm,
  ComponentsContext,
  componentTitle,
  loadComponent,
} from "./components.tsx";
import { newElement } from "./dnd/new-element.ts";
import { AddPanel } from "./panels/AddPanel.tsx";

afterEach(cleanup);

const template: ComponentTemplate = {
  nodes: [],
  fields: [
    { key: "title", label: "Titel", kind: "text" },
    { key: "boxed", label: "Kader", kind: "toggle" },
    {
      key: "buttons",
      label: "Knoppen",
      kind: "list",
      max: 2,
      fields: [{ key: "label", label: "Tekst", kind: "text" }],
    },
  ],
};
const context = { list: [{ id: "c1", title: "Tekst en beeld" }], templates: { c1: template } };
const noFetch: Fetcher = async () => new Response("{}");

describe("adding a component (W-312)", () => {
  test("the Add panel lists the site's components, and a tile adds a use of it", async () => {
    const added: string[] = [];
    const host = await mount(
      <ComponentsContext.Provider value={context}>
        <AddPanel onAdd={(type) => added.push(type)} />
      </ComponentsContext.Provider>,
    );
    const tile = host.querySelector('[data-emvb-add-tile="component:c1"]') as HTMLButtonElement;
    expect(tile.textContent).toBe("Tekst en beeld");
    // The bare Component element, without a design, isn't offered.
    expect(host.querySelector('[data-emvb-add-tile="component"]')).toBeNull();
    await act(async () => tile.click());
    expect(added).toEqual(["component:c1"]);
  });

  test("a component tile becomes a use with empty values", () => {
    const node = newElement("component:c1", () => 0.5);
    expect(node?.type).toBe("component");
    expect(node?.props).toEqual({ partId: "c1", values: {} });
    expect(newElement("component:")).toBeNull();
  });
});

describe("filling in a component's fields (W-312)", () => {
  async function form(values: Record<string, unknown>) {
    const sent: LayoutNode[] = [];
    const node = {
      id: "use00001",
      type: "component",
      props: { partId: "c1", values },
    } as unknown as LayoutNode;
    const host = await mount(
      <ComponentsContext.Provider value={context}>
        <ComponentFieldsForm node={node} fetcher={noFetch} onChange={(next) => sent.push(next)} />
      </ComponentsContext.Provider>,
    );
    return { host, sent };
  }
  const valuesOf = (node: LayoutNode | undefined) =>
    (node?.props as { values?: Record<string, unknown> } | undefined)?.values;

  test("typing in a text field stores its value, keeping the others", async () => {
    const { host, sent } = await form({ boxed: true });
    const label = [...host.querySelectorAll("label")].find(
      (l) => l.textContent?.trim() === "Titel",
    );
    const input = document.getElementById(label?.getAttribute("for") ?? "") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "Hallo",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(valuesOf(sent.at(-1))).toEqual({ boxed: true, title: "Hallo" });
  });

  test("a list adds items up to its max, and removes them", async () => {
    const one = await form({ buttons: [{ label: "Een" }] });
    const add = [...one.host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Add knoppen"),
    ) as HTMLButtonElement;
    await act(async () => add.click());
    expect(valuesOf(one.sent.at(-1))).toEqual({ buttons: [{ label: "Een" }, {}] });
    const remove = one.host.querySelector('[aria-label="Remove item"]') as HTMLButtonElement;
    await act(async () => remove.click());
    expect(valuesOf(one.sent.at(-1))).toEqual({ buttons: [] });
    await cleanup();
    const full = await form({ buttons: [{ label: "Een" }, { label: "Twee" }] });
    const addFull = [...full.host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Add knoppen"),
    ) as HTMLButtonElement;
    expect(addFull.disabled).toBe(true);
  });

  test("loading a component reads its design and fields, and refuses other part types", async () => {
    const reply =
      (data: unknown): Fetcher =>
      async () =>
        new Response(JSON.stringify({ data: { item: { data } } }));
    const layout = {
      schemaVersion: 12,
      root: { id: "root0001", type: "container", props: {}, children: [] },
    };
    const fields = { schemaVersion: 1, fields: [{ key: "title", label: "Titel", kind: "text" }] };
    expect(
      await loadComponent(
        reply({ part_type: "component", layout, component_fields: JSON.stringify(fields) }),
        "c1",
      ),
    ).toEqual({
      nodes: [],
      fields: [{ key: "title", label: "Titel", kind: "text" }],
    } as never);
    expect(await loadComponent(reply({ part_type: "section", layout }), "s1")).toBeNull();
  });
});

describe("a component use's name (W-312)", () => {
  test("is its component's title; other elements and unknown components have none", () => {
    const use = {
      id: "use00001",
      type: "component",
      props: { partId: "c1", values: {} },
    } as unknown as LayoutNode;
    expect(componentTitle(use, context.list)).toBe("Tekst en beeld");
    expect(
      componentTitle({ ...use, props: { partId: "gone" } } as unknown as LayoutNode, context.list),
    ).toBeUndefined();
    expect(
      componentTitle(
        { id: "head0001", type: "heading", props: { text: "x", level: 2 } } as LayoutNode,
        context.list,
      ),
    ).toBeUndefined();
  });
});
