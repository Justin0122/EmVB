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
const GAP = 8;

/**
 * Under the picture's top, or above the picture when the popover would run past the canvas's
 * bottom; never past its edges.
 */
function place(box: Box, height: number, area: { width: number; height: number }) {
  let top = box.top + Math.min(box.height, 48);
  if (top + height > area.height - GAP) {
    const above = box.top - height - GAP;
    top = above >= GAP ? above : Math.max(GAP, area.height - height - GAP);
  }
  const left = Math.min(
    Math.max(GAP, box.left + box.width / 2 - WIDTH / 2),
    Math.max(GAP, area.width - WIDTH - GAP),
  );
  return { top, left };
}

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
  const ref = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState(0);
  const [area, setArea] = React.useState({ width: Infinity, height: Infinity });
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const parent = element.offsetParent as HTMLElement | null;
      setHeight(element.offsetHeight);
      if (parent) setArea({ width: parent.clientWidth, height: parent.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
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
      ref={ref}
      role="dialog"
      aria-label="Choose image"
      style={{ ...place(box, height, area), width: WIDTH }}
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
        label=""
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
