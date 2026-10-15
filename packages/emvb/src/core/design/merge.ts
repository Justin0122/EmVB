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
        200,
      ),
      fonts: mergeList(
        from.variables.fonts,
        ours.variables.fonts,
        theirs.variables.fonts,
        conflicts,
        "variable",
        50,
      ),
      fontSizes: mergeList(
        from.variables.fontSizes,
        ours.variables.fontSizes,
        theirs.variables.fontSizes,
        conflicts,
        "variable",
        50,
      ),
      spacings: mergeList(
        from.variables.spacings,
        ours.variables.spacings,
        theirs.variables.spacings,
        conflicts,
        "variable",
        100,
      ),
    },
    classes: mergeList(from.classes, ours.classes, theirs.classes, conflicts, "class", 100),
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
  /** The list's limit in schema/design.ts. */
  max: number,
): T[] {
  const merged = mergeListUncapped(base, ours, theirs, conflicts, kind);
  if (merged.length <= max) return merged;
  // W-647: both tabs added items and together they pass the limit, so the save would be refused.
  // The server's items stay; this tab's new ones past the limit are reported as conflicts.
  const theirIds = new Set((theirs ?? []).map((item) => item.id));
  let over = merged.length - max;
  const dropped = new Set<string>();
  for (const item of merged.toReversed()) {
    if (over === 0) break;
    if (theirIds.has(item.id)) continue;
    dropped.add(item.id);
    conflicts.push({ kind, name: item.name });
    over--;
  }
  return merged.filter((item) => !dropped.has(item.id));
}

function mergeListUncapped<T extends Named>(
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
  if (clashes.length === 0)
    return inOurOrder(baseItems, ourItems, theirItems, result, conflicts, kind);
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

/** The ids both lists share, in `list`'s order. */
const sharedOrder = (list: Named[], other: Set<string>) =>
  list.filter((item) => other.has(item.id)).map((item) => item.id);

/**
 * W-621: class order is the cascade order, so a reorder here was lost when the other tab
 * changed anything. Our order wins when only we reordered; both reordering is a conflict.
 */
function inOurOrder<T extends Named>(
  base: T[],
  ours: T[],
  theirs: T[],
  result: T[],
  conflicts: DesignConflict[],
  kind: "variable" | "class",
): T[] {
  const baseIds = new Set(base.map((item) => item.id));
  const ourIds = new Set(ours.map((item) => item.id));
  const theirIds = new Set(theirs.map((item) => item.id));
  const inAll = new Set([...baseIds].filter((id) => ourIds.has(id) && theirIds.has(id)));
  const baseOrder = sharedOrder(base, inAll).join("\n");
  const ourOrder = sharedOrder(ours, inAll).join("\n");
  const theirOrder = sharedOrder(theirs, inAll).join("\n");
  if (ourOrder === baseOrder || ourOrder === theirOrder) return result;
  if (theirOrder !== baseOrder) {
    conflicts.push({ kind: "setting", name: kind === "class" ? "Class order" : "Variable order" });
    return result;
  }
  const rank = new Map(ours.map((item, index) => [item.id, index]));
  const keptOurs = result.filter((item) => rank.has(item.id));
  keptOurs.sort((a, b) => (rank.get(a.id) as number) - (rank.get(b.id) as number));
  let next = 0;
  return result.map((item) => (rank.has(item.id) ? (keptOurs[next++] as T) : item));
}
