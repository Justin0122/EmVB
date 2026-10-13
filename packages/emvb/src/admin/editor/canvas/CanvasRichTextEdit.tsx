import { EditorContent, useEditor } from "@tiptap/react";
import * as React from "react";
import { createPortal } from "react-dom";
import type { Fetcher } from "../../api.ts";
import { richTextExtensions } from "../rich-text/extensions.ts";
import { RichTextToolbar } from "../rich-text/RichTextEditor.tsx";
import type { Box } from "./SelectionOverlay.tsx";

/** Inherited text styles the editor takes from the element, since it sits outside its parents. */
const INHERITED = [
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
] as const;

/**
 * W-324: edits a rich text in the canvas itself. The editor sits in the page over the element,
 * with the element's classes and text styles, so it looks like the page while typing; the
 * element is hidden and keeps the editor's height, so the page below moves along. The toolbar
 * floats above it in the unscaled overlay. A click outside, or Ctrl/Cmd+Enter, keeps the
 * change; Escape drops it.
 */
export function CanvasRichTextEdit({
  element,
  value,
  toolbarAt,
  fetcher,
  onCommit,
  onCancel,
}: {
  element: HTMLElement;
  value: string;
  /** Where the toolbar goes, in overlay coordinates (the element's scaled box). */
  toolbarAt: Box;
  fetcher?: Fetcher;
  onCommit: (html: string) => void;
  onCancel: () => void;
}) {
  const doc = element.ownerDocument;
  const [host] = React.useState(() => {
    const div = doc.createElement("div");
    div.setAttribute("data-emvb-canvas-rte", "");
    return div;
  });
  const toolbar = React.useRef<HTMLDivElement>(null);
  const done = React.useRef(false);
  const editor = useEditor({
    extensions: richTextExtensions(),
    content: value,
    editorProps: { attributes: { class: "emvb-canvas-rte-content", "aria-label": "Edit text" } },
  });

  const finish = React.useCallback(
    (keep: boolean) => {
      if (done.current) return;
      done.current = true;
      const html = editor && !editor.isEmpty ? editor.getHTML() : "";
      if (keep && html !== value) onCommit(html);
      else onCancel();
    },
    [editor, value, onCommit, onCancel],
  );
  const finishRef = React.useRef(finish);
  finishRef.current = finish;

  // Place the editor over the element, looking like it, and hide the element meanwhile.
  React.useLayoutEffect(() => {
    const view = doc.defaultView;
    const rect = element.getBoundingClientRect();
    const computed = view?.getComputedStyle(element);
    host.className = element.className;
    host.style.cssText = "";
    for (const property of INHERITED) {
      host.style.setProperty(property, computed?.getPropertyValue(property) ?? "");
    }
    // Inside the page root, so the site's tag styles (h1, p…) apply as on the page.
    (element.closest(".emvb-root") ?? doc.body).append(host);
    Object.assign(host.style, { position: "absolute", top: "0px", left: "0px" });
    const origin = host.getBoundingClientRect();
    Object.assign(host.style, {
      top: `${rect.top - origin.top}px`,
      left: `${rect.left - origin.left}px`,
      width: `${rect.width}px`,
      margin: "0",
      zIndex: "2147483000",
      outline: "2px solid #2f6feb",
      outlineOffset: "4px",
      background: "transparent",
    });
    const visibility = element.style.visibility;
    const minHeight = element.style.minHeight;
    element.style.visibility = "hidden";
    const grow = () => {
      element.style.minHeight = `${host.offsetHeight}px`;
    };
    grow();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(grow);
    observer?.observe(host);
    return () => {
      observer?.disconnect();
      host.remove();
      element.style.visibility = visibility;
      element.style.minHeight = minHeight;
    };
  }, [doc, element, host]);

  React.useEffect(() => {
    if (!editor) return;
    editor.commands.focus("end");
  }, [editor]);

  // A click anywhere else, in the page or the editor around it, keeps the change.
  React.useEffect(() => {
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && (host.contains(target) || toolbar.current?.contains(target))) return;
      finishRef.current(true);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finishRef.current(false);
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        finishRef.current(true);
      }
      event.stopPropagation();
    };
    doc.addEventListener("mousedown", outside, true);
    document.addEventListener("mousedown", outside, true);
    host.addEventListener("keydown", key);
    return () => {
      doc.removeEventListener("mousedown", outside, true);
      document.removeEventListener("mousedown", outside, true);
      host.removeEventListener("keydown", key);
    };
  }, [doc, host]);

  return (
    <>
      {editor && (
        <div
          ref={toolbar}
          className="emvb-canvas-rte-toolbar"
          data-emvb-canvas-rte-toolbar=""
          style={{ top: Math.max(0, toolbarAt.top - 8), left: toolbarAt.left }}
        >
          <RichTextToolbar editor={editor} fetcher={fetcher} />
          <button type="button" className="emvb-rte-btn emvb-rte-done" onClick={() => finish(true)}>
            Done
          </button>
        </div>
      )}
      {createPortal(<EditorContent editor={editor} />, host)}
    </>
  );
}
