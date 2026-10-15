import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../../test/dom/mount.ts";
import type { Fetcher } from "../../../api.ts";
import { MediaPicker } from "./MediaPicker.tsx";

afterEach(cleanup);

// W-091: the image source control was only reached through two e2e tests (upload, pick); the
// URL checks, library errors and empty state weren't unit-tested.

const image = (props: Record<string, unknown>) =>
  ({ id: "img00001", type: "image", props }) as LayoutNode;

async function picker(node: LayoutNode, respond: () => Response) {
  const sent: LayoutNode[] = [];
  const paths: string[] = [];
  const fetcher: Fetcher = async (path) => {
    paths.push(path);
    return respond();
  };
  const host = await mount(
    <MediaPicker node={node} fetcher={fetcher} onChange={(next) => sent.push(next)} />,
  );
  const url = () => host.querySelector<HTMLInputElement>("[data-emvb-media-url]");
  const typeUrl = async (text: string) => {
    const input = url();
    if (!input) throw new Error("no URL field");
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
  };
  /** Focus the field, optionally type, then leave it (blur), as tabbing through does. */
  const leaveUrl = async (text?: string) => {
    const input = url();
    if (!input) throw new Error("no URL field");
    await act(async () => {
      input.focus();
      if (text !== undefined) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
          input,
          text,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await act(async () => input.blur());
  };
  const openLibrary = async () => {
    await act(async () => host.querySelector<HTMLElement>("[data-emvb-media-library]")?.click());
    await settle();
  };
  const text = () => host.textContent ?? "";
  return { host, sent, paths, typeUrl, leaveUrl, openLibrary, text };
}

const ok = (items: unknown[]) => () => Response.json({ data: { items } });

describe("image source URL (W-091)", () => {
  test("an empty URL asks for a source and changes nothing", async () => {
    const view = await picker(image({ src: "", alt: "A" }), ok([]));
    await view.typeUrl("   ");
    expect(view.text()).toContain("Choose a library image, upload a file, or enter a URL.");
    expect(view.sent).toEqual([]);
  });

  test("an unsafe URL is refused with the URL hint", async () => {
    const view = await picker(image({ src: "", alt: "A" }), ok([]));
    await view.typeUrl("javascript:alert(1)");
    expect(view.text()).toContain("Use a full URL such as https://example.com/photo.jpg");
    expect(view.sent).toEqual([]);
  });

  test("a pasted URL is trimmed, replaces the source and drops the library id", async () => {
    const view = await picker(image({ src: "/old.png", alt: "A", mediaId: "m1" }), ok([]));
    await view.typeUrl("  https://example.com/new.jpg ");
    expect(view.sent.map((n) => n.props)).toEqual([
      { src: "https://example.com/new.jpg", alt: "A" },
    ]);
  });
});

describe("leaving the URL field (W-092)", () => {
  test("tabbing through an unchanged URL keeps the library image and changes nothing", async () => {
    const view = await picker(image({ src: "/media/cat.png", alt: "A", mediaId: "m1" }), ok([]));
    await view.leaveUrl();
    expect(view.sent).toEqual([]);
    expect(view.text()).not.toContain("Use a full URL");
  });

  test("tabbing through the empty field of an image without a source shows no error", async () => {
    const view = await picker(image({ src: "", alt: "A" }), ok([]));
    await view.leaveUrl();
    expect(view.sent).toEqual([]);
    expect(view.text()).not.toContain("Choose a library image, upload a file, or enter a URL.");
  });

  test("the same URL with spaces around it, or Enter on it, is not a change", async () => {
    const view = await picker(image({ src: "/media/cat.png", alt: "A", mediaId: "m1" }), ok([]));
    await view.leaveUrl("  /media/cat.png ");
    await view.typeUrl("/media/cat.png");
    expect(view.sent).toEqual([]);
  });

  test("leaving after a real change commits it once", async () => {
    const view = await picker(image({ src: "/media/cat.png", alt: "A", mediaId: "m1" }), ok([]));
    await view.leaveUrl("https://example.com/dog.jpg");
    expect(view.sent.map((n) => n.props)).toEqual([
      { src: "https://example.com/dog.jpg", alt: "A" },
    ]);
  });

  test("going back to the saved URL clears an earlier error", async () => {
    const view = await picker(image({ src: "/media/cat.png", alt: "A" }), ok([]));
    await view.typeUrl("javascript:alert(1)");
    expect(view.text()).toContain("Use a full URL");
    await view.leaveUrl("/media/cat.png");
    expect(view.text()).not.toContain("Use a full URL");
    expect(view.sent).toEqual([]);
  });
});

// The library is a dialog portaled over the editor (to the body here), so it is found in the document.
describe("media library (W-091)", () => {
  test("opening it asks for up to 40 images and lists them", async () => {
    const view = await picker(
      image({ src: "", alt: "Image" }),
      ok([{ id: "m2", filename: "cat.png", url: "/media/cat.png", status: "ready" }]),
    );
    await view.openLibrary();
    const images = view.paths.filter((path) => !path.includes("/folders"));
    expect(images).toHaveLength(1);
    expect(images[0]).toContain("limit=40");
    expect(document.querySelector('[data-emvb-media-id="m2"]')?.textContent).toBe("cat.png");
  });

  test("an empty library says so", async () => {
    const view = await picker(image({ src: "", alt: "Image" }), ok([]));
    await view.openLibrary();
    expect(document.body.textContent ?? "").toContain("No images yet. Upload one to get started.");
  });

  test("a library that fails to load shows its error", async () => {
    const view = await picker(image({ src: "", alt: "Image" }), () =>
      Response.json(
        { error: { code: "FORBIDDEN", message: "Not allowed here." } },
        { status: 403 },
      ),
    );
    await view.openLibrary();
    expect(document.body.textContent ?? "").toContain("Not allowed here.");
  });

  test("Close hides the library", async () => {
    const view = await picker(image({ src: "", alt: "Image" }), ok([]));
    await view.openLibrary();
    const close = [...document.querySelectorAll("button")].find((b) => b.textContent === "Close");
    await act(async () => close?.click());
    expect(document.querySelector("[data-emvb-media-dialog]")?.outerHTML ?? null).toBeNull();
  });
});

type Sent = { path: string; method: string; body: unknown };

/** A library with folders: answers the folder list, image pages, moves, new folders, uploads. */
async function library(node: LayoutNode, folders = [{ id: "f1", name: "Machines" }]) {
  const sent: Sent[] = [];
  const picked: LayoutNode[] = [];
  const fetcher: Fetcher = async (path, init) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    sent.push({ path, method, body });
    if (path.startsWith("/_emdash/api/media/folders")) {
      if (method === "POST")
        return Response.json({ data: { item: { id: "f2", name: body.name } } });
      return Response.json({ data: { items: folders } });
    }
    if (method === "PUT") return Response.json({ data: { item: {} } });
    if (method === "POST") {
      return Response.json({
        data: { item: { id: "up", filename: "new.png", url: "/media/new.png", status: "ready" } },
      });
    }
    const cursor = new URL(path, "http://x").searchParams.get("cursor");
    return Response.json({
      data: cursor
        ? { items: [{ id: "m3", filename: "cow.png", url: "/media/cow.png", status: "ready" }] }
        : {
            items: [
              {
                id: "m1",
                filename: "dog.png",
                url: "/media/dog.png",
                status: "ready",
                width: 800,
                height: 600,
                size: 20480,
                folderId: null,
              },
              {
                id: "m2",
                filename: "cat.png",
                url: "/media/cat.png",
                status: "ready",
                folderId: "f1",
              },
            ],
            nextCursor: "next-1",
            totalCount: 3,
          },
    });
  };
  const host = await mount(
    <MediaPicker node={node} fetcher={fetcher} onChange={(next) => picked.push(next)} />,
  );
  await act(async () => host.querySelector<HTMLElement>("[data-emvb-media-library]")?.click());
  await settle();
  const lists = () => sent.filter((s) => s.method === "GET" && !s.path.includes("/folders"));
  const click = async (selector: string) => {
    await act(async () => document.querySelector<HTMLElement>(selector)?.click());
    await settle();
  };
  return { sent, picked, lists, click };
}

const watched: Array<(entries: { isIntersecting: boolean }[]) => void> = [];
class StubObserver {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    watched.push(callback);
  }
  observe() {}
  disconnect() {}
}

