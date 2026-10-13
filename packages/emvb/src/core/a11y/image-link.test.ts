import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const audit = (props: Record<string, unknown>) =>
  auditPage(
    {
      schemaVersion: 15,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { level: 1, text: "Title" } },
          { id: "img00001", type: "image", props: { src: "/a.png", alt: "", ...props } },
        ],
      },
    } as unknown as Layout,
    emptyDesign(),
  ).issues;

describe("linked images in the accessibility check (W-386)", () => {
  test("a decorative image that is a link has no link name", () => {
    const issues = audit({ decorative: true, href: "/home" });
    expect(issues.map((i) => i.id)).toEqual(["link-name:img00001"]);
  });

  test("a linked image with no alt is not offered Mark as decorative", () => {
    const [issue] = audit({ href: "/home" });
    expect(issue?.rule).toBe("image-alt");
    expect(issue?.fix).toBeUndefined();
    expect(audit({})[0]?.fix).toEqual({ kind: "decorative" });
  });

  test("a linked image that opens a new tab says so in its alt", () => {
    expect(audit({ alt: "Our team photo", href: "/t", newTab: true }).map((i) => i.rule)).toEqual([
      "new-tab",
    ]);
    expect(audit({ alt: "Team (opens in a new tab)", href: "/t", newTab: true })).toEqual([]);
  });
});
