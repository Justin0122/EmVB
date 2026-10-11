import { describe, expect, test } from "bun:test";
import { jsonLdScript } from "../../site/src/json-ld";

describe("JSON-LD script (W-379)", () => {
  test("a less-than cannot close the script tag", () => {
    const text = jsonLdScript({ html: "</script><script>alert(1)</script>" });
    expect(text.includes("<")).toBe(false);
    expect(text.includes("\\u003c/script>")).toBe(true);
  });
});
