import { Button, Dialog } from "@cloudflare/kumo";
import {
  ApertureIcon,
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowsCounterClockwiseIcon,
  ChartLineIcon,
  CpuIcon,
  CropIcon,
  MagicWandIcon,
  SlidersHorizontalIcon,
  SquareSplitHorizontalIcon,
  SwatchesIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { BUTTON, SOLID_PRIMARY, UI_CSS } from "../ui.ts";
import { openPhoto, type Photo } from "./engine.ts";
import { IMAGE_EDITOR_CSS } from "./image-editor-css.ts";
import { loadEditableSource } from "./load.ts";
import {
  IMAGE_EDITOR_TOOLS,
  moveTool,
  shortcutFor,
  displayName,
  sizeLabel,
  type ImageEditorToolId,
} from "./tools.ts";
import type { RenderMode } from "./worker.ts";

const TOOL_ICONS: Record<ImageEditorToolId, React.ReactElement> = {
  crop: <CropIcon aria-hidden="true" />,
  adjust: <SlidersHorizontalIcon aria-hidden="true" />,
  filters: <SwatchesIcon aria-hidden="true" />,
  curves: <ChartLineIcon aria-hidden="true" />,
  blur: <ApertureIcon aria-hidden="true" />,
};

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string; retry: boolean }
  | { kind: "ready"; renderMode: RenderMode; reason?: string };

export type ImageEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Image element's props (`src`, `alt`, `edit`…). */
  imageProps: Record<string, unknown>;
  /** Tests and the spike force main-thread rendering. */
  forceRenderMode?: RenderMode;
  onClosed?: () => void;
};

/** Live photo state the toolbar needs, refreshed on every photocn change. */
function usePhotoState(photo: Photo | null) {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => (photo ? photo.subscribe(() => bump()) : undefined), [photo]);
  return {
    canUndo: photo?.canUndo ?? false,
    canRedo: photo?.canRedo ?? false,
    edited: photo ? photo.recipe !== null : false,
    size: photo?.outputSize,
  };
}

