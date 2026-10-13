import { sanitizeHref } from "../../../../core/index.ts";

const GENERIC = "Use a full URL such as https://example.com or a path such as /pricing.";

/**
 * Why a typed link can't be used, or null when it can (W-429). The generic hint told people who
 * had typed a full URL to type a full URL; the common causes get their own message.
 */
export function hrefError(value: string, message = GENERIC): string | null {
  const trimmed = value.trim();
  if (sanitizeHref(trimmed)) return null;
  if (/^https?:\/\/\S*\s/i.test(trimmed)) {
    return "Links can't contain spaces. Replace each space with %20.";
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^(https?|mailto|tel):/i.test(trimmed)) {
    return "Only web (https://), email (mailto:) and phone (tel:) links are allowed.";
  }
  return message;
}
