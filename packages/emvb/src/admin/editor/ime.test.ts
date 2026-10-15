import { describe, expect, test } from "bun:test";
import { isCommitEnter } from "./ime.ts";

describe("isCommitEnter (W-606)", () => {
  test("a plain Enter commits; an Enter that ends an IME composition does not", () => {
    expect(isCommitEnter(new KeyboardEvent("keydown", { key: "Enter" }))).toBe(true);
    expect(isCommitEnter(new KeyboardEvent("keydown", { key: "Enter", isComposing: true }))).toBe(
      false,
    );
    expect(isCommitEnter({ key: "Enter", keyCode: 229 })).toBe(false);
    expect(isCommitEnter({ key: "Enter", nativeEvent: { isComposing: true } })).toBe(false);
    expect(isCommitEnter({ key: "a" })).toBe(false);
  });
});
