/**
 * The shared URL check behind hrefs and media sources (R-032): a URL with one of `schemes`, or a
 * same-site relative one. Other schemes (javascript:, data:, vbscript:…) are refused, including
 * case and whitespace tricks.
 */
export function sanitizeUrl(value: string, schemes: ReadonlySet<string>): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) return undefined;
  // No HTML metacharacters or control chars in any URL.
  for (const ch of trimmed) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127 || "<>\"'`".includes(ch)) return undefined;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (!hasScheme) {
    // Browsers resolve `//host` and `/\host` to another site; EmDash 1.0 refuses them for `url` fields too.
    if (/^\/[/\\]/.test(trimmed)) return undefined;
    // A normal space can sit in a relative path. Any other whitespace, or a backslash, is how a
    // second address hides in the same string.
    if (/[^\S ]|\\/.test(trimmed)) return undefined;
    // Relative: /path, ./path, ../path, ?query, #hash, or bare path segment
    // W-683: or one that starts in another script ("über-uns", "контакты"), like page slugs (W-554).
    if (/^(?:[/?#.]|[\p{L}\p{N}._~-])/u.test(trimmed)) return trimmed;
    return undefined;
  }

  // Parse the string we will return. Stripping whitespace first, then returning the original,
  // accepted `https://site/a.png 1w, https://evil/x` because only the stripped copy was checked.
  if (/[\s\\]/.test(trimmed)) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  // `user:pass@host` would publish the password in the page.
  if (parsed.username || parsed.password) return undefined;
  return schemes.has(parsed.protocol.toLowerCase()) ? trimmed : undefined;
}
