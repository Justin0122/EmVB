import { sanitizeUrl } from "./url.ts";

const HREF_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Allowed public hrefs (R-032): http(s), mailto, tel, and relative paths, queries and hashes. */
export function sanitizeHref(value: string): string | undefined {
  // W-417: phone numbers are usually written with spaces ("tel:+1 555 010 0199"); the spaces
  // made the link fall back to "#". They're dropped, as phones ignore them anyway.
  if (/^\s*tel:/i.test(value)) return sanitizeUrl(value.replace(/\s+/g, ""), HREF_SCHEMES);
  // W-427: "www.example.com" is a site, not a page path next to the current one.
  const trimmed = value.trim().replace(/^www\./i, (w) => `https://${w}`);
  // W-428: a plain space in an email link ("mailto:me@x.com?subject=Hi there") is encoded, as a
  // browser would; the link used to fall back to "#". Web addresses with spaces are still refused.
  return sanitizeUrl(
    /^mailto:/i.test(trimmed) ? trimmed.replaceAll(" ", "%20") : trimmed,
    HREF_SCHEMES,
  );
}
