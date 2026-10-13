import {
  applyInlineEdit,
  inlineEditTarget,
  type InlineEditTarget,
} from "../../core/inline-edit.ts";
import type { Layout } from "../../core/schema/layout.ts";

/**
 * W-325: texts edited on the site in EmDash's edit mode. The page renders with markers on its
 * own texts and its component uses' texts (`data-emvb-text`, `data-emvb-bound`) inside a wrapper
 * naming the entry (`data-emvb-inline="<collection>|<id>|<layout field>"`). A click edits a text
 * in place: plain text as typed, rich text with the formatting editor (loaded on first use). Each
 * change is saved to the entry's draft through EmDash's content API, and EmDash's toolbar then
 * offers Publish.
 */

export type InlineEntry = { collection: string; id: string; field: string };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const MARKED = "[data-emvb-text],[data-emvb-bound]";

const STYLE = `
[data-emvb-inline] :is(${MARKED}){cursor:text;outline:1px dashed transparent;outline-offset:3px;transition:outline-color .15s}
[data-emvb-inline] :is(${MARKED}):hover{outline-color:rgba(59,130,246,.7)}
[data-emvb-inline] [data-emvb-inline-editing]{outline:2px solid #3b82f6 !important;outline-offset:3px}
[data-emvb-inline] [data-emvb-inline-editing] :is(${MARKED}){outline:none}
[data-emvb-inline-toolbar]{position:absolute;z-index:2147483000;display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px;border-radius:8px;background:#fff;color:#111;box-shadow:0 4px 16px rgba(0,0,0,.2),0 0 0 1px rgba(0,0,0,.08);font:13px/1.2 system-ui,sans-serif}
[data-emvb-inline-toolbar] button,[data-emvb-inline-toolbar] select{height:28px;min-width:28px;padding:0 7px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}
[data-emvb-inline-toolbar] button:hover,[data-emvb-inline-toolbar] button[aria-pressed=true]{background:#eef2ff;color:#1d4ed8}
[data-emvb-inline-toolbar] select{border:1px solid #d4d4d8}
[data-emvb-inline-toast]{position:fixed;z-index:2147483000;left:50%;bottom:72px;transform:translateX(-50%);padding:6px 12px;border-radius:999px;background:#111;color:#fff;font:13px/1.4 system-ui,sans-serif}
`;

/** The entry a marked element belongs to, from its wrapper. */
function entryOf(element: Element): InlineEntry | null {
  const ref = element.closest("[data-emvb-inline]")?.getAttribute("data-emvb-inline") ?? "";
  const [collection = "", id = "", field = ""] = ref.split("|");
  return collection && id && field ? { collection, id, field } : null;
}

/** The edit a marked element stands for. */
function targetOf(element: Element): InlineEditTarget | null {
  return inlineEditTarget(
    element.getAttribute("data-emvb-text"),
    element.getAttribute("data-emvb-bound"),
  );
}

const contentUrl = (entry: InlineEntry) =>
  `/_emdash/api/content/${encodeURIComponent(entry.collection)}/${encodeURIComponent(entry.id)}`;

const HEADERS = { "X-EmDash-Request": "1", "Content-Type": "application/json" };

/**
 * Saves one edit to the entry's draft: reads the current draft (and its revision), applies the
 * edit to the layout and writes it back. Throws when the text is no longer on the page or the
 * save is refused.
 */
export async function saveInlineEdit(
  entry: InlineEntry,
  target: InlineEditTarget,
  value: string,
  fetchFn: Fetch = fetch,
): Promise<void> {
  const current = await fetchFn(contentUrl(entry), {
    credentials: "same-origin",
    headers: HEADERS,
  });
  if (!current.ok) throw new Error(`load ${current.status}`);
  const body = (await current.json()) as {
    data?: { item?: { data?: Record<string, unknown> }; _rev?: string };
  };
  const layout = body.data?.item?.data?.[entry.field] as Layout | undefined;
  if (!layout?.root) throw new Error("no layout");
  const next = applyInlineEdit(layout, target, value);
  if (!next) throw new Error("text not found");
  const saved = await fetchFn(contentUrl(entry), {
    method: "PUT",
    credentials: "same-origin",
    headers: HEADERS,
    body: JSON.stringify({ data: { [entry.field]: next }, _rev: body.data?.["_rev"] }),
  });
  if (!saved.ok) throw new Error(`save ${saved.status}`);
}

