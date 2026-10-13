import { StyleProps } from "../../../../core/index.ts";

/** Style keys a container-query style may set (W-398). */
export const QUERY_STYLE_KEYS: readonly string[] = Object.keys(StyleProps.shape).toSorted();

/** A stored style value as one line of text: `16px`, `auto`, `#112233`, `var(--name)` (W-398). */
export function formatStyleValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length === 2 &&
      typeof record["value"] === "number" &&
      typeof record["unit"] === "string"
    ) {
      return `${record["value"]}${record["unit"]}`;
    }
    if (typeof record["var"] === "string" && Object.keys(record).length === 1) {
      return `var(--${record["var"]})`;
    }
  }
  return JSON.stringify(value);
}

/** Readings of `text` to try, most specific first. */
function candidates(text: string): unknown[] {
  const out: unknown[] = [];
  const length = /^(-?\d+(?:\.\d+)?)([a-z%]+)$/i.exec(text);
  if (length) out.push({ value: Number(length[1]), unit: (length[2] as string).toLowerCase() });
  const variable = /^var\(--([a-z0-9-]{1,40})\)$/.exec(text);
  if (variable) out.push({ var: variable[1] });
  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    out.push(Number(text));
    // W-404: a bare number on a length property means px, as in the Style tab.
    out.push({ value: Number(text), unit: "px" });
  }
  // W-404: keywords are lowercase in the schema; AUTO or Row should still work.
  if (/^[A-Za-z-]+$/.test(text) && text !== text.toLowerCase()) out.push(text.toLowerCase());
  if (text === "true" || text === "false") out.push(text === "true");
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      out.push(JSON.parse(text));
    } catch {
      // not JSON; the plain string reading below reports the error
    }
  }
  out.push(text);
  return out;
}

/** The value `key` would store for `text`, or why it can't (W-398). */
export function parseStyleValue(key: string, text: string): { value: unknown } | { error: string } {
  const schema = (
    StyleProps.shape as Record<string, { safeParse: (v: unknown) => { success: boolean } }>
  )[key];
  if (!schema) return { error: `${key} isn't a style property.` };
  const trimmed = text.trim();
  if (trimmed === "") return { error: "Enter a value." };
  for (const candidate of candidates(trimmed)) {
    if (candidate !== undefined && schema.safeParse(candidate).success) return { value: candidate };
  }
  return { error: `"${trimmed.slice(0, 40)}" isn't a value ${key} accepts.` };
}
