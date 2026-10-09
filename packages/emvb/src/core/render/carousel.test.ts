import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import { renderPage } from "./index.ts";

const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 12,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
const slide = (id: string, text: string) =>
  ({ id, type: "heading", props: { text, level: 3 } }) as LayoutNode;
const carousel = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({
    id: "caro0001",
    type: "carousel",
    props,
    ...extra,
    children: [slide("head0001", "Een"), slide("head0002", "Twee")],
  }) as LayoutNode;

describe("Carousel (W-314)", () => {
  test("each child is a slide in the scroll track; arrows wait hidden for the runtime", () => {
    const { html, needsCarouselRuntime } = renderPage(
      page(carousel({ perView: 2, prevLabel: "Vorige", nextLabel: "Volgende" })),
      emptyDesign(),
    );
    expect(html).toContain('data-emvb-carousel=""');
    expect(html).toContain(
      '<div class="emvb-carousel-track"><div class="emvb-carousel-slide"><h3 class="emvb-heading">Een</h3></div><div class="emvb-carousel-slide"><h3 class="emvb-heading">Twee</h3></div></div>',
    );
    expect(html).toContain('aria-label="Vorige" hidden=""');
    expect(html).toContain('aria-label="Volgende" hidden=""');
    expect(needsCarouselRuntime).toBe(true);
  });

  test("hide arrows leaves them out; default labels are Previous and Next", () => {
    expect(
      renderPage(page(carousel({ perView: 2, hideArrows: true })), emptyDesign()).html,
    ).not.toContain("emvb-carousel-arrow");
    const { html } = renderPage(page(carousel({ perView: 2 })), emptyDesign());
    expect(html).toContain('aria-label="Previous"');
    expect(html).toContain('aria-label="Next"');
  });

  test("slides in view and the gap are CSS variables, per device", () => {
    const { css } = renderPage(
      page(
        carousel(
          { perView: 4, perViewTablet: 2, perViewMobile: 1 },
          {
            style: { gap: { value: 10, unit: "px" } },
            devices: { mobile: { gap: { value: 4, unit: "px" } } },
          },
        ),
      ),
      emptyDesign(),
    );
    expect(css).toMatch(/\.emvb-e-caro0001\{[^}]*--emvb-per-view:4[^}]*--emvb-carousel-gap:10px/);
    expect(css).toMatch(/@media \(max-width: ?1024px\)\{[^@]*\.emvb-e-caro0001\{--emvb-per-view:2/);
    expect(css).toMatch(
      /@media \(max-width: ?767px\)\{[^@]*\.emvb-e-caro0001\{--emvb-per-view:1;--emvb-carousel-gap:4px/,
    );
  });

  test("a page without a carousel needs no carousel script", () => {
    expect(renderPage(page(slide("head0001", "x")), emptyDesign()).needsCarouselRuntime).toBe(
      false,
    );
  });

  test("slides in view must be 1 to 6", () => {
    expect(validateLayout(page(carousel({ perView: 6 }))).ok).toBe(true);
    expect(validateLayout(page(carousel({ perView: 7 }))).ok).toBe(false);
    expect(validateLayout(page(carousel({}))).ok).toBe(false);
  });
});
