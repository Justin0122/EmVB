import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import { renderPage } from "./index.ts";

const page = (props: Record<string, unknown> = {}): Layout =>
  ({
    schemaVersion: 12,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "crum0001", type: "breadcrumbs", props }],
    },
  }) as Layout;
const trail = {
  trail: [
    { label: "Machines", href: "/machines" },
    { label: "Vlakbedlasers", href: "/machines/vlakbedlasers" },
  ],
  current: "Mitsubishi GX",
};

describe("Breadcrumbs (W-329)", () => {
  test("Home, the pages above and this page, as links in a nav", () => {
    const { html } = renderPage(page(), emptyDesign(), { dynamic: { breadcrumbs: trail } });
    expect(html).toContain('<nav class="emvb-breadcrumbs" aria-label="Breadcrumb">');
    expect(html.match(/<a href="([^"]+)">([^<]+)<\/a>/g)).toEqual([
      '<a href="/">Home</a>',
      '<a href="/machines">Machines</a>',
      '<a href="/machines/vlakbedlasers">Vlakbedlasers</a>',
    ]);
    expect(html).toContain(
      '<li aria-current="page"><span class="emvb-breadcrumbs-sep" aria-hidden="true"></span>Mitsubishi GX</li>',
    );
    expect(html).not.toContain("emvb-breadcrumbs-back");
  });

  test("its own Home text; an unsafe link is left out", () => {
    const { html } = renderPage(page({ homeLabel: "Start" }), emptyDesign(), {
      dynamic: {
        breadcrumbs: { trail: [{ label: "X", href: "javascript:alert(1)" }], current: "Hier" },
      },
    });
    expect(html).toContain('<a href="/">Start</a>');
    expect(html).not.toContain("javascript");
  });

  test("small screens can show only a link back to the page above", () => {
    const { html, css } = renderPage(page({ mobile: "back" }), emptyDesign(), {
      dynamic: { breadcrumbs: trail },
    });
    expect(html).toContain('data-emvb-mobile="back"');
    expect(html).toMatch(
      /<div class="emvb-breadcrumbs-back"><a href="\/machines\/vlakbedlasers">.*Vlakbedlasers<\/a><span aria-current="page">Mitsubishi GX<\/span><\/div>/,
    );
    expect(css).toContain(
      "@media (max-width:1024px){.emvb-breadcrumbs[data-emvb-mobile=back] .emvb-breadcrumbs-trail{display:none}",
    );
  });

  test("without a trail the site shows nothing; the editor shows a sample", () => {
    expect(renderPage(page(), emptyDesign()).html).not.toContain("emvb-breadcrumbs");
    expect(renderPage(page(), emptyDesign(), { mode: "editor" }).html).toContain("This page");
  });

  test("the small-screen choice is the trail or a link back", () => {
    expect(validateLayout(page({ mobile: "back" })).ok).toBe(true);
    expect(validateLayout(page({ mobile: "dots" })).ok).toBe(false);
  });
});
