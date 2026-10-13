import { describe, expect, test } from "bun:test";
import { hrefError } from "./link-rules.ts";

describe("link field messages (W-429)", () => {
  test("usable links have no error", () => {
    expect(hrefError("https://x.com/a")).toBeNull();
    expect(hrefError("/pricing")).toBeNull();
  });
  test("a full URL with a space says so", () => {
    expect(hrefError("https://x.com/my page")).toBe(
      "Links can't contain spaces. Replace each space with %20.",
    );
  });
  test("another scheme names the allowed ones", () => {
    expect(hrefError("ftp://x.com/a")).toContain("Only web");
    expect(hrefError("javascript:alert(1)")).toContain("Only web");
  });
  test("anything else keeps the field's own message", () => {
    expect(hrefError("//evil.com", "Custom.")).toBe("Custom.");
  });
});
