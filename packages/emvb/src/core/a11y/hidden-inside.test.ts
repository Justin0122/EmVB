import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const issues = (box: Record<string, unknown>) =>
  auditPage(
    {
      schemaVersion: 15,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          {
            id: "boxx0001",
            type: "container",
            props: {},
            ...box,
            children: [{ id: "butt0001", type: "button", props: { text: "Buy", href: "/buy" } }],
          },
        ],
      },
    } as unknown as Layout,
    emptyDesign(),
  ).issues.map((i) => `${i.rule}:${i.nodeId}:${i.fix ? "fix" : "nofix"}`);

describe("links inside an aria-hidden box (W-446)", () => {
  test("are reported, without a fix on the link itself", () => {
    expect(issues({ attributes: [{ name: "aria-hidden", value: "true" }] })).toEqual([
      "hidden-focusable:butt0001:nofix",
    ]);
  });
  test("a box without aria-hidden is fine", () => {
    expect(issues({})).toEqual([]);
  });
});
