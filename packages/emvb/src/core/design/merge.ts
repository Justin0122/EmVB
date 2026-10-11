import { emptyDesign, type DesignSystem } from "../schema/design.ts";

export type DesignConflict = { kind: "variable" | "class" | "setting"; name: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Named = { id: string; name: string };

/**
 * Replays `ours` (what this tab tried to save) onto `theirs` (what the server has now),
 * starting from `base` (what this tab last loaded). A list item this tab changed is kept
 * when the server still has the base copy. When both sides changed the same item, the
 * server copy stays and the name is reported. Nothing is overwritten silently.
 */
export function mergeDesign(
  base: DesignSystem | undefined,
  ours: DesignSystem,
  theirs: DesignSystem,
): { design: DesignSystem; conflicts: DesignConflict[] } {
  const from = base ?? emptyDesign();
  const conflicts: DesignConflict[] = [];
  const design: DesignSystem = {
    ...theirs,
    variables: {
      colors: mergeList(
        from.variables.colors,
        ours.variables.colors,
        theirs.variables.colors,
        conflicts,
        "variable",
      ),
      fonts: mergeList(
        from.variables.fonts,
        ours.variables.fonts,
        theirs.variables.fonts,
        conflicts,
        "variable",
      ),
      fontSizes: mergeList(
        from.variables.fontSizes,
        ours.variables.fontSizes,
        theirs.variables.fontSizes,
        conflicts,
        "variable",
      ),
      spacings: mergeList(
        from.variables.spacings,
        ours.variables.spacings,
        theirs.variables.spacings,
        conflicts,
        "variable",
      ),
    },
    classes: mergeList(from.classes, ours.classes, theirs.classes, conflicts, "class"),
    fluidRange: pickSetting(
      from.fluidRange,
      ours.fluidRange,
      theirs.fluidRange,
      conflicts,
      "Fluid range",
    ),
    direction: pickSetting(
      from.direction,
      ours.direction,
      theirs.direction,
      conflicts,
      "Direction",
    ),
    defaults: pickSetting(from.defaults, ours.defaults, theirs.defaults, conflicts, "Tag defaults"),
  };
  return { design, conflicts };
}

function mergeList<T extends Named>(
  base: T[] | undefined,
  ours: T[] | undefined,
  theirs: T[] | undefined,
  conflicts: DesignConflict[],
  kind: "variable" | "class",
): T[] {
  const baseItems = base ?? [];
  const ourItems = ours ?? [];
  const theirItems = theirs ?? [];
  const by = (list: T[]) => new Map(list.map((item) => [item.id, item]));
  const baseBy = by(baseItems);
  const oursBy = by(ourItems);
  const theirsBy = by(theirItems);
  const result: T[] = [];
  const seen = new Set<string>();
  const take = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const baseItem = baseBy.get(id);
    const ourItem = oursBy.get(id);
    const theirItem = theirsBy.get(id);
    const weChanged = !same(baseItem, ourItem);
    const theyChanged = !same(baseItem, theirItem);
    if (!weChanged) {
      if (theirItem) result.push(theirItem);
      return;
    }
    if (!theyChanged || same(ourItem, theirItem)) {
      if (ourItem) result.push(ourItem);
      return;
    }
    conflicts.push({ kind, name: ourItem?.name ?? theirItem?.name ?? id });
    if (theirItem) result.push(theirItem);
  };
  for (const item of theirItems) take(item.id);
  for (const item of ourItems) take(item.id);
  return result;
}

function pickSetting<T>(
  base: T | undefined,
  ours: T | undefined,
  theirs: T | undefined,
  conflicts: DesignConflict[],
  name: string,
): T | undefined {
  const weChanged = !same(base, ours);
  const theyChanged = !same(base, theirs);
  if (!weChanged) return theirs;
  if (!theyChanged || same(ours, theirs)) return ours;
  conflicts.push({ kind: "setting", name });
  return theirs;
}
