import { describe, expect, test } from "bun:test";
import { PAGES_COLLECTION } from "../../packages/emvb/src/constants.ts";
import type { EntryContent, PlaygroundState } from "../../site/src/playground/mock/backend.ts";
import { renderView } from "../../site/src/playground/view.ts";

function pageState(layout: unknown): PlaygroundState {
  const content: EntryContent = {
    slug: "home",
    data: { title: "Home", layout },
    seo: { title: null, description: null },
  };
  return {
    version: 1,
    seq: 1,
    entries: [
      {
        id: "page0001",
        collection: PAGES_COLLECTION,
        status: "published",
        draft: content,
        published: content,
        draftRevisionId: null,
        rev: 1,
        createdAt: "2026-10-11T00:00:00.000Z",
        updatedAt: "2026-10-11T00:00:00.000Z",
      },
    ],
    design: { draft: null, published: null },
    icons: [],
    media: [],
  };
}

describe("playground view", () => {
  test("a layout field that is not JSON is unreadable (W-372)", () => {
    const result = renderView(pageState("not-json"), { entry: "page0001" });
    expect(result).toEqual({ ok: false, reason: "unreadable" });
  });
});