/** Publishes the entry's draft, then shows the published page. */
async function publish(entry: InlineEntry, fetchFn: Fetch) {
  const current = await fetchFn(contentUrl(entry), {
    credentials: "same-origin",
    headers: HEADERS,
  });
  const body = (await current.json()) as { data?: { _rev?: string } };
  const res = await fetchFn(`${contentUrl(entry)}/publish`, {
    method: "POST",
    credentials: "same-origin",
    headers: HEADERS,
    body: JSON.stringify({ _rev: body.data?.["_rev"] }),
  });
  if (res.ok) location.reload();
  else toast(document, "Publishing failed");
}

function toast(doc: Document, text: string) {
  doc.querySelector("[data-emvb-inline-toast]")?.remove();
  const el = doc.createElement("div");
  el.setAttribute("data-emvb-inline-toast", "");
  el.textContent = text;
  doc.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

/** EmDash's toolbar, told the entry has unpublished changes, with its Publish button. */
function showUnpublished(doc: Document, entry: InlineEntry, fetchFn: Fetch) {
  const status = doc.getElementById("emdash-tb-status");
  if (status) {
    status.innerHTML =
      '<span class="emdash-tb-badge emdash-tb-badge--pending">Unpublished changes</span>';
  }
  const button = doc.getElementById("emdash-tb-publish") as HTMLButtonElement | null;
  if (button) {
    button.style.display = "";
    button.disabled = false;
    // Replaces the toolbar's own handler, which publishes the entry it saw at page load.
    button.replaceWith(button.cloneNode(true));
    const fresh = doc.getElementById("emdash-tb-publish") as HTMLButtonElement;
    fresh.addEventListener("click", () => {
      fresh.disabled = true;
      void publish(entry, fetchFn);
    });
  }
}

/** Plain text of an element as typed, line breaks included where they belong. */
const plainOf = (element: HTMLElement, multiline: boolean) =>
  (multiline ? element.innerText : (element.textContent ?? "")).replace(/ /g, " ").trim();

/** Edits a plain text in place; resolves with the new text, or null when unchanged or dropped. */
function editPlain(element: HTMLElement, multiline: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const before = plainOf(element, multiline);
    const original = element.innerHTML;
    element.setAttribute("data-emvb-inline-editing", "");
    element.contentEditable = "plaintext-only";
    if (element.contentEditable !== "plaintext-only") element.contentEditable = "true";
    element.focus();
    const end = (keep: boolean) => {
      element.removeEventListener("keydown", key);
      element.removeEventListener("blur", blur);
      element.contentEditable = "false";
      element.removeAttribute("contenteditable");
      element.removeAttribute("data-emvb-inline-editing");
      const after = plainOf(element, multiline);
      if (!keep) element.innerHTML = original;
      resolve(keep && after !== before ? after : null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        end(false);
      } else if (event.key === "Enter" && !multiline) {
        event.preventDefault();
        end(true);
      }
    };
    const blur = () => end(true);
    element.addEventListener("keydown", key);
    element.addEventListener("blur", blur);
  });
}

/** Starts editing on clicks on marked texts inside `[data-emvb-inline]` wrappers. */
export function initInlineEdit(doc: Document = document, fetchFn: Fetch = fetch): () => void {
  if (!doc.querySelector("[data-emvb-inline]")) return () => {};
  const style = doc.createElement("style");
  style.setAttribute("data-emvb-inline-style", "");
  style.textContent = STYLE;
  doc.head.append(style);
  let busy = false;
  // Saves run one after another, so each starts from the draft the last one wrote.
  let queue: Promise<void> = Promise.resolve();

  const save = (entry: InlineEntry, target: InlineEditTarget, value: string) => {
    queue = queue
      .then(() => saveInlineEdit(entry, target, value, fetchFn))
      .then(() => {
        toast(doc, "Saved as draft");
        showUnpublished(doc, entry, fetchFn);
      })
      .catch(() => toast(doc, "Couldn't save this change"));
  };

  const click = (event: MouseEvent) => {
    const hit = (event.target as Element | null)?.closest?.(MARKED) as HTMLElement | null;
    if (!hit || !hit.closest("[data-emvb-inline]")) return;
    // A text inside a link or button: edit it rather than follow it.
    event.preventDefault();
    if (busy || hit.hasAttribute("data-emvb-inline-editing")) return;
    event.stopPropagation();
    const entry = entryOf(hit);
    const target = targetOf(hit);
    if (!entry || !target) return;
    busy = true;
    const edit = target.rich
      ? import("./rich.ts").then(({ editRich }) => editRich(hit))
      : editPlain(hit, target.kind === "element" ? target.multiline : false);
    void edit
      .then((value) => {
        if (value !== null) save(entry, target, value);
      })
      .finally(() => {
        busy = false;
      });
  };
  doc.addEventListener("click", click, true);
  return () => {
    doc.removeEventListener("click", click, true);
    style.remove();
  };
}
