import { sameJson } from "../stable-json.ts";
import { nameKey } from "./classes.ts";
import { emptyDesign, type DesignSystem } from "../schema/design.ts";

export type DesignConflict = { kind: "variable" | "class" | "setting"; name: string };

/** Key order is ignored: an edit that removes and re-adds a value is no change (W-519). */
const same = sameJson;

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
  /** Ids whose kept copy is this tab's change (W-620). */
  const fromUs = new Set<string>();
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
      if (ourItem && !same(ourItem, theirItem)) fromUs.add(ourItem.id);
      if (ourItem) result.push(ourItem);
      return;
    }
    conflicts.push({ kind, name: ourItem?.name ?? theirItem?.name ?? id });
    if (theirItem) result.push(theirItem);
  };
  for (const item of theirItems) take(item.id);
  for (const item of ourItems) take(item.id);
  // W-620: this tab and the other one each named a different class (or variable) the same, so the
  // merge would keep two with one name; names must stay unique, so it's a conflict.
  const theirNames = new Map(
    result.filter((item) => !fromUs.has(item.id)).map((item) => [nameKey(item.name), item.id]),
  );
  const clashes = result.filter((item) => {
    if (!fromUs.has(item.id)) return false;
    const other = theirNames.get(nameKey(item.name));
    return other !== undefined && other !== item.id;
  });
  if (clashes.length === 0) return result;
  for (const item of clashes) conflicts.push({ kind, name: item.name });
  // The server copy stays, as in any conflict: their version of a renamed item, nothing for a new one.
  const clashed = new Set(clashes.map((item) => item.id));
  return result.flatMap((item) => {
    if (!clashed.has(item.id)) return [item];
    const theirItem = theirsBy.get(item.id);
    return theirItem ? [theirItem] : [];
  });
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
