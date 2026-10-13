import type { ImageResizer } from "../core/render/images.ts";

/** Where EmDash serves its media library's files. */
const MEDIA_PREFIX = "/_emdash/api/media/file/";
/** A media file's key: what EmDash's image endpoint accepts (no slashes, dots or escapes). */
const MEDIA_KEY = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,8}$/;
/** Formats Astro's image service can resize; SVGs and GIFs are served as they are. */
const RESIZABLE = /\.(?:jpe?g|png|webp|avif|tiff?)$/i;

/**
 * W-333: an EmDash media image at `width` px, as WebP, through Astro's image endpoint. EmDash
 * installs that endpoint so it reads its own media from storage and runs Astro's image service
 * (sharp on Node, the Images binding on Cloudflare). Anything that isn't an EmDash media image
 * keeps its URL.
 */
export const resizeEmDashImage: ImageResizer = (src, width) => {
  if (!src.startsWith(MEDIA_PREFIX)) return null;
  const key = src.slice(MEDIA_PREFIX.length);
  if (!MEDIA_KEY.test(key) || !RESIZABLE.test(key)) return null;
  return `/_image?href=${encodeURIComponent(src)}&w=${width}&f=webp`;
};
