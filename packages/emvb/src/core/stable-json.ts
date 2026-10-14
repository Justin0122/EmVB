/** Keys sorted at every level: a saved copy comes back in schema order, not edit order. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return Object.fromEntries(entries.map(([k, v]) => [k, sorted(v)]));
}

/** JSON text that ignores key order, to compare a saved copy with an edited one (W-518, W-519). */
export const stableJson = (value: unknown): string => JSON.stringify(sorted(value));

/** Same content, whatever the key order (W-519). */
export const sameJson = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);
