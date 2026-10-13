import { afterEach, describe, expect, test } from "bun:test";
import type { Layout, LayoutNode } from "../../../core/index.ts";
import { canvasEditFor, type CanvasEdit } from "./canvas-edit.ts";

/** The parts of an edit to compare (the element itself can't be printed). */
const facts = (edit: CanvasEdit | null) =>
  edit && { kind: edit.kind, value: edit.value, multiline: edit.multiline };

afterEach(() => {
  document.body.innerHTML = "";
});

const layout = (...children: LayoutNode[]) =>
  ({
    schemaVersion: 12,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;

function page(html: string) {
  document.body.innerHTML = html;
  return document;
}

describe("what a canvas double-click edits (W-324)", () => {
  const use = {
    id: "use00001",
    type: "component",
    props: {
      partId: "c1",
      values: { body: "<p>Oud</p>", buttons: [{ label: "A" }, { label: "B" }] },
    },
  } as unknown as LayoutNode;

  test("a rich text in a use edits that use's field, as rich text", () => {
    const doc = page(
      '<div data-emvb-id="use00001"><div class="emvb-rich-text" data-emvb-bound="use00001|body|rich-text"><p id="t">Oud</p></div></div>',
    );
    const edit = canvasEditFor(doc, layout(use), "use00001", doc.getElementById("t"));
    expect(edit?.kind).toBe("rich");
    expect(edit?.value).toBe("<p>Oud</p>");
    expect(edit?.element.getAttribute("data-emvb-bound")).toBe("use00001|body|rich-text");
    if (!edit) throw new Error("no edit");
    expect((edit.update(use, "<p>Nieuw</p>").props as { values: unknown }).values).toEqual({
      body: "<p>Nieuw</p>",
      buttons: [{ label: "A" }, { label: "B" }],
    });
  });

  test("a list item's text edits that item, as one line", () => {
    const doc = page(
      '<div data-emvb-id="use00001"><a class="emvb-link"><span class="emvb-label" id="b" data-emvb-bound="use00001|buttons.1.label|text">B</span></a></div>',
    );
    const edit = canvasEditFor(doc, layout(use), "use00001", doc.getElementById("b"));
    expect(facts(edit)).toEqual({ kind: "plain", value: "B", multiline: false });
    if (!edit) throw new Error("no edit");
    expect(
      (edit.update(use, "Bee").props as { values: { buttons: unknown } }).values.buttons,
    ).toEqual([{ label: "A" }, { label: "Bee" }]);
  });

  test("a marker for another use, or a click outside any text, edits nothing", () => {
    const doc = page(
      '<div data-emvb-id="use00001"><span id="x" data-emvb-bound="use00002|body|text">x</span><span id="y">y</span></div>',
    );
    expect(canvasEditFor(doc, layout(use), "use00001", doc.getElementById("x"))).toBeNull();
    expect(canvasEditFor(doc, layout(use), "use00001", doc.getElementById("y"))).toBeNull();
  });

  test("a Rich text element edits its own html; a heading its text", () => {
    const rich = {
      id: "rich0001",
      type: "rich-text",
      props: { html: "<h2>Hoi</h2>" },
    } as LayoutNode;
    const head = {
      id: "head0001",
      type: "heading",
      props: { text: "Titel", level: 2 },
    } as LayoutNode;
    const doc = page(
      '<div data-emvb-id="rich0001"><h2>Hoi</h2></div><h2 data-emvb-id="head0001">Titel</h2>',
    );
    const r = canvasEditFor(doc, layout(rich, head), "rich0001", null);
    expect(facts(r)).toEqual({ kind: "rich", value: "<h2>Hoi</h2>", multiline: true });
    expect(r?.update(rich, "<p>x</p>").props).toEqual({ html: "<p>x</p>" });
    const h = canvasEditFor(doc, layout(rich, head), "head0001", null);
    expect(facts(h)).toEqual({ kind: "plain", value: "Titel", multiline: false });
  });
});
