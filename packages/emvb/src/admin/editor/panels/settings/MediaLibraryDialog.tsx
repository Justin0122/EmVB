import { Button, Input } from "@cloudflare/kumo";
import { CheckIcon, ImageIcon, UploadSimpleIcon, XIcon } from "@phosphor-icons/react";
import * as React from "react";
import { createPortal } from "react-dom";
import { resizeEmDashImage } from "../../../../astro/images.ts";
import type { Fetcher } from "../../../api.ts";
import {
  listImagePage,
  readImageSize,
  uploadImage,
  type MediaLibraryItem,
} from "../../../media-api.ts";
import { BUTTON, FIELD } from "../../../ui.ts";

/** Images asked for per page; "Show more" asks for the next ones. */
export const MEDIA_PAGE_SIZE = 40;

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif";

const errorText = (caught: unknown, fallback: string) =>
  caught instanceof Error ? caught.message : fallback;

const sizeText = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * The media library as a dialog over the editor: search by name, upload (or drop) a file, pick
 * an image. Shared by the image field, background images and the canvas's image picker, so it
 * is portaled to the editor layer rather than squeezed into the panel or popover it opens from.
 */
export function MediaLibraryDialog({
  fetcher,
  current,
  onPick,
  onClose,
}: {
  fetcher: Fetcher;
  /** The image in use now, marked in the grid. */
  current?: { mediaId?: string; src?: string };
  onPick: (item: MediaLibraryItem) => void;
  onClose: () => void;
}) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<MediaLibraryItem[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const asked = React.useRef(0);

  const load = React.useCallback(
    async (q: string, after?: string) => {
      const ask = ++asked.current;
      setLoading(true);
      setError(null);
      try {
        const page = await listImagePage(fetcher, {
          limit: MEDIA_PAGE_SIZE,
          q: q.trim() || undefined,
          cursor: after,
        });
        if (ask !== asked.current) return;
        setItems((shown) => {
          if (!after) return page.items;
          const seen = new Set(shown.map((item) => item.id));
          return [...shown, ...page.items.filter((item) => !seen.has(item.id))];
        });
        setCursor(page.nextCursor);
        setTotal(page.total);
      } catch (caught) {
        if (ask !== asked.current) return;
        setError(errorText(caught, "Couldn't load the media library."));
        if (!after) setItems([]);
      } finally {
        if (ask === asked.current) setLoading(false);
      }
    },
    [fetcher],
  );

  // The first page at once; a search after a short pause in typing.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      void load(query);
      return;
    }
    const timer = setTimeout(() => void load(query), 250);
    return () => clearTimeout(timer);
  }, [query, load]);

  // Focus goes to the search field, and back where it was once the dialog closes.
  React.useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("[data-emvb-media-search]")?.focus();
    return () => before?.focus?.();
  }, [anchor]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only images can be added here.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const size = await readImageSize(file).catch(
        () => ({}) as { width?: number; height?: number },
      );
      onPick(await uploadImage(fetcher, file, size));
    } catch (caught) {
      setError(errorText(caught, "Upload failed."));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const isCurrent = (item: MediaLibraryItem) =>
    current?.mediaId ? item.id === current.mediaId : !!current?.src && item.url === current.src;

  const dialog = (
    <div
      className="emvb-media-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="emvb-media-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Media library"
        data-emvb-media-dialog=""
        data-dragging={dragging ? "" : undefined}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onClose();
        }}
        onDragOver={(event) => {
          if (![...event.dataTransfer.types].includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload(event.dataTransfer.files[0]);
        }}
      >
        <div className="emvb-media-dialog-head">
          <h3 className="emvb-panel-title">Media library</h3>
          <div className="emvb-media-search">
            <Input
              label="Search images"
              className={FIELD}
              value={query}
              placeholder="Search by file name"
              data-emvb-media-search=""
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button
            type="button"
            className={BUTTON}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-emvb-media-dialog-upload=""
          >
            <UploadSimpleIcon size={14} aria-hidden="true" />
            {uploading ? "Uploading…" : "Upload"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="emvb-sr-only"
            tabIndex={-1}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          <Button
            type="button"
            className={BUTTON}
            variant="secondary"
            aria-label="Close"
            onClick={onClose}
          >
            <XIcon size={14} aria-hidden="true" />
            Close
          </Button>
        </div>
        {error && (
          <p className="emvb-helper emvb-media-error" role="alert">
            {error}
          </p>
        )}
        <div className="emvb-media-body">
          {loading && items.length === 0 && <p className="emvb-helper">Loading…</p>}
          {!loading && !error && items.length === 0 && (
            <div className="emvb-media-empty">
              <ImageIcon size={32} aria-hidden="true" />
              <p className="emvb-helper">
                {query.trim()
                  ? `No images match “${query.trim()}”.`
                  : "No images yet. Upload one to get started."}
              </p>
            </div>
          )}
          <ul className="emvb-media-grid">
            {items.map((item) => (
              <li key={item.id}>
                <MediaCard item={item} current={isCurrent(item)} onPick={() => onPick(item)} />
              </li>
            ))}
          </ul>
        </div>
        <div className="emvb-media-foot">
          <span className="emvb-helper">
            {items.length > 0 &&
              (total !== null
                ? `${items.length} of ${total} images`
                : `${items.length} ${items.length === 1 ? "image" : "images"}`)}
          </span>
          <span className="emvb-helper">Drop an image here to upload it.</span>
          {cursor && (
            <Button
              type="button"
              className={BUTTON}
              variant="secondary"
              disabled={loading}
              data-emvb-media-more=""
              onClick={() => void load(query, cursor)}
            >
              {loading ? "Loading…" : "Show more"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <span
        hidden
        ref={(element) => {
          if (!element || anchor) return;
          setAnchor(
            element.closest<HTMLElement>("[data-emvb-editor]") ?? element.ownerDocument.body,
          );
        }}
      />
      {anchor && createPortal(dialog, anchor)}
    </>
  );
}

/** One library image: a resized thumbnail, its name and size; the one in use is checked. */
function MediaCard({
  item,
  current,
  onPick,
}: {
  item: MediaLibraryItem;
  current: boolean;
  onPick: () => void;
}) {
  const thumb = resizeEmDashImage(item.url, 320);
  const [srcSet, setSrcSet] = React.useState(thumb ? `${thumb} 320w` : undefined);
  const meta = [
    item.width && item.height ? `${item.width} × ${item.height}` : "",
    sizeText(item.size),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      className="emvb-media-card"
      data-emvb-media-id={item.id}
      data-current={current ? "" : undefined}
      aria-pressed={current}
      title={item.filename}
      onClick={onPick}
    >
      <span className="emvb-media-card-image">
        <img
          src={item.url}
          srcSet={srcSet}
          sizes="200px"
          alt={item.alt ?? item.filename}
          loading="lazy"
          decoding="async"
          onError={() => setSrcSet(undefined)}
        />
        {current && (
          <span className="emvb-media-card-check" aria-hidden="true">
            <CheckIcon size={12} weight="bold" />
          </span>
        )}
      </span>
      <span className="emvb-media-card-name">{item.filename}</span>
      {meta && <span className="emvb-media-card-meta">{meta}</span>}
    </button>
  );
}
