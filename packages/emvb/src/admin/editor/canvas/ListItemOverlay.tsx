import * as React from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CopyIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  componentValueAt,
  editListItem,
  findNode,
  listFieldAt,
  type Layout,
  type LayoutNode,
  type ListItemOp,
} from "../../../core/index.ts";
import { ComponentsContext } from "../components.tsx";
import type { Box } from "./SelectionOverlay.tsx";

/** One item of a component use's list, as the canvas marks it (`data-emvb-item`, W-336). */
export type ListItemRef = { useId: string; path: string; index: number };

export function parseListItem(value: string | null | undefined): ListItemRef | null {
  if (!value) return null;
  const [useId = "", path = "", position = ""] = value.split("|");
  const index = Number(position);
  return useId && path && /^\d+$/.test(position) ? { useId, path, index } : null;
}

const keyOf = (ref: ListItemRef) => `${ref.useId}|${ref.path}|${ref.index}`;

const markedAt = (target: EventTarget | null): string | null => {
  const element = target && (target as Node).nodeType === 1 ? (target as Element) : null;
  return element?.closest("[data-emvb-item]")?.getAttribute("data-emvb-item") ?? null;
};

const boxOfElement = (element: Element): Box => {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
};

const zoom = (box: Box, scale: number): Box => ({
  top: box.top * scale,
  left: box.left * scale,
  width: box.width * scale,
  height: box.height * scale,
});

/** The part of `element` its nearest clipping ancestor (a carousel's track) leaves in view. */
function visibleBox(element: Element): Box {
  const box = boxOfElement(element);
  let clip = element.parentElement;
  while (clip && getComputedStyle(clip).overflowX === "visible") clip = clip.parentElement;
  if (!clip || clip === element.ownerDocument.documentElement) return box;
  const area = boxOfElement(clip);
  const left = Math.max(box.left, area.left);
  const right = Math.min(box.left + box.width, area.left + area.width);
  return { ...box, left, width: Math.max(0, right - left) };
}

/** Where a list's "add" button goes: after its last item, still in view (W-336). */
type ListEnd = { path: string; box: Box; across: boolean };

type Tracked = { item: Box | null; hover: Box | null; across: boolean; ends: ListEnd[] };

const EMPTY: Tracked = { item: null, hover: null, across: false, ends: [] };

/** Items of one list lie side by side (a carousel, a row) rather than one under the other. */
const sideBySide = (elements: Element[]) => {
  const [first, second] = elements.map((element) => element.getBoundingClientRect());
  return !!first && !!second && Math.abs(first.top - second.top) < first.height / 2;
};

function track(doc: Document, useId: string | null, item: string | null, hover: string | null) {
  if (!useId) return EMPTY;
  const marked = [...doc.querySelectorAll(`[data-emvb-item^="${CSS.escape(useId)}|"]`)];
  const lists = new Map<string, Element[]>();
  for (const element of marked) {
    const ref = parseListItem(element.getAttribute("data-emvb-item"));
    if (!ref || ref.useId !== useId) continue;
    lists.set(ref.path, [...(lists.get(ref.path) ?? []), element]);
  }
  const ends: ListEnd[] = [];
  for (const [path, elements] of lists) {
    const last = elements.at(-1);
    if (last) ends.push({ path, box: visibleBox(last), across: sideBySide(elements) });
  }
  const find = (key: string | null) =>
    key ? marked.find((element) => element.getAttribute("data-emvb-item") === key) : undefined;
  const chosen = find(item);
  const hovered = hover !== item ? find(hover) : undefined;
  const path = parseListItem(item)?.path;
  return {
    item: chosen ? visibleBox(chosen) : null,
    hover: hovered ? visibleBox(hovered) : null,
    across: path ? sideBySide(lists.get(path) ?? []) : false,
    ends,
  };
}

const same = (a: Tracked, b: Tracked) => JSON.stringify(a) === JSON.stringify(b);

const TOOLBAR_HEIGHT = 26;

/**
 * W-336: on a selected component use, its list items (cards, questions, buttons) get their own
 * outline and toolbar on the canvas: add one after, duplicate, move, remove; and each list an
 * add button after its last item. The edits go through the use's values, like the Content tab.
 */
