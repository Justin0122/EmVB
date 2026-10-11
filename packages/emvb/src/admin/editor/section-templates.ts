import * as React from "react";
import { collectSectionPartIds, type Layout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { themePartLayout } from "../theme-api.ts";

const MAX_DEPTH = 8;

/**
 * Loads section parts one depth at a time. Siblings load together. A part that fails is left out;
 * the ones that loaded stay.
 */
export async function loadSectionTemplates(
  fetcher: Fetcher,
  ids: readonly string[],
  read: (id: string) => Promise<Layout | null> = (id) => themePartLayout(fetcher, id, "section"),
): Promise<Record<string, Layout>> {
  const acc: Record<string, Layout> = {};
  const walk = async (next: readonly string[], depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;
    const pending = next.filter((id) => !acc[id]);
    if (pending.length === 0) return;
    const loaded = await Promise.all(
      pending.map(async (id) => {
        try {
          return [id, await read(id)] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    );
    const nested: string[] = [];
    for (const [id, part] of loaded) {
      if (!part || acc[id]) continue;
      acc[id] = part;
      nested.push(...collectSectionPartIds(part));
    }
    await walk(nested, depth + 1);
  };
  await walk(ids, 0);
  return acc;
}

/** Section theme parts referenced by the open layout, so the canvas shows the synced contents. */
export function useSectionTemplates(
  layout: Layout | null,
  fetcher: Fetcher,
): Record<string, Layout> {
  const key = layout ? collectSectionPartIds(layout).join("\0") : "";
  const [templates, setTemplates] = React.useState<Record<string, Layout>>({});

  React.useEffect(() => {
    const ids = key ? key.split("\0") : [];
    if (ids.length === 0) {
      setTemplates({});
      return;
    }
    let cancelled = false;
    void loadSectionTemplates(fetcher, ids).then(
      (acc) => {
        if (!cancelled) setTemplates(acc);
      },
      () => {
        if (!cancelled) setTemplates({});
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, fetcher]);

  return templates;
}
