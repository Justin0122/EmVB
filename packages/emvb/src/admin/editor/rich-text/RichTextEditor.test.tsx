import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, rerender, settle } from "../../../../test/dom/mount.ts";
import { sameRichText } from "./extensions.ts";
import { RichTextEditor } from "./RichTextEditor.tsx";

afterEach(cleanup);

const button = (host: HTMLElement, label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

/** Puts the caret in the editor with all of its text selected, as a user would. */
async function selectAll(host: HTMLElement) {
  const content = host.querySelector<HTMLElement>(".ProseMirror");
  if (!content) throw new Error("no editor");
  await act(async () => {
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await settle();
}

async function editor(value: string) {
  const sent: string[] = [];
  const host = await mount(
    <RichTextEditor label="Tekst" value={value} onChange={(html) => sent.push(html)} />,
  );
  await settle();
  return { host, sent };
}

describe("the rich text editor (W-323)", () => {
  test("shows the content as formatted text, not HTML", async () => {
    const { host } = await editor("<h2>Wat wij doen</h2><p>Wij <strong>bouwen</strong>.</p>");
    const content = host.querySelector(".ProseMirror");
    expect(content?.querySelector("h2")?.textContent).toBe("Wat wij doen");
    expect(content?.querySelector("strong")?.textContent).toBe("bouwen");
    expect(host.querySelector("textarea")).toBeNull();
  });

  test("the style menu turns the paragraph into a heading", async () => {
    const { host, sent } = await editor("<p>Titel</p>");
    await selectAll(host);
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Text style"]');
    await act(async () => {
      if (!select) return;
      select.value = "h2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(sent.at(-1)).toBe("<h2>Titel</h2>");
  });

  test("Bold marks the selection, and the button shows it", async () => {
    const { host, sent } = await editor("<p>Vet</p>");
    await selectAll(host);
    await act(async () => button(host, "Bold")?.click());
    expect(sent.at(-1)).toBe("<p><strong>Vet</strong></p>");
    expect(button(host, "Bold")?.getAttribute("aria-pressed")).toBe("true");
  });

  test("tables, images and links survive the editor", async () => {
    const { host } = await editor(
      '<p><a href="/contact">Contact</a> <img src="/a.png" alt="A"></p><table><tbody><tr><th>Naam</th></tr><tr><td>Durma</td></tr></tbody></table>',
    );
    const content = host.querySelector(".ProseMirror");
    expect(content?.querySelector('a[href="/contact"]')).not.toBeNull();
    expect(content?.querySelector('img[src="/a.png"]')).not.toBeNull();
    expect(content?.querySelector("th")?.textContent).toBe("Naam");
    expect(content?.querySelector("td")?.textContent).toBe("Durma");
  });

  test("HTML shows the source, and edits there go straight through", async () => {
    const { host, sent } = await editor("<p>Hallo</p>");
    await act(async () => button(host, "HTML")?.click());
    const source = host.querySelector<HTMLTextAreaElement>("textarea");
    expect(source?.value).toBe("<p>Hallo</p>");
    await act(async () => {
      if (!source) return;
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      set?.call(source, "<p>Hoi</p>");
      source.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(sent.at(-1)).toBe("<p>Hoi</p>");
  });

  test("a value changed elsewhere replaces the content", async () => {
    const { host } = await editor("<p>Een</p>");
    await rerender(<RichTextEditor label="Tekst" value="<p>Twee</p>" onChange={() => {}} />);
    await settle();
    expect(host.querySelector(".ProseMirror")?.textContent).toBe("Twee");
  });
});

describe("comparing rich text (W-323)", () => {
  test("Tiptap's own markup for the same content isn't a change", () => {
    expect(
      sameRichText(
        "<table><tbody><tr><td>x</td></tr></tbody></table>",
        '<table style="min-width: 25px"><colgroup><col></colgroup><tbody><tr><td colspan="1" rowspan="1"><p>x</p></td></tr></tbody></table>',
      ),
    ).toBe(true);
    expect(sameRichText("<p>a</p>", "<p>b</p>")).toBe(false);
  });
});
