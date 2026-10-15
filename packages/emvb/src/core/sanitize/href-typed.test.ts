import { describe, expect, test } from "bun:test";
import { sanitizeHref } from "./href.ts";

describe("links as people type them", () => {
  test("www.… links go to that site (W-427)", () => {
    expect(sanitizeHref("www.example.com/about")).toBe("https://www.example.com/about");
    expect(sanitizeHref(" WWW.example.com ")).toBe("https://WWW.example.com");
    expect(sanitizeHref("/www.notes")).toBe("/www.notes");
  });
  test("spaces in an email link are encoded (W-428)", () => {
    expect(sanitizeHref("mailto:me@x.com?subject=Hi there")).toBe(
      "mailto:me@x.com?subject=Hi%20there",
    );
    expect(sanitizeHref("https://x.com/my file.pdf")).toBeUndefined();
    expect(sanitizeHref("mailto:a@x.com?subject=a\tb")).toBeUndefined();
    expect(sanitizeHref("/a b")).toBe("/a b");
  });
  test("W-683: a page link in another script, like a Unicode page slug, is kept", () => {
    expect(sanitizeHref("über-uns")).toBe("über-uns");
    expect(sanitizeHref("контакты#форма")).toBe("контакты#форма");
    expect(sanitizeHref("お問い合わせ")).toBe("お問い合わせ");
    expect(sanitizeHref("\u202Eevil")).toBeUndefined();
  });
});