export function ListItemOverlay({
  doc,
  layout,
  selectedId,
  scale,
  onUpdateNode,
  onRemoved,
  onFocusItem,
}: {
  doc: Document | null;
  layout: Layout | null;
  selectedId: string | null;
  scale: number;
  onUpdateNode: (id: string, update: (node: LayoutNode) => LayoutNode) => void;
  /** An item was removed; the editor offers to undo it. */
  onRemoved?: (label: string) => void;
  /** The item the canvas works on, so the Content tab can open it. */
  onFocusItem?: (item: ListItemRef | null) => void;
}) {
  const { templates } = React.useContext(ComponentsContext);
  const [item, setItem] = React.useState<ListItemRef | null>(null);
  const [hover, setHover] = React.useState<string | null>(null);
  const [boxes, setBoxes] = React.useState<Tracked>(EMPTY);
  const reveal = React.useRef<string | null>(null);
  const focus = React.useRef(onFocusItem);
  focus.current = onFocusItem;

  const choose = React.useCallback((next: ListItemRef | null) => {
    setItem(next);
    focus.current?.(next);
  }, []);

  React.useEffect(() => {
    if (!doc) return;
    const click = (event: MouseEvent) => choose(parseListItem(markedAt(event.target)));
    const move = (event: MouseEvent) => setHover(markedAt(event.target));
    const leave = () => setHover(null);
    doc.addEventListener("click", click);
    doc.addEventListener("mousemove", move);
    doc.documentElement.addEventListener("mouseleave", leave);
    return () => {
      doc.removeEventListener("click", click);
      doc.removeEventListener("mousemove", move);
      doc.documentElement.removeEventListener("mouseleave", leave);
    };
  }, [doc, choose]);

  // Another element chosen (Layers, the keyboard): the item goes with its component.
  React.useEffect(() => {
    if (item && item.useId !== selectedId) choose(null);
  }, [item, selectedId, choose]);

  const itemKey = item ? keyOf(item) : null;
  React.useEffect(() => {
    if (!doc) return;
    let frameId = 0;
    const tick = () => {
      if (reveal.current) {
        const target = doc.querySelector(`[data-emvb-item="${CSS.escape(reveal.current)}"]`);
        if (target) {
          target.scrollIntoView({ block: "nearest", inline: "nearest" });
          reveal.current = null;
        }
      }
      const next = track(doc, selectedId, itemKey, hover);
      setBoxes((current) => (same(current, next) ? current : next));
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [doc, selectedId, itemKey, hover]);

  const use = selectedId && layout ? findNode(layout, selectedId) : undefined;
  if (!use || use.type !== "component") return null;
  const props = use.props as { partId?: string; values?: Record<string, unknown> };
  const fields = templates[props.partId ?? ""]?.fields ?? [];

  const listOf = (path: string) => {
    const field = listFieldAt(fields, path);
    const stored = componentValueAt(props.values, path);
    return { field, length: Array.isArray(stored) ? stored.length : 0 };
  };

  const run = (path: string, index: number, op: ListItemOp) => {
    const { field } = listOf(path);
    const next = editListItem(props.values, path, index, op, field?.max ?? 50);
    if (!next) return;
    onUpdateNode(use.id, (node) => {
      const current = node.props as { partId?: string; values?: Record<string, unknown> };
      return { ...node, props: { ...current, values: next.values } } as LayoutNode;
    });
    if (op === "remove") {
      choose(next.index >= 0 ? { useId: use.id, path, index: next.index } : null);
      onRemoved?.(field?.label ?? "Item");
      return;
    }
    const moved = { useId: use.id, path, index: next.index };
    reveal.current = keyOf(moved);
    choose(moved);
  };

  const selected = item && item.useId === use.id ? item : null;
  const list = selected ? listOf(selected.path) : null;
  const full = (path: string) => {
    const { field, length } = listOf(path);
    return length >= (field?.max ?? 50);
  };
  const Back = boxes.across ? ArrowLeftIcon : ArrowUpIcon;
  const On = boxes.across ? ArrowRightIcon : ArrowDownIcon;
  const name = list?.field?.label ?? "Item";

  return (
    <div className="emvb-overlay emvb-item-overlay" data-emvb-item-overlay="">
      {boxes.hover && <div className="emvb-item-outline" style={zoom(boxes.hover, scale)} />}
      {selected && boxes.item && (
        <>
          <div
            className="emvb-item-outline emvb-item-outline-selected"
            data-emvb-item-selected={keyOf(selected)}
            style={zoom(boxes.item, scale)}
          />
          <div
            className="emvb-overlay-label emvb-item-toolbar"
            data-emvb-item-toolbar=""
            style={toolbarPlace(zoom(boxes.item, scale))}
          >
            <span>
              {name} {selected.index + 1}
            </span>
            <ItemButton
              label="Move back"
              disabled={selected.index === 0}
              onClick={() => run(selected.path, selected.index, "move-back")}
            >
              <Back size={16} aria-hidden="true" />
            </ItemButton>
            <ItemButton
              label="Move on"
              disabled={!list || selected.index >= list.length - 1}
              onClick={() => run(selected.path, selected.index, "move-on")}
            >
              <On size={16} aria-hidden="true" />
            </ItemButton>
            <ItemButton
              label="Add one after"
              disabled={full(selected.path)}
              onClick={() => run(selected.path, selected.index, "add-after")}
            >
              <PlusIcon size={16} aria-hidden="true" />
            </ItemButton>
            <ItemButton
              label="Duplicate"
              disabled={full(selected.path)}
              onClick={() => run(selected.path, selected.index, "duplicate")}
            >
              <CopyIcon size={16} aria-hidden="true" />
            </ItemButton>
            <ItemButton label="Remove" onClick={() => run(selected.path, selected.index, "remove")}>
              <TrashIcon size={16} aria-hidden="true" />
            </ItemButton>
          </div>
        </>
      )}
      {boxes.ends.map((end) =>
        full(end.path) ? null : (
          <button
            key={end.path}
            type="button"
            className="emvb-list-add"
            data-emvb-list-add={end.path}
            aria-label={`Add to ${listOf(end.path).field?.label ?? "list"}`}
            title={`Add to ${listOf(end.path).field?.label ?? "list"}`}
            style={addPlace(zoom(end.box, scale), end.across)}
            onClick={() => run(end.path, listOf(end.path).length - 1, "append")}
          >
            <PlusIcon size={16} aria-hidden="true" />
          </button>
        ),
      )}
    </div>
  );
}

function ItemButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="emvb-overlay-action"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Inside the item's top-right corner, clear of the component's own toolbar at the top left. */
const toolbarPlace = (box: Box) => ({
  top: Math.max(0, box.top + 2),
  left: box.left + box.width - 2,
  transform: "translateX(-100%)",
  height: TOOLBAR_HEIGHT,
});

const ADD_SIZE = 28;

/** Beside the last item of a row (inside its edge when the row runs on), under a column's. */
function addPlace(box: Box, across: boolean) {
  if (across) {
    return {
      top: box.top + box.height / 2 - ADD_SIZE / 2,
      left: box.left + box.width - ADD_SIZE - 6,
    };
  }
  return {
    top: box.top + box.height - ADD_SIZE / 2,
    left: box.left + box.width / 2 - ADD_SIZE / 2,
  };
}
