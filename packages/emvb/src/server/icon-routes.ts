import { clipText } from "../core/limits.ts";
import { PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { z } from "zod";
import {
  prepareUploadedSvg,
  sanitizeSvgMarkup,
  serialize,
  UPLOAD_SVG_MAX_BYTES,
  type UploadedIcon,
  type UploadedIconItem,
} from "../core/index.ts";

/**
 * Upload SVG (W-239): EmVB's own list of uploaded icons. EmDash's media library refuses
 * image/svg+xml by default (it has no upload-time SVG check, so a stored SVG could carry a
 * script), so EmVB keeps uploads in its plugin storage instead, already sanitized on the server.
 * An Icon stores `upload:<id>` plus the SVG itself, so pages never read this list.
 */

type IconStore = {
  get(id: string): Promise<UploadedIcon | null>;
  put(id: string, data: UploadedIcon): Promise<void>;
  delete(id: string): Promise<boolean>;
  query(options?: {
    orderBy?: Record<string, "asc" | "desc">;
    limit?: number;
  }): Promise<{ items: Array<{ id: string; data: UploadedIcon }>; hasMore: boolean }>;
};

const store = (ctx: RouteContext<unknown>) => ctx.storage["icons"] as unknown as IconStore;

/** The most recent uploads the picker lists. */
const UPLOAD_LIST_LIMIT = 100;

/** A file name without its folder or extension, as the icon's label. */
export const uploadName = (name: string) =>
  clipText(
    name
      .replace(/^.*[\\/]/, "")
      .replace(/\.svg$/i, "")
      .trim(),
    80,
  ).trim() || "Uploaded icon";

/**
 * One stored upload safe to send to the editor. Markup that no longer passes the SVG allowlist
 * is left out, so a row written past the upload route cannot carry a script into the picker.
 */
export function publicUploadedIcon(id: string, data: UploadedIcon): UploadedIconItem | undefined {
  if (typeof data.svg !== "string") return undefined;
  const tree = sanitizeSvgMarkup(data.svg);
  if (!tree) return undefined;
  return {
    id,
    name: uploadName(typeof data.name === "string" ? data.name : ""),
    svg: serialize(tree),
    uploadedAt: typeof data.uploadedAt === "string" ? data.uploadedAt : "",
  };
}

/** Editors and above: the uploaded icons, newest first. A row that fails the allowlist is omitted. */
export const iconsRoute: PluginRoute = {
  permission: "content:edit_any",
  handler: async (ctx) => {
    const page = await store(ctx).query({
      orderBy: { uploadedAt: "desc" },
      limit: UPLOAD_LIST_LIMIT,
    });
    const items = page.items.flatMap(({ id, data }) => {
      const item = publicUploadedIcon(id, data);
      return item ? [item] : [];
    });
    return { items };
  },
};

const UploadInput = z.object({
  name: z.string().max(255),
  // A JSON string: the file plus escaping room is still bounded by the route body limit.
  svg: z.string().min(1).max(UPLOAD_SVG_MAX_BYTES),
});

/** Editors and above. Sanitizes on the server, whatever the client did, then stores. */
export const iconUploadRoute: PluginRoute<z.infer<typeof UploadInput>> = {
  permission: "content:edit_any",
  input: UploadInput,
  handler: async (ctx) => {
    const prepared = prepareUploadedSvg(ctx.input.svg);
    if (!prepared.ok) throw new PluginRouteError("INVALID_SVG", prepared.message, 422);
    const id = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    const item: UploadedIcon = {
      name: uploadName(ctx.input.name),
      svg: prepared.svg,
      uploadedAt: new Date().toISOString(),
    };
    await store(ctx).put(id, item);
    return { item: { id, ...item }, imagesLeftOut: prepared.imagesLeftOut };
  },
};

const IdInput = z.object({
  id: z.string().regex(/^[0-9a-f]{16}$/, "Unknown icon"),
});

const RenameInput = IdInput.extend({
  name: z.string().min(1).max(255),
});

/** Editors and above. Renames an upload. Pages keep the SVG they already stored. */
export const iconRenameRoute: PluginRoute<z.infer<typeof RenameInput>> = {
  permission: "content:edit_any",
  input: RenameInput,
  handler: async (ctx) => {
    const current = await store(ctx).get(ctx.input.id);
    if (!current) throw new PluginRouteError("NOT_FOUND", "That upload is not in My uploads.", 404);
    const name = uploadName(ctx.input.name);
    // W-390: answer with the same checked markup the list sends; a row that fails the
    // allowlist is not renamed or echoed back.
    const item = publicUploadedIcon(ctx.input.id, { ...current, name });
    if (!item) throw new PluginRouteError("NOT_FOUND", "That upload is not in My uploads.", 404);
    await store(ctx).put(ctx.input.id, { ...current, name });
    return { item };
  },
};

/**
 * Editors and above. Removes an upload from My uploads. Icons already placed on a page keep
 * their own copy of the SVG, so those pages do not change.
 */
export const iconDeleteRoute: PluginRoute<z.infer<typeof IdInput>> = {
  permission: "content:edit_any",
  input: IdInput,
  handler: async (ctx) => {
    const removed = await store(ctx).delete(ctx.input.id);
    if (!removed) throw new PluginRouteError("NOT_FOUND", "That upload is not in My uploads.", 404);
    return { id: ctx.input.id };
  },
};
