import { describe, expect, test } from "bun:test";
import { fuzzyScore } from "./palette.ts";

describe("palette search ignores accents (W-420)", () => {
  test("plain letters find accented text and the other way round", () => {
    expect(fuzzyScore("cafe", "Menu du café")).not.toBeNull();
    expect(fuzzyScore("café", "Cafe hours")).not.toBeNull();
    expect(fuzzyScore("strasse", "Ünïcode Straße")).not.toBeNull();
    expect(fuzzyScore("unicode", "Ünïcode Straße")).not.toBeNull();
  });
  test("unrelated text still doesn't match", () => {
    expect(fuzzyScore("xyz", "Menu du café")).toBeNull();
  });
});
