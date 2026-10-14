import { Button } from "@cloudflare/kumo";
import { MagicWandIcon } from "@phosphor-icons/react";
import * as React from "react";
import { BUTTON } from "../ui.ts";
import type { SavedCopy } from "./ImageEditorDialog.tsx";

/** The only static import of the image editor: everything behind it is a lazy chunk (W-482). */
const loadDialog = () => import("./ImageEditorDialog.tsx");
const ImageEditorDialog = React.lazy(loadDialog);
const prefetch = () => void loadDialog().catch(() => undefined);

/** "Edit image" under the Image settings preview. Hover or focus starts fetching the editor. */
export function ImageEditButton({
  imageProps,
  onSave,
}: {
  imageProps: Record<string, unknown>;
  /** Upload the edited copy and apply it to the element (W-485). */
  onSave?: (file: File, copy: SavedCopy) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
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
        onPointerEnter={prefetch}
        onFocus={prefetch}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        Edit image
      </Button>
      {mounted ? (
        <React.Suspense fallback={null}>
          <ImageEditorDialog
            open={open}
            onOpenChange={setOpen}
            imageProps={imageProps}
            onSave={onSave}
            onClosed={() => buttonRef.current?.focus()}
          />
        </React.Suspense>
      ) : null}
    </>
  );
}
