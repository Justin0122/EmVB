import { describe, expect, test } from "bun:test";
import { sanitizeHref } from "./href.ts";

describe("phone links with spaces (W-417)", () => {
  test("spaces are dropped instead of refusing the link", () => {
    expect(sanitizeHref("tel:+1 555 010 0199")).toBe("tel:+15550100199");
    expect(sanitizeHref(" TEL:+44 20 7946 0000")).toBe("TEL:+442079460000");
  });
  test("other links with spaces are still refused", () => {
    expect(sanitizeHref("javascript: alert(1)")).toBeUndefined();
  });
});
