import * as React from "react";
import { XIcon } from "@phosphor-icons/react";
import {
  componentValueAt,
  findNode,
  withComponentValue,
  type Layout,
  type LayoutNode,
} from "../../../core/index.ts";
import type { Fetcher } from "../../api.ts";
import { imageFieldNode, imageFieldValue } from "../components.tsx";
import { MediaPicker } from "../panels/settings/MediaPicker.tsx";
import type { Box } from "./SelectionOverlay.tsx";

/** A component's image chosen on the canvas (W-337): its use, its field's path, the picture. */
export type ImagePick = { useId: string; path: string; element: HTMLElement };

const WIDTH = 320;

/**
 * W-337: the media picker for one image field of a component use, under the picture clicked on
 * the canvas (a card's photo). It stores the choice in the use's values, as the Content tab does.
 */
export function ImagePickPopover({
  pick,
  box,
  layout,
  fetcher,
  onUpdateNode,
  onClose,
}: {
  pick: ImagePick;
  /** The picture, in the overlay's on-screen pixels. */
  box: Box;
  layout: Layout | null;
  fetcher?: Fetcher;
  onUpdateNode: (id: string, update: (node: LayoutNode) => LayoutNode) => void;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const use = layout ? findNode(layout, pick.useId) : undefined;
  if (!use || !fetcher) return null;
  const values = (use.props as { values?: Record<string, unknown> }).values;
  return (
    <div
      className="emvb-image-pick"
      data-emvb-image-pick={pick.path}
      role="dialog"
      aria-label="Choose image"
      style={{
        top: box.top + Math.min(box.height, 48),
        left: Math.max(0, box.left + box.width / 2 - WIDTH / 2),
        width: WIDTH,
      }}
    >
      <div className="emvb-image-pick-head">
        <span>Image</span>
        <button
          type="button"
          className="emvb-overlay-action"
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          <XIcon size={16} aria-hidden="true" />
        </button>
      </div>
      <MediaPicker
        label="Image"
        fetcher={fetcher}
        node={imageFieldNode(componentValueAt(values, pick.path))}
        onChange={(picked) =>
          onUpdateNode(pick.useId, (node) => {
            const current = node.props as { values?: Record<string, unknown> };
            return {
              ...node,
              props: {
                ...node.props,
                values: withComponentValue(current.values, pick.path, imageFieldValue(picked)),
              },
            } as LayoutNode;
          })
        }
      />
    </div>
  );
}
