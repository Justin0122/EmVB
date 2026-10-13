import { Editor } from "@tiptap/core";
import { inlineRichTextExtensions } from "./extensions.ts";

/**
 * W-325: a rich text edited on the site. The editor takes the element's place (it keeps its
 * classes, so it looks like the page) with a small toolbar above it. Done, or a click outside,
 * keeps the change; Escape drops it. Loaded only when an editor first edits a rich text.
 */

type Tool = {
  label: string;
  text: string;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
};

const TOOLS: Tool[] = [
  {
    label: "Bold",
    text: "B",
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive("bold"),
  },
  {
    label: "Italic",
    text: "I",
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive("italic"),
  },
  {
    label: "Underline",
    text: "U",
    run: (e) => e.chain().focus().toggleUnderline().run(),
    active: (e) => e.isActive("underline"),
  },
  {
    label: "Link",
    text: "Link",
    run: (e) => {
      const current = String(e.getAttributes("link")["href"] ?? "");
      const href = window.prompt("Link address (empty to remove)", current);
      if (href === null) return;
      const chain = e.chain().focus().extendMarkRange("link");
      if (href.trim()) chain.setLink({ href: href.trim() }).run();
      else chain.unsetLink().run();
    },
    active: (e) => e.isActive("link"),
  },
  {
    label: "Bulleted list",
    text: "•",
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive("bulletList"),
  },
  {
    label: "Numbered list",
    text: "1.",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    active: (e) => e.isActive("orderedList"),
  },
  {
    label: "Quote",
    text: "“",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive("blockquote"),
  },
];

const BLOCKS = [
  ["p", "Paragraph"],
  ["1", "Heading 1"],
  ["2", "Heading 2"],
  ["3", "Heading 3"],
  ["4", "Heading 4"],
] as const;

function blockOf(editor: Editor): string {
  for (const level of [1, 2, 3, 4] as const) {
    if (editor.isActive("heading", { level })) return String(level);
  }
  return "p";
}

function toolbarFor(doc: Document, editor: Editor, done: () => void): HTMLElement {
  const bar = doc.createElement("div");
  bar.setAttribute("data-emvb-inline-toolbar", "");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Formatting");
  const select = doc.createElement("select");
  select.setAttribute("aria-label", "Text style");
  for (const [value, label] of BLOCKS) select.add(new Option(label, value));
  select.addEventListener("change", () => {
    const chain = editor.chain().focus();
    if (select.value === "p") chain.setParagraph().run();
    else chain.setHeading({ level: Number(select.value) as 1 | 2 | 3 | 4 }).run();
  });
  bar.append(select);
  const buttons = TOOLS.map((tool) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = tool.text;
    button.title = tool.label;
    button.setAttribute("aria-label", tool.label);
    // Keep the editor's selection: a mousedown would blur it first.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => tool.run(editor));
    bar.append(button);
    return { tool, button };
  });
  const finish = doc.createElement("button");
  finish.type = "button";
  finish.textContent = "Done";
  finish.style.fontWeight = "600";
  finish.addEventListener("mousedown", (event) => event.preventDefault());
  finish.addEventListener("click", done);
  bar.append(finish);
  const sync = () => {
    select.value = blockOf(editor);
    for (const { tool, button } of buttons) {
      button.setAttribute("aria-pressed", String(tool.active?.(editor) ?? false));
    }
  };
  editor.on("selectionUpdate", sync);
  editor.on("transaction", sync);
  sync();
  return bar;
}

/**
 * Places the toolbar just above the element; when that's scrolled out of view, at the top of the
 * window while the element is still on screen.
 */
function place(bar: HTMLElement, element: HTMLElement) {
  const view = element.ownerDocument.defaultView;
  const scrollY = view?.scrollY ?? 0;
  const rect = element.getBoundingClientRect();
  const above = rect.top - bar.offsetHeight - 10;
  const lowest = rect.bottom - bar.offsetHeight;
  const top = above >= 8 ? above : Math.min(8, Math.max(lowest, above));
  bar.style.top = `${Math.max(0, top + scrollY)}px`;
  bar.style.left = `${rect.left + (view?.scrollX ?? 0)}px`;
}

/** Edits `element`'s rich text in place; resolves with the HTML, or null when unchanged or dropped. */
export function editRich(element: HTMLElement): Promise<string | null> {
  const doc = element.ownerDocument;
  return new Promise((resolve) => {
    const original = element.innerHTML;
    element.innerHTML = "";
    element.setAttribute("data-emvb-inline-editing", "");
    const editor = new Editor({
      element,
      extensions: inlineRichTextExtensions(),
      content: original,
      editorProps: { attributes: { "aria-label": "Edit text", style: "outline:none" } },
    });
    const before = editor.getHTML();
    let ended = false;
    const end = (keep: boolean) => {
      if (ended) return;
      ended = true;
      const html = editor.isEmpty ? "" : editor.getHTML();
      doc.removeEventListener("mousedown", outside, true);
      doc.removeEventListener("keydown", key, true);
      doc.defaultView?.removeEventListener("scroll", follow);
      editor.destroy();
      bar.remove();
      element.removeAttribute("data-emvb-inline-editing");
      const changed = keep && html !== before;
      // Until the page is shown again, the element shows what was kept.
      element.innerHTML = changed ? html : original;
      resolve(changed ? html : null);
    };
    const bar = toolbarFor(doc, editor, () => end(true));
    doc.body.append(bar);
    place(bar, element);
    const follow = () => place(bar, element);
    doc.defaultView?.addEventListener("scroll", follow, { passive: true });
    editor.on("update", follow);
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && (element.contains(target) || bar.contains(target))) return;
      end(true);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        end(false);
      }
    };
    doc.addEventListener("mousedown", outside, true);
    doc.addEventListener("keydown", key, true);
    editor.commands.focus("end");
  });
}
