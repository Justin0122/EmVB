import { afterEach, describe, expect, test } from "bun:test";
import type { Layout } from "../../core/schema/layout.ts";
import { initInlineEdit, saveInlineEdit } from "./runtime.ts";

const LAYOUT = {
  schemaVersion: 12,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "Titel", level: 2 } }],
  },
} as Layout;

type Call = { url: string; method: string; body?: unknown };

/** EmDash's content API, faked: the entry's draft and its revision; PUTs are recorded. */
function fakeApi(layout: Layout | null = LAYOUT, putStatus = 200) {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "GET") {
      return new Response(
        JSON.stringify({ data: { item: { data: { emvb_layout: layout } }, _rev: "rev-1" } }),
      );
    }
    return new Response("{}", { status: method === "PUT" ? putStatus : 200 });
  };
  return { calls, fetchFn };
}

const entry = { collection: "news", id: "n1", field: "emvb_layout" };
const headingEdit = { kind: "element", id: "head0001", rich: false, multiline: false } as const;

let stop = () => {};
afterEach(() => {
  stop();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("saving an inline edit (W-325)", () => {
  test("reads the draft, writes the layout back with the change and its revision", async () => {
    const { calls, fetchFn } = fakeApi();
    await saveInlineEdit(entry, headingEdit, "Nieuw", fetchFn);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /_emdash/api/content/news/n1",
      "PUT /_emdash/api/content/news/n1",
    ]);
    const put = calls[1]?.body as { data: { emvb_layout: Layout }; _rev: string };
    expect(put["_rev"]).toBe("rev-1");
    expect(put.data.emvb_layout.root.children[0]?.props).toMatchObject({ text: "Nieuw" });
  });

  test("a text no longer on the page, or a refused save, fails", async () => {
    const empty = { ...LAYOUT, root: { ...LAYOUT.root, children: [] } } as Layout;
    await expect(saveInlineEdit(entry, headingEdit, "x", fakeApi(empty).fetchFn)).rejects.toThrow();
    await expect(
      saveInlineEdit(entry, headingEdit, "x", fakeApi(LAYOUT, 409).fetchFn),
    ).rejects.toThrow();
  });
});

describe("editing on the page (W-325)", () => {
  function pageWith(html: string) {
    document.body.innerHTML = `<div data-emvb-inline="news|n1|emvb_layout">${html}</div><span id="emdash-tb-status"></span><button id="emdash-tb-publish" style="display:none"></button>`;
  }

  test("a click makes the text editable; Enter saves it and offers Publish", async () => {
    pageWith('<h2 data-emvb-text="head0001|plain|0">Titel</h2>');
    const api = fakeApi();
    stop = initInlineEdit(document, api.fetchFn);
    const h2 = document.querySelector("h2") as HTMLElement;
    h2.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(h2.getAttribute("contenteditable")).not.toBeNull();
    h2.textContent = "Nieuwe titel";
    h2.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(h2.hasAttribute("contenteditable")).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const put = api.calls.find((c) => c.method === "PUT")?.body as {
      data: { emvb_layout: Layout };
    };
    expect(put.data.emvb_layout.root.children[0]?.props).toMatchObject({ text: "Nieuwe titel" });
    expect(document.getElementById("emdash-tb-publish")?.style.display).toBe("");
    expect(document.getElementById("emdash-tb-status")?.textContent).toBe("Unpublished changes");
  });

  test("Escape puts the text back and saves nothing", async () => {
    pageWith('<h2 data-emvb-text="head0001|plain|0">Titel</h2>');
    const api = fakeApi();
    stop = initInlineEdit(document, api.fetchFn);
    const h2 = document.querySelector("h2") as HTMLElement;
    h2.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    h2.textContent = "Weg";
    h2.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h2.textContent).toBe("Titel");
    expect(api.calls).toEqual([]);
  });

  test("a marked text inside a link is edited, not followed", () => {
    pageWith(
      '<a href="/elders"><span data-emvb-bound="use00001|buttons.0.label|text">Knop</span></a>',
    );
    stop = initInlineEdit(document, fakeApi().fetchFn);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.querySelector("span")?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  test("a page without the edit wrapper gets nothing", () => {
    document.body.innerHTML = '<h2 data-emvb-text="head0001|plain|0">Titel</h2>';
    stop = initInlineEdit(document, fakeApi().fetchFn);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.querySelector("h2")?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(document.querySelector("[data-emvb-inline-style]")).toBeNull();
  });
});
