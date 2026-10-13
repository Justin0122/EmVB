import { describe, expect, test } from "bun:test";
import { REASONS, wrapNode } from "./arrange.ts";
import { MAX_DEPTH } from "./limits.ts";
import type { Layout, LayoutNode } from "./schema/layout.ts";
import { validateLayout } from "./validate.ts";

const layout = {
  schemaVersion: 15,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "acc00001",
        type: "accordion",
        props: {},
        children: [
          { id: "item0001", type: "accordion-item", props: { summary: "A" }, children: [] },
        ],
      },
      {
        id: "tabs0001",
        type: "tabs",
        props: {},
        children: [{ id: "tabp0001", type: "tab-panel", props: { label: "A" }, children: [] }],
      },
      {
        id: "menu0001",
        type: "menu",
        props: { direction: "row" },
        children: [
          { id: "mitm0001", type: "menu-item", props: { text: "Home", href: "/" }, children: [] },
        ],
      },
      {
        id: "form0001",
        type: "form",
        props: { formId: "contact" },
        children: [
          { id: "fld00001", type: "text-input", props: { field: "email", label: "Email" } },
        ],
      },
      { id: "btn00001", type: "button", props: { text: "Go" } },
    ],
  },
} as unknown as Layout;

describe("wrapping keeps the page savable (W-389)", () => {
  test("an accordion item, tab panel or menu item is not wrapped", () => {
    expect(wrapNode(layout, "item0001", "flexbox")).toEqual({
      ok: false,
      reason: REASONS.onlyAccordionItems,
    });
    expect(wrapNode(layout, "tabp0001", "grid")).toEqual({
      ok: false,
      reason: REASONS.onlyTabPanels,
    });
    expect(wrapNode(layout, "mitm0001", "div-block")).toEqual({
      ok: false,
      reason: REASONS.onlyMenuItems,
    });
  });

  test("a button, or a field inside its form, still wraps into a valid page", () => {
    expect(validateLayout(layout).ok).toBe(true);
    for (const id of ["btn00001", "fld00001"]) {
      const wrapped = wrapNode(layout, id, "flexbox");
      expect(wrapped.ok).toBe(true);
      if (wrapped.ok) expect(validateLayout(wrapped.layout).ok).toBe(true);
    }
  });

  test("a wrap that would pass the depth cap is refused", () => {
    let node: LayoutNode = { id: "leaf0001", type: "text", props: { text: "x" } } as LayoutNode;
    for (let i = MAX_DEPTH - 2; i >= 1; i -= 1) {
      node = {
        id: `box${String(i).padStart(5, "0")}`,
        type: "div-block",
        props: {},
        children: [node],
      } as LayoutNode;
    }
    const deep = {
      schemaVersion: 15,
      root: { id: "root0001", type: "container", props: {}, children: [node] },
    } as unknown as Layout;
    expect(validateLayout(deep).ok).toBe(true);
    expect(wrapNode(deep, "leaf0001", "flexbox")).toEqual({ ok: false, reason: REASONS.tooDeep });
  });
});
