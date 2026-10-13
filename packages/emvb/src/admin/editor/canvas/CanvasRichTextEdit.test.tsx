import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
import { CanvasRichTextEdit } from "./CanvasRichTextEdit.tsx";

afterEach(cleanup);

async function open(onCommit: (html: string) => void, onCancel: () => void) {
  const element = document.createElement("div");
  element.className = "emvb-rich-text emvb-e-rich0001";
  element.innerHTML = "<p>Oud</p>";
  document.body.append(element);
  const host = await mount(
    <CanvasRichTextEdit
      element={element}
      value="<p>Oud</p>"
      toolbarAt={{ top: 100, left: 10, width: 300, height: 40 }}
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );
  await settle();
  return { element, host };
}

describe("rich text edited in the canvas (W-324)", () => {
  test("the editor sits in the page with the element's classes; the element is hidden", async () => {
    const { element } = await open(
      () => {},
      () => {},
    );
    const editor = document.querySelector<HTMLElement>("[data-emvb-canvas-rte]");
    expect(editor?.className).toBe("emvb-rich-text emvb-e-rich0001");
    expect(editor?.querySelector(".ProseMirror p")?.textContent).toBe("Oud");
    expect(element.style.visibility).toBe("hidden");
    expect(document.querySelector("[data-emvb-canvas-rte-toolbar]")).not.toBeNull();
  });

  test("Escape drops the edit and shows the element again", async () => {
    let cancelled = 0;
    const { element } = await open(
      () => {},
      () => cancelled++,
    );
    const editor = document.querySelector<HTMLElement>("[data-emvb-canvas-rte]");
    await act(async () => {
      editor?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(cancelled).toBe(1);
    await cleanup();
    expect(element.style.visibility).toBe("");
    expect(document.querySelector("[data-emvb-canvas-rte]")).toBeNull();
  });

  test("a click outside keeps a change; Done keeps it too", async () => {
    const kept: string[] = [];
    await open(
      (html) => kept.push(html),
      () => kept.push("cancel"),
    );
    const pm = document.querySelector<HTMLElement>("[data-emvb-canvas-rte] .ProseMirror");
    await act(async () => {
      pm?.focus();
      const range = document.createRange();
      range.selectNodeContents(pm?.querySelector("p") as Node);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await settle();
    await act(async () =>
      document.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')?.click(),
    );
    await act(async () =>
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
    );
    expect(kept).toEqual(["<p><strong>Oud</strong></p>"]);
  });

  test("leaving without a change is not a change", async () => {
    const kept: string[] = [];
    const { host } = await open(
      (html) => kept.push(html),
      () => kept.push("cancel"),
    );
    await act(async () => {
      [...host.ownerDocument.querySelectorAll("button")]
        .find((b) => b.textContent === "Done")
        ?.click();
    });
    expect(kept).toEqual(["cancel"]);
  });
});
