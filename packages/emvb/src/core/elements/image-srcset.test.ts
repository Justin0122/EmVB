import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";

const page = (props: Record<string, unknown>) =>
  ({
    schemaVersion: 15,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "img00001", type: "image", props: { src: "/a.png", alt: "A", ...props } }],
    },
  }) as unknown as Layout;

const srcset = (props: Record<string, unknown>) =>
  /srcset="([^"]*)"/.exec(renderPage(page(props), emptyDesign()).html)?.[1];

describe("srcset keeps the main image (W-385)", () => {
  test("the main image is listed with its Width so wide screens don't get only the small file", () => {
    expect(srcset({ width: 1600, sources: [{ src: "/a-400.png", width: 400 }] })).toBe(
      "/a-400.png 400w, /a.png 1600w",
    );
  });

  test("a source entry for the main image gives its width", () => {
    expect(
      srcset({
        width: 50,
        sources: [
          { src: "/a.png", width: 1200 },
          { src: "/a-600.png", width: 600 },
        ],
      }),
    ).toBe("/a-600.png 600w, /a.png 1200w");
  });

  test("only the main image, or no known width, adds nothing new", () => {
    expect(srcset({ sources: [{ src: "/a.png", width: 800 }] })).toBeUndefined();
    expect(srcset({ sources: [{ src: "/a-400.png", width: 400 }] })).toBe("/a-400.png 400w");
  });
});
