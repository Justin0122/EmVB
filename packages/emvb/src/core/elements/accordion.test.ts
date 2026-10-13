import { describe, expect, test } from "bun:test";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";

const item = (n: number) =>
  ({
    id: `item000${n}`,
    type: "accordion-item",
    props: { summary: `Vraag ${n}` },
    children: [],
  }) as LayoutNode;
const page = (props: Record<string, unknown>, count = 5): Layout =>
  ({
    schemaVersion: 12,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "acco0001",
          type: "accordion",
          props,
          children: Array.from({ length: count }, (_, i) => item(i + 1)),
        },
      ],
    },
  }) as Layout;
const html = (props: Record<string, unknown>, count?: number) =>
  renderPage(page(props, count), emptyDesign()).html;

describe("accordion columns, chevron and animation (W-328)", () => {
  test("columns split the items, the first ones on the left, each column its own stack", () => {
    const out = html({ columns: 2 });
    expect(out).toContain('data-emvb-columns="2"');
    expect(out.match(/class="emvb-accordion-column"/g)?.length).toBe(2);
    const first = out.indexOf('class="emvb-accordion-column"');
    const second = out.indexOf('class="emvb-accordion-column"', first + 1);
    const between = out.slice(first, second);
    expect(between).toContain("Vraag 1");
    expect(between).toContain("Vraag 3");
    expect(between).not.toContain("Vraag 4");
  });

  test("one column, or a single item, stays one stack", () => {
    expect(html({})).not.toContain("emvb-accordion-column");
    expect(html({ columns: 2 }, 1)).not.toContain("emvb-accordion-column");
  });

  test("the chevron replaces the marker and turns when an item opens; opening animates", () => {
    expect(html({ icon: "chevron" })).toContain('data-emvb-icon="chevron"');
    expect(html({ icon: "marker" })).not.toContain("data-emvb-icon");
    const { css } = renderPage(page({ icon: "chevron" }), emptyDesign());
    expect(css).toContain(
      ".emvb-accordion[data-emvb-icon=chevron] .emvb-accordion-item[open]>summary::before{transform:rotate(180deg)}",
    );
    expect(css).toContain(
      ".emvb-accordion-item::details-content{height:0;overflow:clip;transition:height .26s",
    );
    expect(css).toMatch(
      /@media \(max-width:767px\)\{\.emvb-accordion\[data-emvb-columns\]\{grid-template-columns:minmax\(0,1fr\)\}\}/,
    );
  });

  test("columns are 1 to 4; the icon is the marker or a chevron", () => {
    expect(validateLayout(page({ columns: 4, icon: "chevron" })).ok).toBe(true);
    expect(validateLayout(page({ columns: 5 })).ok).toBe(false);
    expect(validateLayout(page({ icon: "plus" })).ok).toBe(false);
  });
});