function Editor({
  imageProps,
  forceRenderMode,
}: Pick<ImageEditorDialogProps, "imageProps" | "forceRenderMode">) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });
  const [photo, setPhoto] = React.useState<Photo | null>(null);
  const [name, setName] = React.useState("");
  const [originalUrl, setOriginalUrl] = React.useState<string | null>(null);
  const [tool, setTool] = React.useState<ImageEditorToolId>("crop");
  const [comparing, setComparing] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const state = usePhotoState(photo);
  const railId = React.useId();

  React.useEffect(() => {
    let alive = true;
    let opened: Photo | null = null;
    let url: string | null = null;
    setPhase({ kind: "loading" });
    void (async () => {
      const source = await loadEditableSource(imageProps, window.location.origin);
      if (!alive) return;
      if (!source.ok) {
        return setPhase({
          kind: "error",
          message: source.message,
          retry: source.reason === "network",
        });
      }
      setName(displayName(source.name, imageProps.alt));
      const result = await openPhoto(source.blob, source.name, source.type, {
        force: forceRenderMode,
      });
      if (!alive) {
        if (result.ok) result.photo.dispose();
        return;
      }
      if (!result.ok) return setPhase({ kind: "error", message: result.message, retry: true });
      opened = result.photo;
      url = URL.createObjectURL(source.blob);
      setOriginalUrl(url);
      const canvas = canvasRef.current;
      if (canvas) result.photo.attach(canvas);
      setPhoto(result.photo);
      await result.photo.ready();
      if (alive) setPhase({ kind: "ready", renderMode: result.renderMode, reason: result.reason });
    })().catch((error: unknown) => {
      if (alive) {
        setPhase({
          kind: "error",
          retry: true,
          message: `Couldn't open this picture${error instanceof Error && error.message ? `: ${error.message}` : "."}`,
        });
      }
    });
    return () => {
      alive = false;
      opened?.dispose();
      if (url) URL.revokeObjectURL(url);
      setPhoto(null);
    };
    // A retry needs a fresh <canvas>: transferControlToOffscreen is one-way (W-480 #4).
  }, [imageProps, forceRenderMode, attempt]);

  const run = React.useCallback(
    (action: "undo" | "redo" | "reset") => {
      if (!photo) return;
      if (action === "undo" && photo.canUndo) photo.undo();
      if (action === "redo" && photo.canRedo) photo.redo();
      if (action === "reset" && photo.recipe) photo.reset();
    },
    [photo],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable='true']")) return;
    const shortcut = shortcutFor(event);
    if (shortcut) {
      event.preventDefault();
      run(shortcut);
    } else if (event.key === "\\" && !event.repeat) {
      setComparing(true);
    }
  };
  const onKeyUp = (event: React.KeyboardEvent) => {
    if (event.key === "\\") setComparing(false);
  };

  const active = IMAGE_EDITOR_TOOLS.find((t) => t.id === tool) ?? IMAGE_EDITOR_TOOLS[0];
  const ready = phase.kind === "ready";
  const subtitle = [name, state.size ? sizeLabel(state.size.width, state.size.height) : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="emvb-image-editor"
      data-emvb-dialog="image-editor"
      data-emvb-image-editor={phase.kind}
      data-emvb-render-mode={ready ? phase.renderMode : undefined}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <header className="emvb-image-editor-top">
        <div className="emvb-image-editor-heading">
          <span className="emvb-image-editor-mark" aria-hidden="true">
            <MagicWandIcon weight="duotone" />
          </span>
          <div className="emvb-image-editor-titles">
            <Dialog.Title className="emvb-image-editor-title">Edit image</Dialog.Title>
            <Dialog.Description
              className="emvb-image-editor-subtitle"
              data-emvb-image-editor-file=""
            >
              {subtitle ||
                (phase.kind === "error" ? "Couldn't open the picture" : "Opening the picture…")}
            </Dialog.Description>
          </div>
        </div>
        <div className="emvb-image-editor-tools" role="toolbar" aria-label="History and compare">
          <Button
            variant="ghost"
            shape="square"
            className="emvb-icon-btn"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={!state.canUndo}
            icon={<ArrowCounterClockwiseIcon aria-hidden="true" />}
            data-emvb-image-undo=""
            onClick={() => run("undo")}
          />
          <Button
            variant="ghost"
            shape="square"
            className="emvb-icon-btn"
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!state.canRedo}
            icon={<ArrowClockwiseIcon aria-hidden="true" />}
            data-emvb-image-redo=""
            onClick={() => run("redo")}
          />
          <span className="emvb-image-editor-divider" aria-hidden="true" />
          <Button
            variant="ghost"
            className={BUTTON}
            aria-pressed={comparing}
            title="Hold to see the original (\\)"
            disabled={!ready}
            icon={<SquareSplitHorizontalIcon aria-hidden="true" />}
            data-emvb-image-compare=""
            onPointerDown={() => setComparing(true)}
            onPointerUp={() => setComparing(false)}
            onPointerLeave={() => setComparing(false)}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") setComparing(true);
            }}
            onKeyUp={() => setComparing(false)}
          >
            Compare
          </Button>
          <Button
            variant="ghost"
            className={BUTTON}
            disabled={!state.edited}
            icon={<ArrowsCounterClockwiseIcon aria-hidden="true" />}
            data-emvb-image-reset=""
            onClick={() => run("reset")}
          >
            Reset
          </Button>
        </div>
        <div className="emvb-image-editor-actions">
          <Dialog.Close
            render={(props) => (
              <Button {...props} variant="secondary" className={BUTTON} data-emvb-image-cancel="">
                Cancel
              </Button>
            )}
          />
          <Button
            variant="primary"
            className={`${BUTTON} ${SOLID_PRIMARY}`}
            disabled
            title={
              state.edited ? "Saving arrives with export settings" : "Make a change to save a copy"
            }
            data-emvb-image-save=""
          >
            Save copy
          </Button>
        </div>
      </header>

      <nav className="emvb-image-editor-rail" aria-label="Editing tools">
        <div role="tablist" aria-orientation="vertical" aria-label="Editing tools">
          {IMAGE_EDITOR_TOOLS.map((t, index) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${railId}-${t.id}`}
              aria-selected={tool === t.id}
              aria-controls={`${railId}-panel`}
              tabIndex={tool === t.id ? 0 : -1}
              className="emvb-image-editor-tool"
              data-emvb-image-tool={t.id}
              onClick={() => setTool(t.id)}
              onKeyDown={(event) => {
                const next = moveTool(event.key, index, IMAGE_EDITOR_TOOLS.length);
                if (next === undefined) return;
                event.preventDefault();
                const nextTool = IMAGE_EDITOR_TOOLS[next];
                if (!nextTool) return;
                setTool(nextTool.id);
                document.getElementById(`${railId}-${nextTool.id}`)?.focus();
              }}
            >
              <span className="emvb-image-editor-tool-icon">{TOOL_ICONS[t.id]}</span>
              <span className="emvb-image-editor-tool-label">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <section
        className="emvb-image-editor-panel"
        role="tabpanel"
        id={`${railId}-panel`}
        aria-labelledby={`${railId}-${active.id}`}
        data-emvb-image-panel={active.id}
      >
        <div className="emvb-image-editor-panel-head">
          <h3>{active.title}</h3>
          <span className="emvb-image-editor-soon">Next update</span>
        </div>
        <p className="emvb-helper">{active.blurb}</p>
        <ul className="emvb-image-editor-hints">
          {active.hints.map((hint) => (
            <li key={hint}>
              <span className="emvb-image-editor-hint-icon" aria-hidden="true">
                {TOOL_ICONS[active.id]}
              </span>
              {hint}
            </li>
          ))}
        </ul>
        <div className="emvb-image-editor-note">
          <strong>Your original stays safe.</strong>
          <span>
            Saving makes a new copy in the media library; the picture you started from is never
            changed.
          </span>
        </div>
      </section>

      <main className="emvb-image-editor-stage" data-emvb-image-stage="">
        <div className="emvb-image-editor-frame" data-comparing={comparing || undefined}>
          <canvas
            key={attempt}
            ref={canvasRef}
            className="emvb-image-editor-canvas"
            aria-label={
              typeof imageProps.alt === "string" && imageProps.alt
                ? `Preview: ${imageProps.alt}`
                : "Preview"
            }
            role="img"
            data-emvb-image-canvas=""
            hidden={phase.kind === "error"}
          />
          {comparing && originalUrl ? (
            <img
              className="emvb-image-editor-original"
              src={originalUrl}
              alt=""
              data-emvb-image-original=""
            />
          ) : null}
          {comparing ? <span className="emvb-image-editor-badge">Original</span> : null}
        </div>
        {phase.kind === "loading" ? (
          <div className="emvb-image-editor-overlay" aria-busy="true" aria-live="polite">
            <span className="emvb-image-editor-spinner" aria-hidden="true" />
            <span>Opening the picture…</span>
          </div>
        ) : null}
        {phase.kind === "error" ? (
          <div className="emvb-image-editor-error" role="alert" data-emvb-image-error="">
            <span className="emvb-image-editor-error-icon" aria-hidden="true">
              <WarningCircleIcon weight="duotone" />
            </span>
            <h3>Can't edit this picture</h3>
            <p>{phase.message}</p>
            <div className="emvb-image-editor-error-actions">
              {phase.retry ? (
                <Button
                  variant="secondary"
                  className={BUTTON}
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  Try again
                </Button>
              ) : (
                <Dialog.Close
                  render={(props) => (
                    <Button {...props} variant="secondary" className={BUTTON}>
                      Back to the page
                    </Button>
                  )}
                />
              )}
            </div>
          </div>
        ) : null}
      </main>

      <footer className="emvb-image-editor-status" aria-live="polite">
        {ready ? (
          <span
            className="emvb-image-editor-mode"
            data-emvb-image-mode={phase.renderMode}
            title={phase.reason}
          >
            <CpuIcon aria-hidden="true" />
            {phase.renderMode === "worker"
              ? "Fast preview (background thread)"
              : "Standard preview"}
          </span>
        ) : (
          <span>{phase.kind === "loading" ? "Loading…" : "Nothing to edit yet"}</span>
        )}
        <span className="emvb-image-editor-keys">
          <kbd>Ctrl</kbd>
          <kbd>Z</kbd> undo · hold <kbd>\</kbd> to compare · <kbd>Esc</kbd> closes
        </span>
      </footer>
    </div>
  );
}

/**
 * The full-screen image editor (W-482). Loaded on demand from the Image settings; photocn and
 * this file never ship in the main editor chunk or on public pages.
 */
export default function ImageEditorDialog({
  open,
  onOpenChange,
  imageProps,
  forceRenderMode,
  onClosed,
}: ImageEditorDialogProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed?.();
      }}
    >
      <Dialog className="emvb-image-editor-popup" data-emvb-image-editor-popup="">
        <style>{UI_CSS + IMAGE_EDITOR_CSS}</style>
        {open ? <Editor imageProps={imageProps} forceRenderMode={forceRenderMode} /> : null}
      </Dialog>
    </Dialog.Root>
  );
}
