import { Button } from "@cloudflare/kumo";
import { MagicWandIcon } from "@phosphor-icons/react";
import * as React from "react";
import { BUTTON } from "../ui.ts";
import type { SavedCopy } from "./ImageEditorDialog.tsx";

/** The only static import of the image editor: everything behind it is a lazy chunk (W-482). */
const loadDialog = () => import("./ImageEditorDialog.tsx");
const ImageEditorDialog = React.lazy(loadDialog);
/** Starts fetching the editor chunk (hover, focus, a menu opening). */
export const prefetchImageEditor = () => void loadDialog().catch(() => undefined);

export type ImageEditSave = (file: File, copy: SavedCopy) => Promise<void>;

/**
 * The editor dialog, mounted on first open and kept for its closing animation. Used by the
 * Edit image button, the media picker's Edit… and the command palette (W-486).
 */
export function ImageEditorLauncher({
  open,
  onOpenChange,
  imageProps,
  onSave,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageProps: Record<string, unknown>;
  onSave?: ImageEditSave;
  onClosed?: () => void;
}) {
  const [mounted, setMounted] = React.useState(open);
  if (open && !mounted) setMounted(true);
  if (!mounted) return null;
  return (
    <React.Suspense fallback={null}>
      <ImageEditorDialog
        open={open}
        onOpenChange={onOpenChange}
        imageProps={imageProps}
        onSave={onSave}
        onClosed={onClosed}
      />
    </React.Suspense>
  );
}

/** "Edit image" under the Image settings preview. Hover or focus starts fetching the editor. */
export function ImageEditButton({
  imageProps,
  onSave,
}: {
  imageProps: Record<string, unknown>;
  /** Upload the edited copy and apply it to the element (W-485). */
  onSave?: ImageEditSave;
}) {
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="secondary"
        className={BUTTON}
        icon={<MagicWandIcon aria-hidden="true" />}
        data-emvb-image-edit=""
        onPointerEnter={prefetchImageEditor}
        onFocus={prefetchImageEditor}
        onClick={() => setOpen(true)}
      >
        Edit image
      </Button>
      <ImageEditorLauncher
        open={open}
        onOpenChange={setOpen}
        imageProps={imageProps}
        onSave={onSave}
        onClosed={() => buttonRef.current?.focus()}
      />
    </>
  );
}
