import { afterEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";

/**
 * photocn's hook needs WebGL, which happy-dom lacks, so engine.ts is swapped for a fake editor API
 * (the plan's "panel ↔ params with a mocked editor object"). Calls are recorded.
 */
type Calls = [string, ...unknown[]][];
let calls: Calls = [];
let hookOptions: Record<string, unknown> | undefined;
let plan: { ok: boolean; message?: string } = { ok: true };
const state = {
  tool: "adjust",
  canUndo: false,
  canRedo: false,
  edited: false,
  editingCorners: false,
  straighten: 0,
  status: "ready",
};
const listeners = new Set<() => void>();
let version = 0;
const change = (patch: Partial<typeof state>) => {
  Object.assign(state, patch);
  version++;
  for (const fn of listeners) fn();
};
const record =
  (name: string, then?: (...args: unknown[]) => void) =>
  (...args: unknown[]) => {
    calls.push([name, ...args]);
    then?.(...args);
  };

function fakeApi() {
  const ref = <T,>() => ({ current: null as T | null });
  return {
    status: state.status,
    error: state.status === "error" ? new Error("Broken file") : undefined,
    disabled: false,
    isLoading: false,
    isReady: state.status === "ready",
    hasImage: true,
    imageSrc: "blob:x",
    tool: state.tool,
    setTool: record("setTool", (tool) => change({ tool: tool as string })),
    history: {
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      undo: record("undo"),
      redo: record("redo"),
    },
    compare: { active: false, setActive: record("compare") },
    recipes: { current: state.edited ? { v: 1 } : null },
    resetAll: record("resetAll"),
    histogram: { data: { pixels: 38400 }, canvasRef: ref<HTMLCanvasElement>() },
    rootRef: fakeApi.rootRef,
    stageRef: ref<HTMLDivElement>(),
    canvasRef: ref<HTMLCanvasElement>(),
    canvasKey: 0,
    geometry: {
      value: {
        straighten: state.straighten,
        perspectiveX: 0,
        perspectiveY: 0,
        aspectRatio: null,
        corners: null,
      },
      isDefault: state.straighten === 0,
      orientedSize: null,
      polygon: null,
      outputSize: { width: 640, height: 480 },
      crop: { x: 0, y: 0, width: 1, height: 1 },
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      displayRect: { x: 0, y: 0, width: 1, height: 1 },
      view: state.tool === "compose" ? "full" : "crop",
      aspectRatio: "free",
      portrait: false,
      aspectRatioOptions: (hookOptions?.aspectRatioOptions as unknown[]) ?? [
        { value: "free", label: "Freeform" },
        { value: "1:1", label: "Square" },
      ],
      editingCorners: state.editingCorners,
      setEditingCorners: record("setEditingCorners", (on) =>
        change({ editingCorners: Boolean(on) }),
      ),
      setAspectRatio: record("setAspectRatio"),
      toggleOrientation: record("toggleOrientation"),
      rotate: record("rotate"),
      flip: record("flip"),
      setStraighten: record("setStraighten", (v) => change({ straighten: v as number })),
      setPerspective: record("setPerspective"),
      setCrop: record("setCrop"),
      resetCorners: record("resetCorners"),
      commit: record("commit"),
      cancel: record("cancel"),
      done: record("done", () => change({ tool: "adjust" })),
      reset: record("reset"),
    },
  };
}
fakeApi.rootRef = { current: null as HTMLDivElement | null };

const Context = React.createContext<ReturnType<typeof fakeApi> | null>(null);
mock.module(new URL("./engine.ts", import.meta.url).pathname, () => ({
  planEngine: async () =>
    plan.ok ? { ok: true, renderMode: "worker" } : { ok: false, message: plan.message },
  useImageEditorState: (options: Record<string, unknown>) => {
    hookOptions = options;
    React.useSyncExternalStore(
      (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      () => version,
    );
    return fakeApi();
  },
  ImageEditorProvider: ({
    editor,
    children,
  }: {
    editor: ReturnType<typeof fakeApi>;
    children: React.ReactNode;
  }) => <Context.Provider value={editor}>{children}</Context.Provider>,
  useImageEditor: () => React.useContext(Context),
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  aspectRatioOptions: [
    { value: "free", label: "Freeform" },
    { value: "original", label: "Original" },
    { value: "1:1", label: "Square" },
    { value: "3:2", label: "3:2" },
  ],
  fitRectInPolygon: (rect: unknown) => rect,
  rectInsidePolygon: () => true,
}));
const { default: ImageEditorDialog } = await import("./ImageEditorDialog.tsx");

const realFetch = globalThis.fetch;
const serveImage = () => {
  globalThis.fetch = (async () =>
    new Response("img", { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
};
const realWidth = window.innerWidth;

afterEach(async () => {
  globalThis.fetch = realFetch;
  await cleanup();
  calls = [];
  hookOptions = undefined;
  plan = { ok: true };
  Object.assign(state, {
    tool: "adjust",
    canUndo: false,
    canRedo: false,
    edited: false,
    editingCorners: false,
    straighten: 0,
    status: "ready",
  });
  Object.defineProperty(window, "innerWidth", { value: realWidth, configurable: true });
});

let openChanges: boolean[] = [];
const open = async (imageProps: Record<string, unknown>) => {
  openChanges = [];
  await mount(
    <ImageEditorDialog
      open
      onOpenChange={(next) => openChanges.push(next)}
      imageProps={imageProps}
    />,
  );
  // The load and the plan each resolve a turn later; settle them one after another.
  await [1, 2, 3, 4, 5].reduce((prev) => prev.then(settle), Promise.resolve());
  const root = document.querySelector<HTMLElement>("[data-emvb-image-editor]");
  if (!root) throw new Error("editor not rendered");
  return root;
};
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const click = async (sel: string) => {
  const el = q<HTMLButtonElement>(sel);
  if (!el) throw new Error(`no ${sel}`);
  el.click();
  await settle();
};

describe("image editor in photocn's layout (W-483)", () => {
  test("opens a library picture with photocn's arrangement: toolbar, canvas, sidebar", async () => {
    serveImage();
    const root = await open({ src: "/_emdash/api/media/file/shop.jpg", alt: "Shop front" });
    expect(root.dataset.emvbImageEditor).toBe("ready");
    expect(root.dataset.emvbRenderMode).toBe("worker");
    expect(root.dataset.layout).toBe("desktop");
    expect(hookOptions?.renderMode).toBe("worker");
    expect(hookOptions?.defaultTool).toBe("adjust");
    expect(q("[data-slot=editor-toolbar] [data-emvb-image-undo]")).not.toBeNull();
    expect(q("[data-slot=editor-sidebar] [data-slot=editor-toolbar]")).not.toBeNull();
    expect(
      q("[data-slot=editor-sidebar] [data-slot=image-editor-histogram]")?.textContent,
    ).toContain("38,400");
    expect(q("[data-emvb-image-editor-file]")?.textContent).toBe("shop.jpg640 × 480 px");
    expect(q("[data-emvb-image-canvas]")?.getAttribute("aria-label")).toBe("shop.jpg");
    expect(q<HTMLButtonElement>("[data-emvb-image-save]")?.disabled).toBe(true);
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("adjust");
  });

  test("the switcher shows every tool as a pressed toggle, and arrows move through it", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    const tools = [
      ...document.querySelectorAll<HTMLButtonElement>(
        "[data-slot=editor-sidebar] [data-emvb-image-tool]",
      ),
    ];
    expect(tools.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Adjust",
      "Crop",
      "Curves",
      "Effects",
      "Filters",
      "Blender",
      "Blur",
      "Metadata",
    ]);
    expect(tools[0]?.getAttribute("aria-pressed")).toBe("true");
    tools[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle();
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("compose");
    tools[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    await settle();
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("metadata");
  });

  test("undo, redo and reset follow the editor's history", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    expect(q<HTMLButtonElement>("[data-emvb-image-undo]")?.disabled).toBe(true);
    expect(q<HTMLButtonElement>("[data-emvb-image-reset]")?.disabled).toBe(true);
    change({ canUndo: true, edited: true });
    await settle();
    await click("[data-emvb-image-undo]");
    await click("[data-emvb-image-reset]");
    expect(calls.map((c) => c[0])).toEqual(["undo", "resetAll"]);
  });

  test("the crop panel drives photocn's geometry", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A", width: 1200, height: 800 });
    // "Fit this element" sits after Original in photocn's presets.
    expect(
      ((hookOptions?.aspectRatioOptions ?? []) as { value: string }[]).map((o) => o.value),
    ).toEqual(["free", "original", "3:2", "1:1"]);
    await click('[data-slot=editor-sidebar] [data-emvb-image-tool="compose"]');
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("compose");
    await click('[data-emvb-image-rotate="right"]');
    await click('[data-emvb-image-rotate="left"]');
    await click('[data-emvb-image-flip="horizontal"]');
    await click("[data-emvb-image-orientation]");
    const slider = q<HTMLInputElement>('[data-emvb-image-slider="straighten"]');
    if (!slider) throw new Error("no slider");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(slider, "2.5");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("pointerup", { bubbles: true }));
    await settle();
    expect(q(".emvb-ie-slider-value")?.textContent).toBe("+2.5°");
    await click(".emvb-ie-slider-value");
    await click("[data-emvb-image-corners]");
    await click("[data-emvb-image-crop-done]");
    expect(calls).toEqual([
      ["setTool", "compose"],
      ["rotate", 1],
      ["rotate", -1],
      ["flip", "horizontal"],
      ["toggleOrientation"],
      ["setStraighten", 2.5, { transient: true }],
      ["commit"],
      ["setStraighten", 0, { transient: true }],
      ["commit"],
      ["setEditingCorners", true],
      ["done"],
    ]);
    expect(q("[data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe("adjust");
  });

  test("Esc leaves the corner handles before it closes the editor", async () => {
    serveImage();
    await open({ src: "/a.jpg", alt: "A" });
    change({ tool: "compose", editingCorners: true });
    await settle();
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    q("[data-emvb-image-panel]")?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();
    expect(openChanges).not.toContain(false);
    expect(calls).toContainEqual(["setEditingCorners", false]);
  });

  test("a narrow editor uses the compact layout: tools at the bottom, the panel in a sheet", async () => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    serveImage();
    const root = await open({ src: "/a.jpg", alt: "A" });
    expect(root.dataset.layout).toBe("compact");
    expect(q("[data-emvb-image-sheet]")?.dataset.emvbImageSheet).toBe("closed");
    await click('.emvb-ie-compact > nav [data-emvb-image-tool="compose"]');
    expect(q("[data-emvb-image-sheet]")?.dataset.emvbImageSheet).toBe("open");
    expect(q("[data-emvb-image-sheet] [data-emvb-image-panel]")?.dataset.emvbImagePanel).toBe(
      "compose",
    );
    // Tapping the active tool again closes the sheet.
    await click('.emvb-ie-compact > nav [data-emvb-image-tool="compose"]');
    expect(q("[data-emvb-image-sheet]")?.dataset.emvbImageSheet).toBe("closed");
  });

  test("a picture on another website gets the upload-a-copy message, without photocn", async () => {
    await open({ src: "https://cdn.example.com/a.jpg", alt: "A" });
    expect(q("[data-emvb-image-editor]")?.dataset.emvbImageEditor).toBe("error");
    expect(q("[data-emvb-image-error]")?.textContent).toContain(
      "Upload a copy to the media library",
    );
    expect(q("[data-emvb-image-error] button")?.textContent).toBe("Back to the page");
    expect(hookOptions).toBeUndefined();
  });

  test("a browser without WebGL 2 is told so", async () => {
    serveImage();
    plan = { ok: false, message: "This browser can't edit images: it has no WebGL 2." };
    await open({ src: "/a.jpg", alt: "A" });
    expect(q("[data-emvb-image-error]")?.textContent).toContain("no WebGL 2");
    expect(hookOptions).toBeUndefined();
  });

  test("a picture photocn can't decode shows the error badge", async () => {
    serveImage();
    state.status = "error";
    const root = await open({ src: "/a.jpg", alt: "A" });
    expect(root.dataset.emvbImageEditor).toBe("error");
    expect(q(".emvb-ie-badge")?.textContent).toContain("Broken file");
  });
});
