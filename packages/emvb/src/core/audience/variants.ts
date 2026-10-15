import { AB_TEST_NAME, isParentNode, type Layout, type LayoutNode } from "../schema/layout.ts";

export type AbArm = "a" | "b";

/** An A/B test in a layout (W-312): its name and the share of visitors who see B. */
export type AbTest = { test: string; split: number };

/** The cookie that keeps a visitor on one arm of a test (W-312). */
export const abCookieName = (test: string) => `emvb_ab_${test.replaceAll("-", "_")}`;

/**
 * Tests in the layout that have only one arm (W-625): the other was deleted, cut or moved away.
 * Such a test isn't run and its remaining elements show to every visitor, so nobody sees a gap.
 */
export function loneAbTests(layout: Layout): Set<string> {
  const arms = new Map<string, Set<AbArm>>();
  const walk = (node: LayoutNode): void => {
    const v = node.variant;
    if (v) {
      const seen = arms.get(v.test) ?? new Set<AbArm>();
      seen.add(v.arm);
      arms.set(v.test, seen);
    }
    if (isParentNode(node)) for (const child of node.children) walk(child);
  };
  walk(layout.root);
  return new Set([...arms].filter(([, seen]) => seen.size < 2).map(([test]) => test));
}

/** Every A/B test in the layout with both arms, at most 10, with B's split (default 50 %). */
export function collectAbTests(layout: Layout): AbTest[] {
  const lone = loneAbTests(layout);
  const tests = new Map<string, number>();
  const walk = (node: LayoutNode): void => {
    const v = node.variant;
    if (
      v &&
      !lone.has(v.test) &&
      AB_TEST_NAME.test(v.test) &&
      (tests.has(v.test) || tests.size < 10)
    ) {
      const known = tests.get(v.test);
      if (v.arm === "b" && v.split !== undefined) tests.set(v.test, v.split);
      else if (known === undefined) tests.set(v.test, 50);
    }
    if (isParentNode(node)) for (const child of node.children) walk(child);
  };
  walk(layout.root);
  return [...tests].map(([test, split]) => ({ test, split }));
}

/**
 * The arm for one visitor (W-312): their cookie when it holds a valid arm, else a fresh pick.
 * `random` is a number in [0, 1); B wins when it falls under the split.
 */
export function pickArm(
  test: AbTest,
  cookie: string | undefined,
  random: number,
): { arm: AbArm; fresh: boolean } {
  if (cookie === "a" || cookie === "b") return { arm: cookie, fresh: false };
  return { arm: random * 100 < test.split ? "b" : "a", fresh: true };
}

/**
 * Whether a node shows for these arms (W-312). Without a decision for its test (a host that
 * doesn't run tests, or the editor), arm A shows and B stays hidden, so pages never show both.
 */
export function variantShows(
  node: LayoutNode,
  arms: Readonly<Record<string, AbArm>> | undefined,
  lone?: ReadonlySet<string>,
): boolean {
  const v = node.variant;
  if (!v || lone?.has(v.test)) return true;
  return (arms?.[v.test] ?? "a") === v.arm;
}
