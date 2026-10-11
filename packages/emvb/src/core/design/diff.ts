import type { DesignSystem } from "../schema/design.ts";

export type DesignChange = {
  kind: "added" | "removed" | "changed";
  what: "variable" | "class" | "setting";
  name: string;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What Publish styles will write: draft compared with the published design (W-340). */
export function designChanges(published: DesignSystem, draft: DesignSystem): DesignChange[] {
  const changes: DesignChange[] = [];
  listChanges(published.variables.colors, draft.variables.colors, "variable", changes);
  listChanges(published.variables.fonts, draft.variables.fonts, "variable", changes);
  listChanges(published.variables.fontSizes, draft.variables.fontSizes, "variable", changes);
  listChanges(published.variables.spacings, draft.variables.spacings, "variable", changes);
  listChanges(published.classes, draft.classes, "class", changes);
  if (!same(published.direction, draft.direction)) {
    changes.push({ kind: "changed", what: "setting", name: "Direction" });
  }
  if (!same(published.fluidRange, draft.fluidRange)) {
    changes.push({ kind: "changed", what: "setting", name: "Fluid range" });
  }
  if (!same(published.defaults, draft.defaults)) {
    changes.push({ kind: "changed", what: "setting", name: "Tag defaults" });
  }
  return changes;
}

export function designChangeLabel(change: DesignChange): string {
  const noun =
    change.what === "class" ? "Class" : change.what === "setting" ? "Setting" : "Variable";
  if (change.kind === "added") return `Add ${noun.toLowerCase()} ${change.name}`;
  if (change.kind === "removed") return `Remove ${noun.toLowerCase()} ${change.name}`;
  return `Change ${noun.toLowerCase()} ${change.name}`;
}

function listChanges<T extends { id: string; name: string }>(
  published: T[] | undefined,
  draft: T[] | undefined,
  what: "variable" | "class",
  into: DesignChange[],
) {
  const from = new Map((published ?? []).map((item) => [item.id, item]));
  const to = new Map((draft ?? []).map((item) => [item.id, item]));
  for (const item of draft ?? []) {
    const before = from.get(item.id);
    if (!before) into.push({ kind: "added", what, name: item.name });
    else if (!same(before, item)) into.push({ kind: "changed", what, name: item.name });
  }
  for (const item of published ?? []) {
    if (!to.has(item.id)) into.push({ kind: "removed", what, name: item.name });
  }
}
