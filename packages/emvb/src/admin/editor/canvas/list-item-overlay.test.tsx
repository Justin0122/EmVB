import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { ComponentTemplate, Layout, LayoutNode } from "../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
import { ComponentsContext } from "../components.tsx";
import { ListItemOverlay, parseListItem, type ListItemRef } from "./ListItemOverlay.tsx";

afterEach(cleanup);

const template: ComponentTemplate = {
  nodes: [],
  fields: [
    {
      key: "cards",
      label: "Kaarten",
      kind: "list",
      max: 3,
      fields: [{ key: "title", label: "Titel", kind: "text" }],
    },
  ],
};
const context = { list: [{ id: "c1", title: "Kaarten" }], templates: { c1: template } };

const layoutWith = (cards: Record<string, unknown>[]) =>
  ({
    schemaVersion: 12,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "use00001", type: "component", props: { partId: "c1", values: { cards } } }],
    },
  }) as unknown as Layout;

/** The canvas page (its own document, like the iframe's): one marked element per card. */
let canvas = document.implementation.createHTMLDocument("canvas");
function page(count: number) {
  canvas = document.implementation.createHTMLDocument("canvas");
  const frame = canvas.createElement("div");
  for (let i = 0; i < count; i++) {
    const card = canvas.createElement("div");
    card.setAttribute("data-emvb-item", `use00001|cards|${i}`);
    card.innerHTML = `<h3>Kaart ${i + 1}</h3>`;
    frame.append(card);
  }
  canvas.body.append(frame);
  return frame;
}

async function overlay(cards: Record<string, unknown>[], selectedId: string | null = "use00001") {
  const updates: LayoutNode[] = [];
  const removed: string[] = [];
  const focused: (ListItemRef | null)[] = [];
  const layout = layoutWith(cards);
  const use = layout.root.children[0] as LayoutNode;
  const frame = page(cards.length);
  const host = await mount(
    <ComponentsContext.Provider value={context}>
      <ListItemOverlay
        doc={canvas}
        layout={layout}
        selectedId={selectedId}
        scale={1}
        onUpdateNode={(id, update) => {
          expect(id).toBe("use00001");
          updates.push(update(use));
        }}
        onRemoved={(label) => removed.push(label)}
        onFocusItem={(item) => focused.push(item)}
      />
    </ComponentsContext.Provider>,
  );
  return { host, frame, updates, removed, focused };
}

const valuesOf = (node: LayoutNode | undefined) =>
  (node?.props as { values?: Record<string, unknown> } | undefined)?.values;

async function choose(frame: HTMLElement, index: number) {
  const card = frame.querySelector(`[data-emvb-item="use00001|cards|${index}"] h3`) as HTMLElement;
  await act(async () => card.click());
  await settle();
}

const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`[data-emvb-item-toolbar] [aria-label="${label}"]`);

describe("editing a component's list items on the canvas (W-336)", () => {
  test("a marker names the use, the list and the item's position", () => {
    expect(parseListItem("use00001|cards|2")).toEqual({
      useId: "use00001",
      path: "cards",
      index: 2,
    });
    expect(parseListItem("use00001|cards|x")).toBeNull();
    expect(parseListItem(null)).toBeNull();
  });

  test("clicking a card gives it a toolbar and tells the Content tab", async () => {
    const { frame, focused } = await overlay([{ title: "A" }, { title: "B" }]);
    expect(document.querySelector("[data-emvb-item-toolbar]")).toBeNull();
    await choose(frame, 1);
    expect(
      document.querySelector("[data-emvb-item-selected]")?.getAttribute("data-emvb-item-selected"),
    ).toBe("use00001|cards|1");
    expect(document.querySelector("[data-emvb-item-toolbar] span")?.textContent).toBe("Kaarten 2");
    expect(focused.at(-1)).toEqual({ useId: "use00001", path: "cards", index: 1 });
    expect(button("Move on")?.disabled).toBe(true);
    expect(button("Move back")?.disabled).toBe(false);
  });

  test("its buttons add, duplicate, move and remove the card in the use's values", async () => {
    const { frame, updates, removed } = await overlay([{ title: "A" }, { title: "B" }]);
    await choose(frame, 0);
    await act(async () => button("Add one after")?.click());
    expect(valuesOf(updates.at(-1))).toEqual({ cards: [{ title: "A" }, {}, { title: "B" }] });
    // Each edit selects the card it made or moved; the page here stays as it was.
    await choose(frame, 0);
    await act(async () => button("Duplicate")?.click());
    expect(valuesOf(updates.at(-1))).toEqual({
      cards: [{ title: "A" }, { title: "A" }, { title: "B" }],
    });
    await choose(frame, 0);
    await act(async () => button("Move on")?.click());
    expect(valuesOf(updates.at(-1))).toEqual({ cards: [{ title: "B" }, { title: "A" }] });
    await choose(frame, 0);
    await act(async () => button("Remove")?.click());
    expect(valuesOf(updates.at(-1))).toEqual({ cards: [{ title: "B" }] });
    expect(updates).toHaveLength(4);
    expect(removed).toEqual(["Kaarten"]);
  });

  test("the list's add button appends an empty card, and goes once the list is full", async () => {
    const first = await overlay([{ title: "A" }]);
    const add = document.querySelector<HTMLButtonElement>('[data-emvb-list-add="cards"]');
    expect(add?.getAttribute("aria-label")).toBe("Add to Kaarten");
    await act(async () => add?.click());
    expect(valuesOf(first.updates.at(-1))).toEqual({ cards: [{ title: "A" }, {}] });
    await cleanup();
    await overlay([{ title: "A" }, { title: "B" }, { title: "C" }]);
    expect(document.querySelector("[data-emvb-list-add]")).toBeNull();
  });

  test("nothing shows while another element is selected", async () => {
    const { frame } = await overlay([{ title: "A" }, { title: "B" }], "root0001");
    await choose(frame, 0);
    expect(document.querySelector("[data-emvb-item-overlay]")).toBeNull();
  });
});
