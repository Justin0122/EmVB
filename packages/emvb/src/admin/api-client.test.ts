import { describe, expect, test } from "bun:test";
import { ApiError, requestJson, type Fetcher } from "./api.ts";
import { previewUrl, publishPage, savePage, type PageDraft } from "./content-api.ts";
import { listImages, uploadImage } from "./media-api.ts";
import { createThemePart, publishThemePart } from "./theme-api.ts";

type Call = { path: string; method: string; body: unknown };

function answering(response: () => Response, calls: Call[] = []): Fetcher {
  return async (path, init) => {
    calls.push({
      path,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body ?? null),
    });
    return response();
  };
}

const json =
  (status: number, body: unknown, statusText = "") =>
  () =>
    new Response(JSON.stringify(body), { status, statusText });
const text = (status: number, body: string, statusText: string) => () =>
  new Response(body, { status, statusText });

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  const { status, code, message } = error as ApiError;
  return { status, code, message };
}

describe("API error envelope", () => {
  const failures = [
    [
      "an error body",
      json(409, { error: { code: "SLUG_CONFLICT", message: "Taken" } }, "Conflict"),
      { status: 409, code: "SLUG_CONFLICT", message: "Taken" },
    ],
    [
      "a non-JSON body",
      text(502, "<html>bad gateway</html>", "Bad Gateway"),
      { status: 502, code: "HTTP_ERROR", message: "Bad Gateway" },
    ],
    [
      "an error without a code",
      json(500, { error: { message: "Boom" } }, "Server Error"),
      { status: 500, code: "HTTP_ERROR", message: "Boom" },
    ],
  ] as const;

  for (const [name, reply, expected] of failures) {
    test(`requestJson, listImages and uploadImage report ${name} the same way`, async () => {
      expect(await failure(requestJson(answering(reply), "/x"))).toEqual(expected);
      expect(await failure(listImages(answering(reply)))).toEqual(expected);
      expect(
        await failure(
          uploadImage(answering(reply), new File(["x"], "a.png", { type: "image/png" })),
        ),
      ).toEqual(expected);
    });
  }

  test("requestJson returns data; listImages keeps ready items; upload needs an item", async () => {
    expect(
      await requestJson<{ a: number }>(answering(json(200, { data: { a: 1 } })), "/x"),
    ).toEqual({
      a: 1,
    });
    const items = await listImages(
      answering(
        json(200, {
          data: {
            items: [{ id: "1", status: "ready" }, { id: "2", status: "pending" }, { id: "3" }],
          },
        }),
      ),
    );
    expect(items.map((i) => i.id)).toEqual(["1", "3"]);
    expect(
      await failure(
        uploadImage(answering(json(200, { data: {} }, "OK")), new File(["x"], "a.png")),
      ),
    ).toEqual({ status: 200, code: "HTTP_ERROR", message: "OK" });
  });
});

describe("publish", () => {
  for (const [name, publish, collection] of [
    ["publishPage", publishPage, "emvb_pages"],
    ["publishThemePart", publishThemePart, "emvb_theme_parts"],
  ] as const) {
    test(`${name} posts the revision and returns the new one with the slug`, async () => {
      const calls: Call[] = [];
      const reply = json(200, { data: { _rev: "r2", item: { id: "01 X", slug: "about" } } });
      expect(await publish(answering(reply, calls), "01 X", "r1")).toEqual({
        rev: "r2",
        slug: "about",
      });
      expect(
        await publish(
          answering(json(200, { data: { _rev: "r3", item: { id: "01 X" } } }), calls),
          "01 X",
          null,
        ),
      ).toEqual({ rev: "r3", slug: "" });
      expect(calls).toEqual([
        {
          path: `/_emdash/api/content/${collection}/01%20X/publish`,
          method: "POST",
          body: { _rev: "r1" },
        },
        { path: `/_emdash/api/content/${collection}/01%20X/publish`, method: "POST", body: {} },
      ]);
    });
  }
});

describe("createThemePart", () => {
  test("a part shown beside a page's content starts on an H2; content parts keep the H1 (W-179)", async () => {
    const calls: Call[] = [];
    const reply = json(200, { data: { item: { id: "01F" } } });
    const types = ["float", "header", "footer", "popup", "section", "loop_item"] as const;
    const owners = ["single_page", "single_post", "archive", "page_template"] as const;
    for (const partType of [...types, ...owners]) {
      // oxlint-disable-next-line no-await-in-loop
      await createThemePart(answering(reply, calls), { title: "Note", slug: "note", partType });
    }
    const levels = calls.map(
      (call) =>
        JSON.stringify(call.body).match(
          /"type":"heading","props":\{"text":"Note","level":(\d)/,
        )?.[1],
    );
    expect(levels.join("")).toBe("2222221111");
  });
});

describe("saving and publishing an entry of another collection (W-307)", () => {
  const draft: PageDraft = {
    title: "Opening",
    slug: "opening",
    canvasMode: "blank",
    seoTitle: "SEO title",
    seoDescription: "SEO description",
    layout: {
      schemaVersion: 12,
      root: { id: "root0001", type: "container", props: {}, children: [] },
    },
    entryHasTitle: true,
  };

  test("a save sends only emvb_layout, the title and the slug, to that collection", async () => {
    const calls: Call[] = [];
    await savePage(
      answering(json(200, { data: { _rev: "r2" } }), calls),
      "01N",
      draft,
      "r1",
      "news",
    );
    expect(calls).toEqual([
      {
        path: "/_emdash/api/content/news/01N",
        method: "PUT",
        body: {
          data: { emvb_layout: draft.layout, title: "Opening" },
          slug: "opening",
          _rev: "r1",
        },
      },
    ]);
  });

  test("an entry without a title field isn't sent one", async () => {
    const calls: Call[] = [];
    await savePage(
      answering(json(200, { data: { _rev: "r2" } }), calls),
      "01P",
      { ...draft, entryHasTitle: false },
      null,
      "partners",
    );
    expect(calls[0]?.body).toEqual({ data: { emvb_layout: draft.layout }, slug: "opening" });
  });

  test("a Visual page save is unchanged", async () => {
    const calls: Call[] = [];
    await savePage(answering(json(200, { data: { _rev: "r2" } }), calls), "01V", draft, null);
    expect(calls[0]?.path).toBe("/_emdash/api/content/emvb_pages/01V");
    expect(calls[0]?.body).toMatchObject({
      data: { title: "Opening", layout: draft.layout, canvas_mode: "blank" },
      seo: { title: "SEO title" },
    });
  });

  test("publish and preview go to the entry's collection", async () => {
    const calls: Call[] = [];
    await publishPage(
      answering(json(200, { data: { _rev: "r2", item: {} } }), calls),
      "01N",
      null,
      "news",
    );
    await previewUrl(answering(json(200, { data: { url: "/x" } }), calls), "01N", "news");
    expect(calls.map((c) => c.path)).toEqual([
      "/_emdash/api/content/news/01N/publish",
      "/_emdash/api/content/news/01N/preview-url",
    ]);
  });
});