describe("media library dialog", () => {
  beforeEach(() => {
    watched.length = 0;
    localStorage.clear();
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = StubObserver;
  });

  test("marks the image in use and loads the next page when the end of the grid shows", async () => {
    const view = await library(image({ src: "/media/cat.png", alt: "A", mediaId: "m2" }));
    expect(document.querySelector('[data-emvb-media-id="m2"]')?.hasAttribute("data-current")).toBe(
      true,
    );
    expect(document.querySelector('[data-emvb-media-id="m1"]')?.hasAttribute("data-current")).toBe(
      false,
    );
    expect(document.querySelector('[data-emvb-media-id="m1"]')?.textContent).toBe(
      "dog.png800 × 600 · 20 KB",
    );
    expect(document.body.textContent).toContain("2 of 3 images");
    expect(document.querySelector("[data-emvb-media-more]")).not.toBeNull();

    await act(async () => watched.at(-1)?.([{ isIntersecting: true }]));
    await settle();
    expect(view.lists().at(-1)?.path).toContain("cursor=next-1");
    expect(document.querySelector('[data-emvb-media-id="m3"]')).not.toBeNull();
    expect(document.querySelector("[data-emvb-media-more]")).toBeNull();
  });

  test("a search asks again from the first page", async () => {
    const view = await library(image({ src: "", alt: "Image" }));
    const search = document.querySelector<HTMLInputElement>("[data-emvb-media-search]");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        search,
        "cat",
      );
      search?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    await settle();
    expect(view.lists().at(-1)?.path).toContain("q=cat");
    expect(view.lists().at(-1)?.path).not.toContain("cursor=");
  });

  test("lists the folders; opening one filters by it and is remembered", async () => {
    const view = await library(image({ src: "", alt: "Image" }));
    const names = [...document.querySelectorAll("[data-emvb-media-folder]")].map(
      (b) => b.textContent,
    );
    expect(names).toEqual(["All images", "Main library", "Machines"]);
    expect(view.lists()[0]?.path).not.toContain("folderId");

    await view.click('[data-emvb-media-folder="f1"]');
    expect(view.lists().at(-1)?.path).toContain("folderId=f1");
    await view.click('[data-emvb-media-folder="unfiled"]');
    expect(view.lists().at(-1)?.path).toContain("folderId=unfiled");
    expect(localStorage.getItem("emvb-media-scope")).toBe("unfiled");
  });

  test("a remembered folder opens again; one that is gone falls back to all images", async () => {
    localStorage.setItem("emvb-media-scope", "f1");
    const view = await library(image({ src: "", alt: "Image" }));
    expect(view.lists()[0]?.path).toContain("folderId=f1");
    await cleanup();

    localStorage.setItem("emvb-media-scope", "gone");
    const again = await library(image({ src: "", alt: "Image" }));
    expect(again.lists().at(-1)?.path).not.toContain("folderId");
    expect(
      document.querySelector('[data-emvb-media-folder="all"]')?.getAttribute("aria-current"),
    ).toBe("true");
  });

  test("Move to files an image in a folder; in that folder's view it leaves the grid", async () => {
    localStorage.setItem("emvb-media-scope", "unfiled");
    const view = await library(image({ src: "", alt: "Image" }));
    await view.click('[data-emvb-media-move="m1"]');
    expect(
      document.querySelector('[data-emvb-media-move-to="unfiled"]')?.hasAttribute("disabled"),
    ).toBe(true);
    await view.click('[data-emvb-media-move-to="f1"]');
    const put = view.sent.find((s) => s.method === "PUT");
    expect(put).toEqual({ path: "/_emdash/api/media/m1", method: "PUT", body: { folderId: "f1" } });
    expect(document.querySelector('[data-emvb-media-id="m1"]')).toBeNull();
    expect(document.body.textContent).toContain("Moved “dog.png” to Machines.");
  });

  test("dragging an image onto a folder moves it", async () => {
    const view = await library(image({ src: "", alt: "Image" }));
    const data = new Map<string, string>();
    const transfer = {
      types: ["application/x-emvb-media"],
      files: [],
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
      dropEffect: "",
      effectAllowed: "",
    };
    const fire = (selector: string, type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: transfer });
      document.querySelector(selector)?.dispatchEvent(event);
    };
    await act(async () => fire('[data-emvb-media-id="m2"]', "dragstart"));
    await act(async () => fire('[data-emvb-media-folder="unfiled"]', "dragover"));
    await act(async () => fire('[data-emvb-media-folder="unfiled"]', "drop"));
    await settle();
    expect(view.sent.find((s) => s.method === "PUT")?.body).toEqual({ folderId: null });
    // In "All images" a moved image stays.
    expect(document.querySelector('[data-emvb-media-id="m2"]')).not.toBeNull();
  });

  test("New folder makes one and opens it; uploads there go into it", async () => {
    const view = await library(image({ src: "", alt: "Image" }));
    await view.click("[data-emvb-media-new-folder]");
    const name = document.querySelector<HTMLInputElement>("[data-emvb-media-folder-name]");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        name,
        " Hal ",
      );
      name?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      name?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    expect(view.sent.find((s) => s.method === "POST")?.body).toEqual({ name: "Hal" });
    expect(
      document.querySelector('[data-emvb-media-folder="f2"]')?.getAttribute("aria-current"),
    ).toBe("true");
    expect(view.lists().at(-1)?.path).toContain("folderId=f2");

    const input = document.querySelector<HTMLInputElement>(
      '[data-emvb-media-dialog] input[type="file"]',
    );
    // happy-dom's Image never loads; this one says it can't, so the upload goes without a size.
    const RealImage = globalThis.Image;
    globalThis.Image = class extends EventTarget {
      set src(_: string) {
        queueMicrotask(() => this.dispatchEvent(new Event("error")));
      }
    } as unknown as typeof Image;
    const file = new File([new Uint8Array([1])], "new.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));
    await settle();
    const upload = view.sent.findLast((s) => s.method === "POST");
    expect(upload?.body instanceof FormData && upload.body.get("folderId")).toBe("f2");
    expect(view.picked.map((n) => n.props.src)).toEqual(["/media/new.png"]);
    globalThis.Image = RealImage;
  });

  test("picking an image applies it and closes the dialog; Escape closes it too", async () => {
    const view = await library(image({ src: "", alt: "Image" }));
    await view.click('[data-emvb-media-id="m1"]');
    expect(view.picked.map((n) => n.props.src)).toEqual(["/media/dog.png"]);
    expect(document.querySelector("[data-emvb-media-dialog]")).toBeNull();
  });

  test("Escape closes the dialog", async () => {
    await library(image({ src: "", alt: "Image" }));
    await act(async () => {
      document
        .querySelector("[data-emvb-media-dialog]")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector("[data-emvb-media-dialog]")).toBeNull();
  });
});

