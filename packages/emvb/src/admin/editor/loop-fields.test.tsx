import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { ComponentTemplate, LayoutNode } from "../../core/index.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import type { Fetcher } from "../api.ts";
import { clearLoopLoads } from "../loop-api.ts";
import { ComponentFieldsForm, ComponentsContext } from "./components.tsx";

afterEach(cleanup);
beforeEach(clearLoopLoads);

// W-339: a component that lists a collection, filtered by tags, with its cards arranged by hand.
const template: ComponentTemplate = {
  fields: [
    {
      key: "list",
      label: "Lijst",
      kind: "select",
      options: [
        { value: "news", label: "Nieuws" },
        { value: "machines", label: "Machines" },
      ],
      default: "news",
    },
    { key: "tags", label: "Tags", kind: "terms", taxonomy: "tag", collectionField: "list" },
    { key: "cards", label: "Kaarten", kind: "cards" },
  ],
  nodes: [
    {
      id: "loop0001",
      type: "loop",
      props: { collection: "news", taxonomy: "tag", limit: 2 },
      bind: { collection: "list", terms: "tags", overrides: "cards" },
      children: [],
    } as unknown as LayoutNode,
  ],
};
const context = { list: [{ id: "c1", title: "Overzicht" }], templates: { c1: template } };

const entry = (id: string, title: string, publishedAt: string) => ({
  id,
  slug: id,
  title,
  excerpt: `${title} kort`,
  content: "",
  permalink: `/nieuws/${id}`,
  publishedAt,
});

async function form(values: Record<string, unknown>) {
  const asked: { path: string; body: Record<string, unknown> }[] = [];
  const fetcher: Fetcher = async (path, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    asked.push({ path, body });
    if (path.endsWith("/loop/terms")) {
      return Response.json({
        data: {
          terms:
            body["collection"] === "news"
              ? [
                  { slug: "kantbanken", label: "Kantbanken", count: 4 },
                  { slug: "nieuws", label: "Nieuws", count: 9 },
                ]
              : [{ slug: "lasers", label: "Lasers", count: 2 }],
        },
      });
    }
    return Response.json({
      data: {
        items: [
          entry("e1", "Opening", "2026-09-15T05:53:00.000Z"),
          entry("e2", "Euroblech", "2026-06-15T08:35:00.000Z"),
          entry("e3", "Italiaanse dag", "2026-04-24T05:53:00.000Z"),
        ],
      },
    });
  };
  const sent: Record<string, unknown>[] = [];
  let current = values;
  const node = () =>
    ({ id: "use00001", type: "component", props: { partId: "c1", values: current } }) as LayoutNode;
  const host = await mount(
    <ComponentsContext.Provider value={context}>
      <ComponentFieldsForm
        node={node()}
        fetcher={fetcher}
        onChange={(next) => {
          current = (next.props as { values: Record<string, unknown> }).values;
          sent.push(current);
        }}
      />
    </ComponentsContext.Provider>,
  );
  await settle();
  const click = async (selector: string) => {
    await act(async () => host.querySelector<HTMLElement>(selector)?.click());
    await settle();
  };
  return { host, sent, asked, click, last: () => sent.at(-1) };
}

describe("Terms field (W-339)", () => {
  test("offers the tags of the chosen collection's entries and stores their slugs", async () => {
    const view = await form({ tags: "nieuws" });
    expect(view.asked[0]?.body).toEqual({ collection: "news", taxonomy: "tag" });
    expect(view.host.querySelector('[data-emvb-term="nieuws"]')?.textContent).toBe("Nieuws");
    await act(async () => {
      view.host.querySelector<HTMLInputElement>("[data-emvb-terms-search]")?.focus();
    });
    const options = [...view.host.querySelectorAll("[data-emvb-term-option]")].map((o) =>
      o.getAttribute("data-emvb-term-option"),
    );
    expect(options).toEqual(["kantbanken"]);
    await view.click('[data-emvb-term-option="kantbanken"]');
    expect(view.last()?.["tags"]).toBe("nieuws,kantbanken");
    // The form isn't given its new values here, so this removes the one it was opened with.
    await view.click('[data-emvb-term="nieuws"] button');
    expect(view.last()?.["tags"]).toBe("");
  });

  test("another collection offers its own tags", async () => {
    const view = await form({ list: "machines" });
    expect(view.asked.find((a) => a.path.endsWith("/loop/terms"))?.body).toEqual({
      collection: "machines",
      taxonomy: "tag",
    });
  });
});

describe("Cards field (W-339)", () => {
  const rows = (host: HTMLElement) =>
    [...host.querySelectorAll("[data-emvb-card]")].map((r) => r.getAttribute("data-emvb-card"));

  test("lists the Loop's entries by its own query, newest first, with their dates", async () => {
    const view = await form({ tags: "nieuws" });
    const entries = view.asked.find((a) => a.path.endsWith("/loop/entries"));
    expect(entries?.body).toEqual({
      collection: "news",
      limit: 50,
      order: "newest",
      taxonomy: "tag",
      terms: ["nieuws"],
    });
    expect(rows(view.host)).toEqual(["e1", "e2", "e3"]);
    expect(
      view.host.querySelector('[data-emvb-card="e1"] .emvb-cards-meta')?.textContent,
    ).toContain("/nieuws/e1");
    expect(view.host.textContent).toContain("3 cards; the page shows 2");
  });

  test("moving a card stores the whole order; Reset order clears it", async () => {
    const view = await form({});
    await view.click('[data-emvb-card="e3"] [aria-label="Move Italiaanse dag up"]');
    expect(view.last()?.["cards"]).toEqual({ order: ["e1", "e3", "e2"] });
  });

  test("a hand-made order shows first; hiding and changing a card keeps only what is set", async () => {
    const view = await form({ cards: { order: ["e3"] } });
    expect(rows(view.host)).toEqual(["e3", "e1", "e2"]);
    await view.click("[data-emvb-cards-reset]");
    expect(view.last()?.["cards"]).toEqual({});
  });

  test("an opened card can be hidden and given its own title", async () => {
    const view = await form({ cards: { cards: { e2: { hidden: true } } } });
    expect(view.host.querySelector('[data-emvb-card="e2"]')?.hasAttribute("data-hidden")).toBe(
      true,
    );
    expect(view.host.textContent).toContain("3 cards, 1 hidden; the page shows 2");
    await view.click('[data-emvb-card="e1"] .emvb-cards-toggle');
    const title = [
      ...view.host.querySelectorAll<HTMLInputElement>('[data-emvb-card="e1"] input'),
    ].find((i) => i.placeholder === "Opening");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        title,
        "Open dag",
      );
      title?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.last()?.["cards"]).toEqual({
      cards: { e2: { hidden: true }, e1: { title: "Open dag" } },
    });
  });
});
