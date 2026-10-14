import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";

/** A stand-in for photocn's Photo: history only, no WebGL in happy-dom. */
class FakePhoto {
  listeners = new Set<() => void>();
  edits = 0;
  undone = 0;
  attached = false;
  disposed = false;
  outputSize = { width: 640, height: 480 };
  get canUndo() {
    return this.edits > 0;
  }
  get canRedo() {
    return this.undone > 0;
  }
  get recipe() {
    return this.edits > 0 ? { version: 1 } : null;
  }
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    for (const fn of this.listeners) fn();
  }
  edit() {
    this.edits++;
    this.undone = 0;
    this.emit();
  }
  undo() {
    this.edits--;
    this.undone++;
    this.emit();
    return this;
  }
  redo() {
    this.edits++;
    this.undone--;
    this.emit();
    return this;
  }
  reset() {
    this.edits = 0;
    this.emit();
    return this;
  }
  attach() {
    this.attached = true;
    return () => undefined;
  }
  ready() {
    return Promise.resolve(this);
  }
  dispose() {
    this.disposed = true;
  }
}

let photo = new FakePhoto();
let opened: { ok: boolean; message?: string } = { ok: true };
mock.module(new URL("./engine.ts", import.meta.url).pathname, () => ({
  openPhoto: async () =>
    opened.ok ? { ok: true, photo, renderMode: "worker" } : { ok: false, message: opened.message },
}));
const { default: ImageEditorDialog } = await import("./ImageEditorDialog.tsx");

const realFetch = globalThis.fetch;
const serveImage = () => {
  globalThis.fetch = (async () =>
    new Response("img", { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
};

afterEach(async () => {
  globalThis.fetch = realFetch;
  await cleanup();
  photo = new FakePhoto();
  opened = { ok: true };
});

const open = async (imageProps: Record<string, unknown>) => {
  await mount(<ImageEditorDialog open onOpenChange={() => undefined} imageProps={imageProps} />);
  // The load, the open and the ready each resolve a turn later; settle them one after another.
  await [1, 2, 3, 4, 5].reduce((prev) => prev.then(settle), Promise.resolve());
  const root = document.querySelector<HTMLElement>("[data-emvb-image-editor]");
  if (!root) throw new Error("editor not rendered");
  return root;
};
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);

describe("image editor dialog shell (W-482)", () => {
  test("opens a library picture, attaches the canvas and reports the render mode", async () => {
    serveImage();
    const root = await open({ src: "/_emdash/api/media/file/shop.jpg", alt: "Shop front" });
    expect(root.dataset.emvbImageEditor).toBe("ready");
    expect(root.dataset.emvbRenderMode).toBe("worker");
    expect(photo.attached).toBe(true);
    expect(q("[data-emvb-image-editor-file]")?.textContent).toBe("shop.jpg · 640 × 480 px");
    expect(q("[data-emvb-image-canvas]")?.getAttribute("aria-label")).toBe("Preview: Shop front");
    expect(q("[data-emvb-image-mode]")?.textContent).toContain("Fast preview");
  });

  test("undo, redo and reset follow the photo's history, by button and by keyboard", async () => {
    serveImage();
    const root = await open({ src: "/a.jpg", alt: "A" });
    const undo = q<HTMLButtonElement>("[data-emvb-image-undo]");
    const redo = q<HTMLButtonElement>("[data-emvb-image-redo]");
    const reset = q<HTMLButtonElement>("[data-emvb-image-reset]");
    expect(undo?.disabled).toBe(true);
    expect(reset?.disabled).toBe(true);
    photo.edit();
    await settle();
    expect(undo?.disabled).toBe(false);
    expect(reset?.disabled).toBe(false);
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    await settle();
    expect(photo.edits).toBe(0);
    expect(redo?.disabled).toBe(false);
    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    await settle();
    expect(photo.edits).toBe(1);
    reset?.click();
    await settle();
    expect(photo.edits).toBe(0);
  });

  test("Save copy stays disabled until export lands (W-485)", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    expect(q<HTMLButtonElement>("[data-emvb-image-save]")?.disabled).toBe(true);
  });

  test("holding \\ shows the original over the preview", async () => {
    serveImage();
    const root = await open({ src: "/a.jpg", alt: "A" });
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", bubbles: true }));
    await settle();
    expect(q("[data-emvb-image-original]")).not.toBeNull();
    expect(q("[data-emvb-image-compare]")?.getAttribute("aria-pressed")).toBe("true");
    root.dispatchEvent(new KeyboardEvent("keyup", { key: "\\", bubbles: true }));
    await settle();
    expect(q("[data-emvb-image-original]")).toBeNull();
  });

  test("the tool rail is a vertical tab list that arrows move through", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    const tabs = [...document.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    expect(tabs.map((t) => t.textContent)).toEqual(["Crop", "Adjust", "Filters", "Curves", "Blur"]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await settle();
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("adjust");
    tabs[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    await settle();
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("blur");
  });

  test("a picture on another website gets the upload-a-copy message, without loading photocn", async () => {
    await open({ src: "https://cdn.example.com/a.jpg", alt: "A" });
    expect(q("[data-emvb-image-editor]")?.dataset.emvbImageEditor).toBe("error");
    expect(q("[data-emvb-image-error]")?.textContent).toContain(
      "Upload a copy to the media library",
    );
    // Retrying can't help, so the way out is back to the page.
    expect(q("[data-emvb-image-error] button")?.textContent).toBe("Back to the page");
    expect(q(".emvb-image-editor-title p, [data-emvb-image-editor-file]")?.textContent).toContain(
      "Couldn't open the picture",
    );
    expect(photo.attached).toBe(false);
  });

  test("an engine failure shows its message and Try again", async () => {
    serveImage();
    opened = { ok: false, message: "This browser can't edit images: it has no WebGL 2." };
    await open({ src: "/a.jpg", alt: "A" });
    expect(q("[data-emvb-image-error]")?.textContent).toContain("no WebGL 2");
    expect(q("[data-emvb-image-error] button")?.textContent).toBe("Try again");
  });

  test("closing disposes the photo", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    const current = photo;
    await cleanup();
    expect(current.disposed).toBe(true);
  });
});
