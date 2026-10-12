import { expect, test } from "bun:test";
import type { DesignSystem } from "../schema/design.ts";
import { generateCss } from "./generate.ts";

// Unsafe values and ids reach generateCss unvalidated here on purpose: it must drop them itself.
const design = {
  schemaVersion: 1,
  variables: {
    colors: [
      { id: "brand", name: "Brand", value: "#112233" },
      { id: "Bad Id", name: "Bad", value: "#445566" },
      { id: "evil", name: "Evil", value: "red;}body{x:y" },
    ],
    fonts: [
      { id: "body", name: "Body", value: "Inter, sans-serif" },
      { id: "evil", name: "Evil", value: "x</style>" },
    ],
    fontSizes: [
      { id: "lg", name: "Large", value: { value: 1.5, unit: "rem" } },
      { id: "evil", name: "Evil", value: { value: 1, unit: "px;}" } },
    ],
    spacings: [
      { id: "gap", name: "Gap", value: { value: 16, unit: "px" } },
      { id: "BAD", name: "Bad", value: { value: 4, unit: "px" } },
    ],
  },
  classes: [
    { id: "card", name: "Card", style: { color: "#abcdef" } },
    { id: "Nope", name: "Nope", style: { color: "#000000" } },
    { id: "empty", name: "Empty", style: {} },
  ],
} as unknown as DesignSystem;

test("generateCss emits safe variables, used base CSS, classes and local rules in cascade order", () => {
  const css = generateCss({
    design,
    usedTypes: new Set(["text", "heading"]),
    baseCss: new Map([
      ["heading", ".emvb-heading{margin:0}"],
      ["text", ".emvb-text{margin:0}"],
      ["image", ".emvb-image{display:block}"],
    ]),
    localRules: [
      { id: "abc", declarations: [{ property: "color", value: "red" }] },
      { id: "none", declarations: [] },
    ],
  });
  expect(css).toBe(EXPECTED);
});

test("a font stack with quoted family names is emitted, and a broken or unsafe one is dropped (QA-1)", () => {
  const fonts = [
    { id: "single", name: "Single", value: "'Inter', sans-serif" },
    { id: "double", name: "Double", value: '"Noto Sans", system-ui, -apple-system, sans-serif' },
    { id: "open", name: "Open", value: "'Inter, sans-serif" },
    { id: "break", name: "Break", value: "'x'}body{color:red}" },
    { id: "escape", name: "Escape", value: "'a\\27'" },
    { id: "close", name: "Close", value: "'a</style>'" },
    { id: "semi", name: "Semi", value: "'a';color:red" },
    { id: "empty", name: "Empty", value: "''" },
  ];
  const css = generateCss({
    design: { schemaVersion: 12, variables: { colors: [], fonts } },
    usedTypes: new Set(),
    baseCss: new Map(),
    localRules: [],
  });
  expect(css).toBe(
    `.emvb-root{--emvb-f-single:'Inter', sans-serif;--emvb-f-double:"Noto Sans", system-ui, -apple-system, sans-serif}`,
  );
});

test("an empty design emits no variable block", () => {
  const css = generateCss({
    design: { schemaVersion: 12, variables: { colors: [] } },
    usedTypes: new Set(),
    baseCss: new Map(),
    localRules: [],
  });
  expect(css).toBe("");
});

const EXPECTED =
  ".emvb-root{--emvb-c-brand:#112233;--emvb-f-body:Inter, sans-serif;--emvb-fs-lg:1.5rem;--emvb-s-gap:16px}.emvb-heading{margin:0}.emvb-text{margin:0}.emvb-k-card{color:#abcdef}.emvb-e-abc{color:red}";

test("W-321: a font's files become @font-face rules for its first family, before everything else", () => {
  const css = generateCss({
    design: {
      schemaVersion: 12,
      variables: {
        colors: [],
        fonts: [
          {
            id: "sans",
            name: "Roboto",
            value: "Roboto, Arial, sans-serif",
            files: [
              { url: "/fonts/roboto-400.woff2" },
              { url: "/fonts/roboto-700.woff2", weight: 700 },
              { url: "/fonts/roboto-400i.ttf", style: "italic" },
              { url: '/fonts/x.woff2");}body{color:red' },
            ],
          },
          { id: "bad", name: "Bad", value: "a{b}, serif", files: [{ url: "/fonts/b.woff2" }] },
          { id: "quoted", name: "Q", value: '"Open Sans", sans-serif', files: [{ url: "/o.otf" }] },
        ],
      },
    } as DesignSystem,
    usedTypes: new Set(),
    baseCss: new Map(),
    localRules: [],
  });
  expect(css.startsWith("@font-face{")).toBe(true);
  expect(css).toContain(
    '@font-face{font-family:"Roboto";src:url("/fonts/roboto-400.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}',
  );
  expect(css).toContain('url("/fonts/roboto-700.woff2") format("woff2");font-weight:700');
  expect(css).toContain(
    'url("/fonts/roboto-400i.ttf") format("truetype");font-weight:400;font-style:italic',
  );
  expect(css).toContain('@font-face{font-family:"Open Sans";src:url("/o.otf") format("opentype")');
  expect(css).not.toContain("color:red");
  expect(css).not.toContain("/fonts/b.woff2");
});
