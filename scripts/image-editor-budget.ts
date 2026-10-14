/**
 * Image editor size budget (W-482, plan §5): bundles the admin entry with code splitting, the way
 * the host's bundler does, and checks that photocn lives only in the lazy image-editor chunk, which
 * stays under its gzip budget. React, Kumo, icons and EmDash are the host's, so they are external.
 */
import { gzipSync } from "node:zlib";

/** 350 KB since W-484 (approved by Charles; was 300 KB). */
export const IMAGE_EDITOR_GZIP_BUDGET = 350 * 1024;
/** Strings only photocn's code contains. */
const PHOTOCN_MARKERS = ["transferControlToOffscreen", "mini-gl renderer", "bridge:worker"];

export type ChunkReport = {
  path: string;
  bytes: number;
  gzip: number;
  photocn: boolean;
  entry: boolean;
  /** Files this chunk imports with a static \`import … from\`. */
  staticImports: string[];
  /** Files this chunk loads with \`import()\`. */
  dynamicImports: string[];
};

const names = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].map((m) => (m[1] ?? "").replace(/^\.\//, ""));

export async function imageEditorChunks(
  root = new URL("..", import.meta.url).pathname,
): Promise<ChunkReport[]> {
  const result = await Bun.build({
    entrypoints: [`${root}packages/emvb/src/admin/index.tsx`],
    splitting: true,
    minify: true,
    target: "browser",
    format: "esm",
    external: [
      "react",
      "react-dom",
      "react/*",
      "react-dom/*",
      "@cloudflare/kumo",
      "@phosphor-icons/react",
      "emdash",
      "emdash/*",
      "astro:*",
      "virtual:*",
    ],
  });
  if (!result.success) throw new AggregateError(result.logs, "admin bundle failed");
  return Promise.all(
    result.outputs
      .filter((o) => o.path.endsWith(".js"))
      .map(async (o) => {
        const text = await o.text();
        return {
          path: o.path,
          bytes: Buffer.byteLength(text),
          gzip: gzipSync(text, { level: 9 }).length,
          photocn: PHOTOCN_MARKERS.some((m) => text.includes(m)),
          entry: o.kind === "entry-point",
          staticImports: names(text, /(?:from|import)\s*"(\.\/[^"]+\.js)"/g),
          dynamicImports: names(text, /import\(\s*"(\.\/[^"]+\.js)"\s*\)/g),
        };
      }),
  );
}

if (import.meta.main) {
  for (const c of await imageEditorChunks()) {
    process.stdout.write(
      `${c.entry ? "entry" : "chunk"} ${c.path} ${c.bytes} B, ${c.gzip} B gz${c.photocn ? " (photocn)" : ""}\n`,
    );
  }
}
