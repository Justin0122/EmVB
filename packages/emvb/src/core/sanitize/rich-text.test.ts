import { describe, expect, test } from "bun:test";
import { renderPage } from "../render/index.ts";
import { serialize } from "../render/vnode.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import { parseRichText, richTextIsEmpty } from "./rich-text.ts";

const html = (source: string) => parseRichText(source).map(serialize).join("");

describe("Rich text keeps formatting (W-309)", () => {
  test("paragraphs, headings, inline marks, lists and quotes come through", () => {
    expect(
      html(
        "<h2>Wat wij doen</h2><p>Wij <strong>bouwen</strong> <em>samen</em> <u>aan</u> <s>x</s> H<sub>2</sub>O m<sup>2</sup> <code>a</code></p><ul><li>Een</li><li>Twee</li></ul><ol><li>1</li></ol><blockquote>Q</blockquote><p>a<br>b</p><hr>",
      ),
    ).toBe(
      "<h2>Wat wij doen</h2><p>Wij <strong>bouwen</strong> <em>samen</em> <u>aan</u> <s>x</s> H<sub>2</sub>O m<sup>2</sup> <code>a</code></p><ul><li>Een</li><li>Twee</li></ul><ol><li>1</li></ol><blockquote>Q</blockquote><p>a<br>b</p><hr>",
    );
  });

  test("old tags become their modern form", () => {
    expect(html("<b>B</b><i>I</i><strike>S</strike><del>D</del>")).toBe(
      "<strong>B</strong><em>I</em><s>S</s><s>D</s>",
    );
  });

  test("tables keep their rows, header cells and spans", () => {
    expect(
      html(
        '<table style="minWidth: 175px"><colgroup><col><col></colgroup><tbody><tr><th colspan="2" rowspan="1"><p><strong>Serie</strong></p></th></tr><tr><td rowspan="3">a</td><td colspan="1">b</td></tr></tbody></table>',
      ),
    ).toBe(
      '<table><tbody><tr><th colspan="2"><p><strong>Serie</strong></p></th></tr><tr><td rowspan="3">a</td><td>b</td></tr></tbody></table>',
    );
  });

  test("links keep a safe address; a new-tab link gets noopener", () => {
    expect(
      html(
        '<a href="/contact" class="x" onclick="evil()">Contact</a> <a href="https://shop.tuwi.nl" target="_blank">Shop</a>',
      ),
    ).toBe(
      '<a href="/contact">Contact</a> <a href="https://shop.tuwi.nl" target="_blank" rel="noopener noreferrer">Shop</a>',
    );
  });

  test("entities decode once and text is escaped once", () => {
    expect(html("<p>a &amp; b &lt;c&gt; &euml; &#233; &#x2014; &nbsp;x &unknown;</p>")).toBe(
      "<p>a &amp; b &lt;c&gt; ë é —  x &amp;unknown;</p>",
    );
  });
});

describe("Rich text drops what isn't safe (W-309)", () => {
  test("scripts, styles and embeds go with their contents", () => {
    expect(
      html(
        '<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="x">t</iframe><svg><script>1</script></svg><noscript><p>n</p></noscript><p>b</p>',
      ),
    ).toBe("<p>a</p><p>b</p>");
  });

  test("a nested dropped tag doesn't end the drop early", () => {
    expect(html("<svg><svg></svg><text>t</text></svg><p>after</p>")).toBe("<p>after</p>");
  });

  test("unsafe links keep only their text", () => {
    expect(
      html(
        '<a href="javascript:alert(1)">x</a><a href=" JaVaScRiPt:1">y</a><a href="data:text/html,1">z</a><a>w</a>',
      ),
    ).toBe("xyzw");
  });

  test("attributes, styles and event handlers never come through", () => {
    expect(
      html(
        '<p style="color:red" onmouseover="x()" id="i" class="c">p</p><img src=x onerror=alert(1)><span data-x="1">s</span>',
      ),
      // W-320: an image is kept, without its handler.
    ).toBe('<p>p</p><img src="x" alt="" loading="lazy">s');
  });

  test("comments, doctypes and CDATA are dropped; stray < stays as text", () => {
    expect(html("<!-- <script>x</script> --><!DOCTYPE html><![CDATA[c]]><p>1 < 2</p>")).toBe(
      "<p>1 &lt; 2</p>",
    );
  });

  test("broken nesting is closed safely; stray closing tags are ignored", () => {
    expect(html("<p><strong>a<em>b</p>c</strong></div>")).toBe(
      "<p><strong>a<em>b</em></strong></p>c",
    );
  });

  test("very deep nesting is flattened instead of growing without limit", () => {
    const deep = `${"<strong>".repeat(200)}x${"</strong>".repeat(200)}`;
    expect((html(deep).match(/<strong>/g) ?? []).length).toBeLessThanOrEqual(32);
    expect(html(deep)).toContain("x");
  });
});

