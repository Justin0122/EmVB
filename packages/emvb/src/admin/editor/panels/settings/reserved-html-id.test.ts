import { describe, expect, test } from "bun:test";
import { htmlIdError } from "./advanced-rules.ts";

describe("emvb- ids are reserved (W-418)", () => {
  test("an id EmVB generates can't be chosen", () => {
    expect(htmlIdError("emvb-h-head0002", null, "text0001")).toContain("reserved");
    expect(htmlIdError("EMVB-field-x", null, "text0001")).toContain("reserved");
  });
  test("other ids are fine", () => {
    expect(htmlIdError("pricing", null, "text0001")).toBeNull();
    expect(htmlIdError("my-emvb-box", null, "text0001")).toBeNull();
  });
});
