import { describe, expect, test } from "bun:test";
import { displayName, moveTool, shortcutFor, sizeLabel } from "./tools.ts";

const key = (
  k: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("image editor keyboard (W-482)", () => {
  test("rail arrows wrap, Home and End jump", () => {
    expect(moveTool("ArrowDown", 4, 5)).toBe(0);
    expect(moveTool("ArrowUp", 0, 5)).toBe(4);
    expect(moveTool("End", 1, 5)).toBe(4);
    expect(moveTool("Home", 3, 5)).toBe(0);
    expect(moveTool("a", 3, 5)).toBeUndefined();
  });
  test("Ctrl/Cmd+Z undoes; with Shift, or Ctrl+Y, redoes", () => {
    expect(shortcutFor(key("z", { ctrlKey: true }))).toBe("undo");
    expect(shortcutFor(key("Z", { metaKey: true, shiftKey: true }))).toBe("redo");
    expect(shortcutFor(key("y", { ctrlKey: true }))).toBe("redo");
    expect(shortcutFor(key("z"))).toBeUndefined();
  });
  test("size label", () => {
    expect(sizeLabel(4032, 3024)).toBe("4032 × 3024 px");
  });
});

test("a storage-key file name gives way to the alt text", () => {
  expect(displayName("01M4W9MN34FA0WDWHB5FS8YSGJ.jpg", " A garden ")).toBe("A garden");
  expect(displayName("01M4W9MN34FA0WDWHB5FS8YSGJ.jpg", "")).toBe("Library picture");
  expect(displayName("holiday.jpg", "A garden")).toBe("holiday.jpg");
});
