import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const contrast = (color: string, bg: string) =>
  auditPage(
    {
      schemaVersion: 15,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: { backgroundColor: bg },
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          { id: "text0001", type: "text", props: { text: "Body" }, style: { color } },
        ],
      },
    } as unknown as Layout,
    emptyDesign(),
  )
    .issues.filter((i) => i.rule === "contrast")
    .map((i) => i.nodeId);

describe("contrast counts a colour's transparency (W-412)", () => {
  test("faint black text on white is flagged", () => {
    expect(contrast("#00000022", "#ffffff")).toContain("text0001");
    expect(contrast("#0003", "#fff")).toContain("text0001");
  });
  test("solid or nearly solid dark text is fine", () => {
    expect(contrast("#000000", "#ffffff")).toEqual([]);
    expect(contrast("#000000ee", "#ffffff")).toEqual([]);
  });
});
