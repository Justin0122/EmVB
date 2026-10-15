import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

describe("the page root is never hidden (W-567)", () => {
  test("a root stored as hidden on every device still shows the page", () => {
    const layout = {
      schemaVersion: 16,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        hiddenOn: ["desktop", "tablet", "mobile"],
        children: [{ id: "head0001", type: "heading", props: { level: 1, text: "Hi" } }],
      },
    } as unknown as Layout;
    const r = renderPage(layout, emptyDesign());
    expect(r.html).toContain("Hi");
    expect(r.css).not.toContain(".emvb-e-root0001{display:none}");
  });
});
