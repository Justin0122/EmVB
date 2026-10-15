import type { DesignSystem } from "../core/index.ts";
import { McpToolError } from "./errors.ts";

type From = "color" | "font" | "fontSize" | "spacing";

const KINDS: [keyof DesignSystem["variables"], From][] = [
  ["colors", "color"],
  ["fonts", "font"],
  ["fontSizes", "fontSize"],
  ["spacings", "spacing"],
];

/** True when `value` nests objects or arrays more than `max` levels, checked without recursion. */
export function nestsDeeperThan(value: unknown, max: number): boolean {
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length > 0) {
    const [item, depth] = stack.pop() as [unknown, number];
    if (typeof item !== "object" || item === null) continue;
    if (depth > max) return true;
    for (const child of Object.values(item)) stack.push([child, depth + 1]);
  }
  return false;
}

/** Deeper than any element spec or style the tools accept; refused before the walk below recurses (W-652). */
const MAX_INPUT_NESTING = 256;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isRef = (v: Record<string, unknown>) =>
  typeof v["var"] === "string" && Object.keys(v).every((k) => k === "var" || k === "from");

/**
 * Live MCP test (W-474): agents wrote `{ "var": "display" }` for a font and the style was
 * silently dropped, because only colours may leave out `from`. This fills in `from` from the
 * variable's kind and refuses ids that don't exist, so a typo can't fall back without a word.
 * Class names in `classes` are checked the same way.
 */
export function resolveDesignRefs<T>(value: T, design: DesignSystem): T {
  if (nestsDeeperThan(value, MAX_INPUT_NESTING)) {
    throw new McpToolError("INVALID_INPUT", "This input nests too deeply.");
  }
  const kinds = new Map<string, From[]>();
  for (const [key, from] of KINDS) {
    for (const v of design.variables[key] ?? [])
      kinds.set(v.id, [...(kinds.get(v.id) ?? []), from]);
  }
  const classIds = new Set((design.classes ?? []).map((c) => c.id));
  const unknown = new Set<string>();
  const unknownClasses = new Set<string>();
  const ambiguous = new Set<string>();
  const walk = (v: unknown, key?: string): unknown => {
    if (Array.isArray(v)) {
      if (key === "classes") {
        for (const c of v) if (typeof c === "string" && !classIds.has(c)) unknownClasses.add(c);
        return v;
      }
      return v.map((x) => walk(x));
    }
    if (!isRecord(v)) return v;
    if (isRef(v)) {
      const id = v["var"] as string;
      const found = kinds.get(id);
      if (!found) {
        unknown.add(id);
        return v;
      }
      const given = v["from"] as From | undefined;
      const from =
        given && found.includes(given) ? given : found.length === 1 ? found[0] : undefined;
      if (!from) {
        ambiguous.add(id);
        return v;
      }
      return from === "color" ? { var: id } : { var: id, from };
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
  };
  const out = walk(value) as T;
  const problems: string[] = [];
  if (unknown.size > 0) {
    const list = KINDS.map(
      ([key]) => `${key}: ${(design.variables[key] ?? []).map((x) => x.id).join(", ") || "none"}`,
    ).join("; ");
    problems.push(
      `Unknown variable ${[...unknown].map((id) => `"${id}"`).join(", ")}. Variables are ${list}.`,
    );
  }
  if (ambiguous.size > 0) {
    problems.push(
      `${[...ambiguous].map((id) => `"${id}"`).join(", ")} names more than one kind of variable; add "from" ("color", "font", "fontSize" or "spacing").`,
    );
  }
  if (unknownClasses.size > 0) {
    problems.push(
      `Unknown class ${[...unknownClasses].map((id) => `"${id}"`).join(", ")}. Classes are ${[...classIds].join(", ") || "none"}; add one with update_site_styles first.`,
    );
  }
  if (problems.length > 0) throw new McpToolError("INVALID_INPUT", problems.join(" "));
  return out;
}
