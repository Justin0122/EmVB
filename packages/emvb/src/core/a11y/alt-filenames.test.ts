import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const rules = (alt: string) =>
  auditPage(
    {
      schemaVersion: 15,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          { id: "imag0001", type: "image", props: { src: "/a.png", alt } },
        ],
      },
    } as unknown as Layout,
    emptyDesign(),
  ).issues.map((i) => i.rule);

describe("file-name alt text with spaces (W-431)", () => {
  test("screenshot and chat-app names are flagged", () => {
    expect(rules("Screenshot 2026-10-01 at 10.00.00")).toEqual(["image-alt"]);
    expect(rules("Screen Shot 2020-01-01 at 9.41.12 AM")).toEqual(["image-alt"]);
    expect(rules("WhatsApp Image 2024-05-02 at 12.01.33")).toEqual(["image-alt"]);
  });
  test("real descriptions are not", () => {
    expect(rules("Screenshot of the settings panel")).toEqual([]);
    expect(rules("Team photo, 2024")).toEqual([]);
  });
});
