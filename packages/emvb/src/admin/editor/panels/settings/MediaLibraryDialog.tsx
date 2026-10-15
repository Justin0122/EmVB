import { Button, Input } from "@cloudflare/kumo";
import {
  CheckIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderSimpleIcon,
  ImageIcon,
  ImagesIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { createPortal } from "react-dom";
import { resizeEmDashImage } from "../../../../astro/images.ts";
import type { Fetcher } from "../../../api.ts";
import {
  createFolder,
  listFolders,
  listImagePage,
  moveImage,
  readImageSize,
  uploadImage,
  type MediaFolder,
  type MediaLibraryItem,
  type MediaScope,
} from "../../../media-api.ts";
import { BUTTON, FIELD } from "../../../ui.ts";

/** Images asked for per page; "Show more" asks for the next ones. */
export const MEDIA_PAGE_SIZE = 40;

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif";

/** A library image being dragged onto a folder (its id). */
const DRAG_TYPE = "application/x-emvb-media";

/** The folder the dialog opened on last, per browser. */
const SCOPE_KEY = "emvb-media-scope";

const rememberedScope = (): MediaScope => {
  try {
    return localStorage.getItem(SCOPE_KEY) || "all";
  } catch {
    return "all";
  }
};

const rememberScope = (scope: MediaScope) => {
  try {
    localStorage.setItem(SCOPE_KEY, scope);
  } catch {
    // Private windows may refuse storage; the dialog then opens on all images.
  }
};

const errorText = (caught: unknown, fallback: string) =>
  caught instanceof Error ? caught.message : fallback;

const sizeText = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * The media library as a dialog over the editor: browse its folders, search by name, upload (or
 * drop) a file, move images between folders (drag one onto a folder, or its "Move to" menu), pick
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
  const [scope, setScope] = React.useState<MediaScope>(rememberedScope);
  const [folders, setFolders] = React.useState<MediaFolder[] | null>(null);
  const [naming, setNaming] = React.useState<string | null>(null);
  const [dropOn, setDropOn] = React.useState<MediaScope | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
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
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const moreRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(
    async (q: string, within: MediaScope, after?: string) => {
      const ask = ++asked.current;
      setLoading(true);
      setError(null);
      try {
        const page = await listImagePage(fetcher, {
          limit: MEDIA_PAGE_SIZE,
          q: q.trim() || undefined,
          cursor: after,
          scope: within,
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

  // The first page and another folder's at once; a search after a short pause in typing.
  const shown = React.useRef<{ query: string; scope: MediaScope } | null>(null);
  React.useEffect(() => {
    const before = shown.current;
    shown.current = { query, scope };
    if (!before || before.scope !== scope) {
      void load(query, scope);
      return;
    }
    const timer = setTimeout(() => void load(query, scope), 250);
    return () => clearTimeout(timer);
  }, [query, scope, load]);

  // Infinite scroll: the next page loads once the end of the grid comes near.
  React.useEffect(() => {
    const more = moreRef.current;
    if (!more || !cursor || loading || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void load(query, scope, cursor);
      },
      { root: bodyRef.current, rootMargin: "400px 0px" },
    );
    observer.observe(more);
    return () => observer.disconnect();
  }, [cursor, loading, error, query, scope, load]);

  React.useEffect(() => {
    let live = true;
    listFolders(fetcher)
      .then((list) => {
        if (!live) return;
        setFolders(list);
        // A remembered folder that is gone opens all images instead.
        setScope((open) =>
          open === "all" || open === "unfiled" || list.some((folder) => folder.id === open)
            ? open
            : "all",
        );
      })
      .catch(() => live && setFolders([]));
    return () => {
      live = false;
    };
  }, [fetcher]);

  const openScope = (next: MediaScope) => {
    setScope(next);
    setStatus(null);
    rememberScope(next);
  };

  const folderName = (id: string | null | undefined) =>
    id ? (folders?.find((folder) => folder.id === id)?.name ?? "a folder") : "Main library";

  const move = async (item: MediaLibraryItem, folderId: string | null) => {
    if ((item.folderId ?? null) === folderId) return;
    setError(null);
    try {
      await moveImage(fetcher, item.id, folderId);
      const leaves = scope !== "all" && (scope === "unfiled" ? null : scope) !== folderId;
      setItems((list) =>
        leaves
          ? list.filter((other) => other.id !== item.id)
          : list.map((other) => (other.id === item.id ? { ...other, folderId } : other)),
      );
      if (leaves) setTotal((count) => (count === null ? null : Math.max(0, count - 1)));
      setStatus(`Moved “${item.filename}” to ${folderName(folderId)}.`);
    } catch (caught) {
      setError(errorText(caught, "The image wasn't moved."));
    }
  };

  const makeFolder = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNaming(null);
      return;
    }
    setError(null);
    try {
      const folder = await createFolder(fetcher, trimmed);
      setFolders((list) =>
        [...(list ?? []), folder].toSorted((a, b) => a.name.localeCompare(b.name)),
      );
      setNaming(null);
      openScope(folder.id);
    } catch (caught) {
      setError(errorText(caught, "The folder wasn't made."));
    }
  };

  // Focus goes to the search field, and back where it was once the dialog closes.
  React.useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("[data-emvb-media-search]")?.focus();
    return () => before?.focus?.();
  }, [anchor]);

  /** Uploads into the open folder (or `into`, a folder it was dropped on) and picks it. */
  const upload = async (file: File | undefined, into: MediaScope = scope) => {
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
      const folderId = into === "all" || into === "unfiled" ? undefined : into;
      onPick(await uploadImage(fetcher, file, { ...size, folderId }));
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
        <div className="emvb-media-main">
          <nav className="emvb-media-folders" aria-label="Folders" data-emvb-media-folders="">
            <FolderRow
              label="All images"
              icon={<ImagesIcon size={16} aria-hidden="true" />}
              scope="all"
              open={scope}
              onOpen={openScope}
            />
            <FolderRow
              label="Main library"
              icon={<FolderSimpleIcon size={16} aria-hidden="true" />}
              scope="unfiled"
              open={scope}
              onOpen={openScope}
              dropOn={dropOn}
              onDropOn={setDropOn}
              onDropImage={(id) => {
                const item = items.find((other) => other.id === id);
                if (item) void move(item, null);
              }}
              onDropFile={(file) => void upload(file, "unfiled")}
            />
            {folders && folders.length > 0 && <div className="emvb-media-folders-rule" />}
            {folders?.map((folder) => (
              <FolderRow
                key={folder.id}
                label={folder.name}
                icon={<FolderIcon size={16} aria-hidden="true" />}
                scope={folder.id}
                open={scope}
                onOpen={openScope}
                dropOn={dropOn}
                onDropOn={setDropOn}
                onDropImage={(id) => {
                  const item = items.find((other) => other.id === id);
                  if (item) void move(item, folder.id);
                }}
                onDropFile={(file) => void upload(file, folder.id)}
              />
            ))}
            {naming === null ? (
              <button
                type="button"
                className="emvb-media-folder emvb-media-folder-new"
                data-emvb-media-new-folder=""
                onClick={() => setNaming("")}
              >
                <FolderPlusIcon size={16} aria-hidden="true" />
                <span>New folder</span>
              </button>
            ) : (
              <input
                className="emvb-media-folder-name"
                aria-label="New folder name"
                placeholder="Folder name"
                maxLength={200}
                autoFocus
                data-emvb-media-folder-name=""
                value={naming}
                onChange={(event) => setNaming(event.target.value)}
                onBlur={() => void makeFolder(naming)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void makeFolder(naming);
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setNaming(null);
                  }
                }}
              />
            )}
          </nav>
          <div className="emvb-media-body" ref={bodyRef}>
            {loading && items.length === 0 && <p className="emvb-helper">Loading…</p>}
            {!loading && !error && items.length === 0 && (
              <div className="emvb-media-empty">
                <ImageIcon size={32} aria-hidden="true" />
                <p className="emvb-helper">
                  {query.trim()
                    ? `No images match “${query.trim()}”.`
                    : scope === "all"
                      ? "No images yet. Upload one to get started."
                      : "No images here yet. Upload one, or drag images onto this folder."}
                </p>
              </div>
            )}
            <ul className="emvb-media-grid">
              {items.map((item) => (
                <li key={item.id}>
                  <MediaCard
                    item={item}
                    current={isCurrent(item)}
                    folders={folders ?? []}
                    onPick={() => onPick(item)}
                    onMove={(folderId) => void move(item, folderId)}
                  />
                </li>
              ))}
            </ul>
            {cursor && (
              <div className="emvb-media-more" ref={moreRef} data-emvb-media-more="">
                {loading && items.length > 0 && <span className="emvb-helper">Loading more…</span>}
              </div>
            )}
          </div>
        </div>
        <div className="emvb-media-foot">
          <span className="emvb-helper">
            {items.length > 0 &&
              (total !== null
                ? `${items.length} of ${total} images`
                : `${items.length} ${items.length === 1 ? "image" : "images"}`)}
          </span>
          <span className="emvb-helper" role="status">
            {status ?? "Drop an image here to upload it, or drag one onto a folder to move it."}
          </span>
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
  folders,
  onPick,
  onMove,
}: {
  item: MediaLibraryItem;
  current: boolean;
  folders: MediaFolder[];
  onPick: () => void;
  onMove: (folderId: string | null) => void;
}) {
  const [menu, setMenu] = React.useState(false);
  const thumb = resizeEmDashImage(item.url, 320);
  const [srcSet, setSrcSet] = React.useState(thumb ? `${thumb} 320w` : undefined);
  const meta = [
    item.width && item.height ? `${item.width} × ${item.height}` : "",
    sizeText(item.size),
  ]
    .filter(Boolean)
    .join(" · ");
  const here = item.folderId ?? null;
  const targets: { id: string | null; name: string }[] = [
    { id: null, name: "Main library" },
    ...folders,
  ];
  return (
    <>
      <button
        type="button"
        className="emvb-media-card"
        data-emvb-media-id={item.id}
        data-current={current ? "" : undefined}
        aria-pressed={current}
        title={item.filename}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_TYPE, item.id);
          event.dataTransfer.effectAllowed = "move";
        }}
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
            draggable={false}
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
      <button
        type="button"
        className="emvb-media-card-move"
        aria-label={`Move ${item.filename} to a folder`}
        title="Move to folder"
        aria-expanded={menu}
        data-emvb-media-move={item.id}
        onClick={() => setMenu((shown) => !shown)}
      >
        <FolderIcon size={14} aria-hidden="true" />
      </button>
      {menu && (
        <div
          className="emvb-media-move-menu"
          role="menu"
          aria-label="Move to"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setMenu(false);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenu(false);
          }}
        >
          <span className="emvb-media-move-title">Move to</span>
          {targets.map((target) => (
            <button
              key={target.id ?? ""}
              type="button"
              role="menuitemradio"
              aria-checked={target.id === here}
              disabled={target.id === here}
              autoFocus={target.id === null}
              data-emvb-media-move-to={target.id ?? "unfiled"}
              onClick={() => {
                setMenu(false);
                onMove(target.id);
              }}
            >
              {target.id === here ? <CheckIcon size={12} aria-hidden="true" /> : <span />}
              {target.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** One folder in the dialog's list: opens it; images and files dropped on it go into it. */
function FolderRow({
  label,
  icon,
  scope,
  open,
  onOpen,
  dropOn,
  onDropOn,
  onDropImage,
  onDropFile,
}: {
  label: string;
  icon: React.ReactNode;
  scope: MediaScope;
  open: MediaScope;
  onOpen: (scope: MediaScope) => void;
  dropOn?: MediaScope | null;
  onDropOn?: (scope: MediaScope | null) => void;
  /** Without it the row takes no drops ("All images"). */
  onDropImage?: (id: string) => void;
  onDropFile?: (file: File) => void;
}) {
  const takes = (types: readonly string[]) =>
    !!onDropImage && (types.includes(DRAG_TYPE) || types.includes("Files"));
  return (
    <button
      type="button"
      className="emvb-media-folder"
      aria-current={open === scope ? "true" : undefined}
      data-emvb-media-folder={scope}
      data-drop={dropOn === scope ? "" : undefined}
      onClick={() => onOpen(scope)}
      onDragOver={(event) => {
        if (!takes([...event.dataTransfer.types])) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = event.dataTransfer.types.includes(DRAG_TYPE)
          ? "move"
          : "copy";
        onDropOn?.(scope);
      }}
      onDragLeave={() => onDropOn?.(null)}
      onDrop={(event) => {
        if (!takes([...event.dataTransfer.types])) return;
        event.preventDefault();
        event.stopPropagation();
        onDropOn?.(null);
        const id = event.dataTransfer.getData(DRAG_TYPE);
        if (id) onDropImage?.(id);
        else if (event.dataTransfer.files[0]) onDropFile?.(event.dataTransfer.files[0]);
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
