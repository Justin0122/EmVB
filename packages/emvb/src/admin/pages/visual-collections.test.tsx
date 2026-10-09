import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { Fetcher } from "../api.ts";
import { VisualCollections } from "./VisualCollections.tsx";
import { cleanup, mount as mountTree, settle } from "../../../test/dom/mount.ts";

let host: HTMLElement;
afterEach(cleanup);

type Call = { path: string; method: string; body: unknown };

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/**
 * A stand-in EmDash: `news` already has the Visual layout field, `partners` doesn't, `pages`
 * has a plain `layout` json field (not EmVB's), and EmVB's own and hidden collections are listed.
 */
function site(calls: Call[], visualPartners = { value: false }): Fetcher {
  return async (path, init) => {
    const method = init?.method ?? "GET";
    calls.push({
      path,
      method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    if (path === "/_emdash/api/schema/collections") {
      return ok({
        items: [
          { slug: "emvb_pages", label: "Visual pages", hidden: true },
          { slug: "news", label: "Nieuws", labelSingular: "Nieuwsbericht" },
          { slug: "partners", label: "Partners" },
          { slug: "pages", label: "Pages" },
          { slug: "secret", label: "Secret", hidden: true },
        ],
      });
    }
    if (path.startsWith("/_emdash/api/schema/collections/news?")) {
      return ok({
        item: { slug: "news", fields: [{ slug: "emvb_layout", widget: "emvb:layout" }] },
      });
    }
    if (path.startsWith("/_emdash/api/schema/collections/partners?")) {
      return ok({
        item: {
          slug: "partners",
          fields: visualPartners.value ? [{ slug: "emvb_layout", widget: "emvb:layout" }] : [],
        },
      });
    }
    if (path.startsWith("/_emdash/api/schema/collections/pages?")) {
      return ok({ item: { slug: "pages", fields: [{ slug: "layout", widget: null }] } });
    }
    if (path === "/_emdash/api/schema/collections/partners/fields" && method === "POST") {
      visualPartners.value = true;
      return ok({ item: {} });
    }
    if (path.startsWith("/_emdash/api/content/news?")) {
      return ok({
        items: [
          {
            id: "01N",
            slug: "opening",
            status: "published",
            updatedAt: "",
            data: { title: "Opening" },
          },
        ],
      });
    }
    if (path.startsWith("/_emdash/api/content/partners?")) {
      return ok({
        items: [
          { id: "01P", slug: "acme", status: "draft", updatedAt: "", data: { name: "Acme" } },
        ],
      });
    }
    return new Response("{}", { status: 404 });
  };
}

async function mount(fetcher: Fetcher) {
  host = await mountTree(<VisualCollections fetcher={fetcher} />);
  await settle();
  await settle();
}

describe("visual collections on the Visual pages page (W-307)", () => {
  test("lists each visual collection's entries with editor links, and offers the others", async () => {
    await mount(site([]));
    const news = host.querySelector('[data-emvb-collection-list="news"]');
    expect(news?.querySelector("h2")?.textContent).toBe("Nieuws");
    expect(news?.querySelector("a")?.getAttribute("href")).toBe(
      "/_emdash/admin/plugins/emvb/editor?entry=01N&collection=news",
    );
    const offers = [...host.querySelectorAll("[data-emvb-offer]")].map((li) =>
      li.getAttribute("data-emvb-offer"),
    );
    // EmVB's own and hidden collections are never offered; a plain `layout` field isn't EmVB's.
    expect(offers).toEqual(["partners", "pages"]);
  });

  test("Edit visually adds the Visual layout field and lists the collection's entries", async () => {
    const calls: Call[] = [];
    await mount(site(calls));
    const button = host.querySelector('[data-emvb-offer="partners"] button') as HTMLButtonElement;
    await act(async () => button.click());
    await settle();
    await settle();
    expect(calls.find((c) => c.method === "POST")).toEqual({
      path: "/_emdash/api/schema/collections/partners/fields",
      method: "POST",
      body: {
        slug: "emvb_layout",
        label: "Visual layout",
        type: "json",
        widget: "emvb:layout",
        validation: null,
      },
    });
    const partners = host.querySelector('[data-emvb-collection-list="partners"]');
    // An entry without a title is listed by its name field.
    expect(partners?.querySelector("a")?.textContent).toBe("Acme");
    expect(host.querySelector('[data-emvb-offer="partners"]')).toBeNull();
  });
});
