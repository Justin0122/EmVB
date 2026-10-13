import { sanitizeUrl } from "./url.ts";

const HREF_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Allowed public hrefs (R-032): http(s), mailto, tel, and relative paths, queries and hashes. */
export const sanitizeHref = (value: string): string | undefined =>
  // W-417: phone numbers are usually written with spaces ("tel:+1 555 010 0199"); the spaces
  // made the link fall back to "#". They're dropped, as phones ignore them anyway.
  sanitizeUrl(/^\s*tel:/i.test(value) ? value.replace(/\s+/g, "") : value, HREF_SCHEMES);
