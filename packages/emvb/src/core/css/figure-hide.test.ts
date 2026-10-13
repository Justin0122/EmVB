import { describe, expect, test } from "bun:test";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";

const page = (props: Record<string, unknown>) =>
  ({
    schemaVersion: 15,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "imag0001",
          type: "image",
          hiddenOn: ["mobile"],
          props: { src: "/a.png", alt: "A", ...props },
        },
      ],
    },
  }) as unknown as Layout;

describe("a hidden captioned image hides its caption (W-443)", () => {
  test("the figure is hidden with the image", () => {
    const { css } = renderPage(page({ caption: "Cap" }), emptyDesign());
    expect(css).toContain(".emvb-figure:has(>.emvb-e-imag0001,>a>.emvb-e-imag0001)");
  });
  test("without a caption nothing extra is written", () => {
    expect(renderPage(page({}), emptyDesign()).css).not.toContain(".emvb-figure:has(");
  });
});
