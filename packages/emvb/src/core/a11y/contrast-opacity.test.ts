import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const flagged = (textOpacity?: number, boxOpacity?: number) =>
  auditPage(
    {
      schemaVersion: 15,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: { backgroundColor: "#ffffff" },
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          {
            id: "box00001",
            type: "container",
            props: {},
            style: boxOpacity === undefined ? {} : { opacity: boxOpacity },
            children: [
              {
                id: "text0001",
                type: "text",
                props: { text: "Body" },
                style: {
                  color: "#000000",
                  ...(textOpacity === undefined ? {} : { opacity: textOpacity }),
                },
              },
            ],
          },
        ],
      },
    } as unknown as Layout,
    emptyDesign(),
  ).issues.some((i) => i.rule === "contrast" && i.nodeId === "text0001");

describe("contrast counts opacity (W-415)", () => {
  test("faded text is flagged, on itself or from a parent", () => {
    expect(flagged(0.1)).toBe(true);
    expect(flagged(undefined, 0.15)).toBe(true);
    expect(flagged(0.5, 0.5)).toBe(true);
  });
  test("solid or lightly faded text is fine", () => {
    expect(flagged()).toBe(false);
    expect(flagged(0.9)).toBe(false);
  });
});

describe("no colour fix when opacity is the cause (W-421)", () => {
  test("the issue says to raise the opacity and offers no fix", () => {
    const issue = auditPage(
      {
        schemaVersion: 15,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          style: { backgroundColor: "#ffffff" },
          children: [
            { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
            {
              id: "text0001",
              type: "text",
              props: { text: "Body" },
              style: { color: "#000000", opacity: 0.1 },
            },
          ],
        },
      } as unknown as Layout,
      emptyDesign(),
    ).issues.find((i) => i.rule === "contrast");
    expect(issue?.message).toContain("raise the opacity");
    expect(issue?.fix).toBeUndefined();
  });
});
