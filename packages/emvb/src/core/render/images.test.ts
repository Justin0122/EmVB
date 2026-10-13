import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { responsiveBackgrounds, responsiveImages, type ImageResizer } from "./images.ts";
import { renderPage } from "./index.ts";
import type { VNode } from "./vnode.ts";

const resize: ImageResizer = (src, width) =>
  src.startsWith("/media/") ? `/img?u=${src}&w=${width}` : null;
const img = (attrs: Record<string, string>): VNode => ({ tag: "img", attrs, children: [] });
const n = (node: Record<string, unknown>) => node as unknown as LayoutNode;

describe("responsive images (W-333)", () => {
  test("a resizable image gets a srcset of smaller copies, sizes, and a smaller src", () => {
    const node = img({ src: "/media/a.png", loading: "lazy" });
    responsiveImages({ tag: "div", attrs: {}, children: [node] }, resize);
    expect(node.attrs["srcset"]).toBe(
      "/img?u=/media/a.png&w=480 480w, /img?u=/media/a.png&w=768 768w, /img?u=/media/a.png&w=1080 1080w, /img?u=/media/a.png&w=1440 1440w, /img?u=/media/a.png&w=1920 1920w",
    );
    expect(node.attrs["sizes"]).toBe("auto, 100vw");
    expect(node.attrs["src"]).toBe("/img?u=/media/a.png&w=1080");
  });

  test("an image that says its width gets copies up to twice that; one loading right away its own sizes", () => {
    const node = img({ src: "/media/a.png", width: "300", loading: "eager" });
    responsiveImages(node, resize);
    expect(node.attrs["srcset"]).toBe(
      "/img?u=/media/a.png&w=480 480w, /img?u=/media/a.png&w=600 600w",
    );
    expect(node.attrs["sizes"]).toBe("(max-width: 300px) 100vw, 300px");
    expect(node.attrs["src"]).toBe("/img?u=/media/a.png&w=600");
  });

  test("images the resizer can't take, or with their own srcset, stay as they are", () => {
    const other = img({ src: "/logo.svg" });
    const own = img({ src: "/media/a.png", srcset: "/x 1x" });
    responsiveImages({ tag: "div", attrs: {}, children: [other, own] }, resize);
    expect(other.attrs).toEqual({ src: "/logo.svg" });
    expect(own.attrs).toEqual({ src: "/media/a.png", srcset: "/x 1x" });
  });

  test("background images become the widest copy; unsafe copies are not used", () => {
    expect(responsiveBackgrounds('.a{background-image:url("/media/b.jpg")}', resize)).toBe(
      '.a{background-image:url("/img?u=/media/b.jpg&w=1920")}',
    );
    expect(responsiveBackgrounds('.a{background-image:url("/media/b.jpg")}', () => '/x")')).toBe(
      '.a{background-image:url("/media/b.jpg")}',
    );
  });

  test("renderPage resizes on the published page only", () => {
    const layout = {
      schemaVersion: 12,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: { backgroundImage: "/media/bg.jpg" },
        children: [n({ id: "imag0001", type: "image", props: { src: "/media/a.png", alt: "A" } })],
      },
    } as Layout;
    const pub = renderPage(layout, emptyDesign(), { resizeImage: resize });
    expect(pub.html).toContain("srcset=");
    expect(pub.css).toContain("/img?u=/media/bg.jpg&amp;w=1920".replace("&amp;", "&"));
    const editor = renderPage(layout, emptyDesign(), { mode: "editor", resizeImage: resize });
    expect(editor.html).not.toContain("srcset=");
    expect(editor.css).not.toContain("/img?");
  });
});
