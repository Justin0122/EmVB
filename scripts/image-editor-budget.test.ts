import { describe, expect, test } from "bun:test";
import { IMAGE_EDITOR_GZIP_BUDGET, imageEditorChunks } from "./image-editor-budget.ts";

describe("image editor size budget (W-482)", () => {
  test("photocn is only in one lazy chunk, under 300 KB gzipped, and the entry loads it dynamically", async () => {
    const chunks = await imageEditorChunks();
    const photocn = chunks.filter((c) => c.photocn);
    expect(photocn.length).toBe(1);
    const [editor] = photocn;
    if (!editor) return;
    expect(editor.entry).toBe(false);
    expect(editor.gzip).toBeLessThanOrEqual(IMAGE_EDITOR_GZIP_BUDGET);
    const file = editor.path.replace(/^\.\//, "");
    for (const chunk of chunks.filter((c) => c !== editor)) {
      // No chunk may pull it in statically; only `import("./…")` may name it.
      expect(chunk.staticImports).not.toContain(file);
    }
    expect(chunks.some((c) => c.dynamicImports.includes(file))).toBe(true);
  }, 60_000);
});
