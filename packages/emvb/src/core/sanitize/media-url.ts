import { sanitizeUrl } from "./url.ts";

const MEDIA_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);

/** Allowed image and media `src` values (R-032): http(s) and same-origin relative paths. */
export const sanitizeMediaUrl = (value: string): string | undefined =>
  sanitizeUrl(value, MEDIA_SCHEMES);

/**
 * W-321: a font file URL safe to put in `@font-face` `src: url("…")`: an allowed media URL to a
 * .woff2, .woff, .ttf or .otf file, with nothing that could close the string or the url().
 */
export const isFontFileUrl = (value: string): boolean =>
  sanitizeMediaUrl(value) === value &&
  !/[()\\\s"'`<>]/.test(value) &&
  /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(value);
