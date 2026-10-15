import { afterEach, describe, expect, test } from "bun:test";
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
    expect(view.paths).toHaveLength(1);
    expect(view.paths[0]).toContain("limit=40");
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

describe("media library dialog", () => {
  test("marks the image in use, searches by name and pages on with the cursor", async () => {
    const view = await picker(image({ src: "/media/cat.png", alt: "A", mediaId: "m2" }), () =>
      Response.json({
        data: {
          items: [
            {
              id: "m1",
              filename: "dog.png",
              url: "/media/dog.png",
              status: "ready",
              width: 800,
              height: 600,
              size: 20480,
            },
            { id: "m2", filename: "cat.png", url: "/media/cat.png", status: "ready" },
          ],
          nextCursor: "next-1",
          totalCount: 3,
        },
      }),
    );
    await view.openLibrary();
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

    await act(async () => document.querySelector<HTMLElement>("[data-emvb-media-more]")?.click());
    await settle();
    expect(view.paths.at(-1)).toContain("cursor=next-1");

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
    expect(view.paths.at(-1)).toContain("q=cat");
    expect(view.paths.at(-1)).not.toContain("cursor=");
  });

  test("picking an image applies it and closes the dialog; Escape closes it too", async () => {
    const view = await picker(
      image({ src: "", alt: "Image" }),
      ok([{ id: "m2", filename: "cat.png", url: "/media/cat.png", status: "ready" }]),
    );
    await view.openLibrary();
    await act(async () =>
      document.querySelector<HTMLElement>('[data-emvb-media-id="m2"]')?.click(),
    );
    expect(view.sent.map((n) => n.props.src)).toEqual(["/media/cat.png"]);
    expect(document.querySelector("[data-emvb-media-dialog]")).toBeNull();

    await view.openLibrary();
    await act(async () => {
      document
        .querySelector("[data-emvb-media-dialog]")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector("[data-emvb-media-dialog]")).toBeNull();
  });
});
