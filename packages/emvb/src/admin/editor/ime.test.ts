import { describe, expect, test } from "bun:test";
import { isCancelEscape, isCommitEnter } from "./ime.ts";

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

describe("isCancelEscape (W-681)", () => {
  test("a plain Escape cancels; one that drops an IME composition does not", () => {
    expect(isCancelEscape(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(true);
    expect(isCancelEscape(new KeyboardEvent("keydown", { key: "Escape", isComposing: true }))).toBe(
      false,
    );
    expect(isCancelEscape({ key: "Escape", keyCode: 229 })).toBe(false);
    expect(isCancelEscape({ key: "Escape", nativeEvent: { isComposing: true } })).toBe(false);
    expect(isCancelEscape({ key: "Enter" })).toBe(false);
  });
});
