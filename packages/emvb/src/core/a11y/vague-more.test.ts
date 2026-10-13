import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const rules = (text: string) =>
  auditPage(
    {
      schemaVersion: 15,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          { id: "butt0001", type: "button", props: { text, href: "/x" } },
        ],
      },
    } as unknown as Layout,
    emptyDesign(),
  ).issues.map((i) => i.rule);

describe("more vague link phrasings (W-432)", () => {
  test("common phrasings are flagged", () => {
    for (const text of [
      "See more",
      "More info",
      "More information…",
      "Details",
      "Continue reading →",
      "Find out more",
    ]) {
      expect(rules(text)).toEqual(["vague-link"]);
    }
  });
  test("specific link text is fine", () => {
    expect(rules("See more pricing plans")).toEqual([]);
    expect(rules("Shipping details")).toEqual([]);
  });
});
