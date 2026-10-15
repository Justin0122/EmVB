import type * as fs from "node:fs";

/**
 * Node's fs when this runs on Node (astro.config always does; a Worker doesn't), without a
 * static import a Worker bundle would fail on. The type import is erased.
 */
export const nodeFs = () =>
  (
    globalThis as {
      process?: { getBuiltinModule?: (id: string) => unknown };
    }
  ).process?.getBuiltinModule?.("node:fs") as typeof fs | undefined;