describe("a new picture drops the old extra sizes (W-422)", () => {
  test("a pasted URL for a different image removes sources", async () => {
    const view = await picker(
      image({ src: "/old.png", alt: "A", sources: [{ src: "/old-480.png", width: 480 }] }),
      ok([]),
    );
    await view.typeUrl("https://example.com/new.jpg");
    expect(view.sent.map((n) => n.props)).toEqual([
      { src: "https://example.com/new.jpg", alt: "A" },
    ]);
  });
});

describe("Reset to original when the original is gone (W-492)", () => {
  const edited = async () => {
    const { buildImageEdit } = await import("../../../image-editor/save.ts");
    const built = buildImageEdit({
      imageProps: { src: "/_emdash/api/media/file/orig.jpg", mediaId: "01ORIGINAL" },
      recipe: { version: 1, lights: { exposure: 0.2 } },
      output: { format: "webp", quality: 0.85, maxSide: 2560, stripGps: true },
    });
    if (!built.ok) throw new Error(built.message);
    return image({
      src: "/_emdash/api/media/file/copy.webp",
      mediaId: "01COPY",
      alt: "A",
      edit: built.edit,
    });
  };
  const mountEdited = async (respond: () => Response) => {
    const sent: LayoutNode[] = [];
    const fetcher: Fetcher = async () => respond();
    const host = await mount(
      <MediaPicker
        node={await edited()}
        fetcher={fetcher}
        editable
        onChange={(next) => sent.push(next)}
      />,
    );
    await act(async () =>
      host.querySelector<HTMLElement>("[data-emvb-image-reset-original]")?.click(),
    );
    await settle();
    return { sent, text: host.textContent ?? "" };
  };

  test("a deleted original keeps the edited copy and says why", async () => {
    const view = await mountEdited(() => new Response("{}", { status: 404 }));
    expect(view.sent).toEqual([]);
    expect(view.text).toContain("The original picture was deleted from the media library");
  });

  test("a failed lookup is an error, not a reset to a guessed URL", async () => {
    const view = await mountEdited(() =>
      Response.json({ error: { message: "Server down" } }, { status: 500 }),
    );
    expect(view.sent).toEqual([]);
    expect(view.text).toContain("Couldn't reach the media library to find the original.");
  });
});
