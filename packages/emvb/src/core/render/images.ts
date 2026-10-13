import type { VNode } from "./vnode.ts";

/**
 * W-333: responsive images. A host that can resize images (an EmDash site, through Astro's image
 * endpoint) passes a resizer; every `<img>` it can resize gets a `srcset` of smaller copies and
 * `sizes`, and every background image in the CSS a copy at the widest width. Without a resizer,
 * or for an image it returns null for, the original stays.
 */
export type ImageResizer = (src: string, width: number) => string | null;

/** The widths offered in a `srcset`: phones, tablets, laptops and large screens. */
const IMAGE_WIDTHS = [480, 768, 1080, 1440, 1920] as const;

/** The width a plain `src` (and a background image) asks for. */
const FALLBACK_WIDTH = 1080;
const BACKGROUND_WIDTH = 1920;

/** Widths for an image shown `width` px wide at most: up to twice that, for sharp screens. */
function widthsFor(width: number | undefined): number[] {
  if (!width) return [...IMAGE_WIDTHS];
  const cap = Math.min(width * 2, BACKGROUND_WIDTH);
  return [...new Set([...IMAGE_WIDTHS.filter((w) => w < cap), cap])];
}

function responsiveImg(node: VNode, resize: ImageResizer) {
  const src = node.attrs["src"];
  if (!src || node.attrs["srcset"]) return;
  const width = Number(node.attrs["width"]) || undefined;
  const widths = widthsFor(width);
  const urls = widths.map((w) => resize(src, w));
  if (urls.some((url) => !url)) return;
  node.attrs["srcset"] = urls.map((url, i) => `${url} ${widths[i]}w`).join(", ");
  // A lazy image is laid out before it loads, so the browser can pick by its real size; others
  // (the first big image) take the window's width, or their own when they say it.
  node.attrs["sizes"] =
    node.attrs["loading"] === "lazy"
      ? `auto, ${width ? `(max-width: ${width}px) 100vw, ${width}px` : "100vw"}`
      : width
        ? `(max-width: ${width}px) 100vw, ${width}px`
        : "100vw";
  node.attrs["src"] = resize(src, Math.min(FALLBACK_WIDTH, widths.at(-1) ?? FALLBACK_WIDTH)) ?? src;
}

/** Adds `srcset` and `sizes` to the tree's resizable images, in place. */
export function responsiveImages(node: VNode, resize: ImageResizer): void {
  if (node.tag === "img") responsiveImg(node, resize);
  for (const child of node.children) if (typeof child !== "string") responsiveImages(child, resize);
}

/**
 * The CSS with each background image swapped for a resized copy. Values were sanitized into
 * `url("…")` without quotes or parentheses inside, and a copy whose URL would break out of
 * that is not used.
 */
export function responsiveBackgrounds(css: string, resize: ImageResizer): string {
  return css.replace(/url\("([^"()\\\s]+)"\)/g, (whole, src: string) => {
    const resized = resize(src, BACKGROUND_WIDTH);
    return resized && !/["()\\\s]/.test(resized) ? `url("${resized}")` : whole;
  });
}