describe("the Rich text element (W-309)", () => {
  const page = (...children: LayoutNode[]): Layout =>
    ({
      schemaVersion: 12,
      root: { id: "root0001", type: "container", props: {}, children },
    }) as Layout;
  const rich = (value: string) =>
    ({ id: "rich0001", type: "rich-text", props: { html: value } }) as LayoutNode;

  test("renders its HTML inside a div with the element's class", () => {
    const { html: out, css } = renderPage(
      page(rich("<p>Hi <strong>there</strong></p>")),
      emptyDesign(),
    );
    expect(out).toContain('<div class="emvb-rich-text"><p>Hi <strong>there</strong></p></div>');
    expect(css).toContain(".emvb-rich-text{");
  });

  test("is a known element: valid HTML saves, and its size is capped", () => {
    expect(validateLayout(page(rich("<p>x</p>"))).ok).toBe(true);
    expect(validateLayout(page(rich("x".repeat(100_001)))).ok).toBe(false);
  });

  test("text-free HTML counts as empty", () => {
    expect(richTextIsEmpty("<p> </p><hr><br>")).toBe(true);
    expect(richTextIsEmpty("<p>x</p>")).toBe(false);
  });
});

describe("Rich text colour (W-311)", () => {
  test("headings and paragraphs inside take the element's colour over the tag defaults", () => {
    const page = {
      schemaVersion: 12,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "rich0001",
            type: "rich-text",
            props: { html: "<h2>T</h2><p>P</p>" },
            style: { color: "#ffffff" },
          },
        ],
      },
    } as Layout;
    const design = {
      ...emptyDesign(),
      defaults: { h2: { color: "#101828" }, p: { color: "#002846" } },
    };
    const { css } = renderPage(page, design);
    // The inherit rule (one class + a tag) outranks the defaults (a tag under :where()).
    expect(css).toContain(
      ".emvb-rich-text :is(h1,h2,h3,h4,h5,h6,p,li,blockquote,strong,em,u,s,code,th,td,caption){color:inherit}",
    );
    expect(css).toContain(".emvb-e-rich0001{color:#ffffff}");
  });
});

describe("Rich text images (W-320)", () => {
  test("an image keeps its safe source, alt text and size, and loads lazily", () => {
    expect(
      html(
        '<p>Merken: <img src="/_emdash/api/media/file/a.png" alt="Durma" width="170" height="60" style="x" onerror="y"></p>',
      ),
    ).toBe(
      '<p>Merken: <img src="/_emdash/api/media/file/a.png" alt="Durma" width="170" height="60" loading="lazy"></p>',
    );
  });

  test("an image without a safe source is dropped; an odd size is left out", () => {
    expect(html('<p>a<img src="javascript:alert(1)">b<img alt="x"></p>')).toBe("<p>ab</p>");
    expect(html('<img src="https://cdn.example/x.jpg" width="100%" height="0">')).toBe(
      '<img src="https://cdn.example/x.jpg" alt="" loading="lazy">',
    );
  });

  test("an image alone is content, not an empty field", () => {
    expect(richTextIsEmpty('<p><img src="/a.png" alt=""></p>')).toBe(false);
    expect(richTextIsEmpty('<p><img src="javascript:x"></p>')).toBe(true);
  });
});
