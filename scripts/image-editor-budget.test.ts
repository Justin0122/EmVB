import { describe, expect, test } from "bun:test";
import {
  IMAGE_EDITOR_GZIP_BUDGET,
  IMAGE_EDITOR_WORKER_GZIP_BUDGET,
  imageEditorChunks,
  imageEditorWorker,
} from "./image-editor-budget.ts";

describe("image editor size budget (W-488)", () => {
  test("photocn is only in one lazy chunk, under 350 KB gzipped, and the entry loads it dynamically", async () => {
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

  test("the photocn worker stays under 32 KB gzipped", async () => {
    const worker = await imageEditorWorker();
    expect(worker.gzip).toBeLessThanOrEqual(IMAGE_EDITOR_WORKER_GZIP_BUDGET);
    expect(worker.gzip).toBeGreaterThan(8 * 1024);
  }, 60_000);
});
